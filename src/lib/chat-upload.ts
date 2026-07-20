import { spawnSync } from "node:child_process";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import Busboy from "busboy";

import { buildChat, getChatsDirectory, refreshManifest } from "@/lib/build-chats";
import { isValidSlug, normalizeSlugInput } from "@/lib/slug";
import { CHAT_META_FILE } from "@/types/built-chat";
import {
  createJobId,
  ensureUploadDirs,
  getUploadTmpDir,
  updateUploadJob,
  writeUploadJob,
  type UploadJob,
} from "@/lib/upload-jobs";

const SOURCE_FILE = "_chat.txt";
const DEFAULT_MAX_UPLOAD_BYTES = 8 * 1024 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 200_000;
const MAX_CONCURRENT_UPLOADS = 1;

let activeUploads = 0;

export function tryAcquireUploadSlot(): boolean {
  if (activeUploads >= MAX_CONCURRENT_UPLOADS) return false;
  activeUploads += 1;
  return true;
}

export function releaseUploadSlot(): void {
  activeUploads = Math.max(0, activeUploads - 1);
}

export function getMaxUploadBytes(): number {
  const raw = process.env.MAX_UPLOAD_BYTES?.trim();
  if (!raw) return DEFAULT_MAX_UPLOAD_BYTES;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_UPLOAD_BYTES;
}

function getMaxUncompressedBytes(): number {
  // Soft zip-bomb guard: uncompressed payload may exceed the ZIP size, but not unboundedly.
  return Math.max(getMaxUploadBytes() * 3, 24 * 1024 * 1024 * 1024);
}

/** When false/0, ZIP upload UI and API are disabled (default: enabled). */
export function isChatUploadEnabled(): boolean {
  const raw = process.env.ALLOW_CHAT_UPLOAD?.trim().toLowerCase();
  if (raw === undefined || raw === "") return true;
  return !(raw === "0" || raw === "false" || raw === "no" || raw === "off");
}

function publicUploadError(error: unknown): string {
  if (!(error instanceof Error)) return "Unbekannter Fehler.";
  const message = error.message;

  // Known, safe user-facing messages from this module.
  if (
    message.startsWith("Im ZIP") ||
    message.startsWith("ZIP ") ||
    message.startsWith("Entpacken") ||
    message.startsWith("Ungültiger") ||
    message.includes("WhatsApp") ||
    message.includes("_chat.txt") ||
    message.includes("zu viele Dateien") ||
    message.includes("zu groß") ||
    message.includes("ungültige Pfade")
  ) {
    return message;
  }

  console.error("Chat-Upload fehlgeschlagen:", error);
  return "Verarbeitung fehlgeschlagen. Bitte ZIP prüfen und erneut versuchen.";
}

async function findChatTxt(rootDir: string): Promise<string | null> {
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__MACOSX" || entry.name.startsWith(".")) continue;
        stack.push(full);
      } else if (entry.isFile() && entry.name === SOURCE_FILE) {
        return full;
      }
    }
  }

  return null;
}

async function copyDirContents(fromDir: string, toDir: string): Promise<void> {
  await fs.mkdir(toDir, { recursive: true });
  const entries = await fs.readdir(fromDir, { withFileTypes: true });
  const resolvedToDir = path.resolve(toDir);

  for (const entry of entries) {
    if (entry.name === "." || entry.name === ".." || entry.name.startsWith(".")) continue;
    const source = path.join(fromDir, entry.name);
    const target = path.join(toDir, entry.name);
    const resolvedTarget = path.resolve(target);

    if (
      !resolvedTarget.startsWith(`${resolvedToDir}${path.sep}`) &&
      resolvedTarget !== resolvedToDir
    ) {
      throw new Error("Ungültiger Dateipfad im Export.");
    }

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyDirContents(source, target);
    } else if (entry.isFile()) {
      await fs.copyFile(source, target);
    }
  }
}

function isUnsafeZipEntryName(name: string): boolean {
  const normalized = name.replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized || normalized.includes("\0")) return true;
  if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) return true;
  const parts = normalized.split("/");
  if (parts.some((part) => part === ".." || part === "")) return true;
  return false;
}

function assertZipArchiveSafe(zipPath: string): void {
  const namesResult = spawnSync("unzip", ["-Z1", zipPath], {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (namesResult.error) {
    throw new Error(
      `Entpacken nicht möglich (${namesResult.error.message}). Im Docker-Image muss „unzip“ installiert sein.`,
    );
  }

  if ((namesResult.status ?? 1) !== 0) {
    throw new Error("ZIP konnte nicht gelesen werden.");
  }

  const names = namesResult.stdout.split(/\r?\n/).filter(Boolean);
  if (names.length === 0) {
    throw new Error("ZIP ist leer.");
  }
  if (names.length > MAX_ZIP_ENTRIES) {
    throw new Error("ZIP enthält zu viele Dateien.");
  }

  for (const name of names) {
    if (isUnsafeZipEntryName(name)) {
      throw new Error("ZIP enthält ungültige Pfade.");
    }
  }

  const listResult = spawnSync("unzip", ["-l", zipPath], {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if ((listResult.status ?? 1) !== 0) {
    throw new Error("ZIP konnte nicht gelesen werden.");
  }

  const totalLine = listResult.stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .at(-1);
  const totalMatch = totalLine?.match(/^\s*(\d+)\s+/);
  if (totalMatch) {
    const uncompressed = Number(totalMatch[1]);
    if (Number.isFinite(uncompressed) && uncompressed > getMaxUncompressedBytes()) {
      throw new Error("ZIP ist nach dem Entpacken zu groß.");
    }
  }
}

async function extractZip(zipPath: string, extractDir: string): Promise<void> {
  await fs.rm(extractDir, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });

  assertZipArchiveSafe(zipPath);

  const result = spawnSync("unzip", ["-q", "-o", zipPath, "-d", extractDir], {
    encoding: "utf-8",
  });

  if (result.error) {
    throw new Error(
      `Entpacken nicht möglich (${result.error.message}). Im Docker-Image muss „unzip“ installiert sein.`,
    );
  }

  if ((result.status ?? 1) !== 0) {
    throw new Error("ZIP konnte nicht entpackt werden.");
  }
}

export async function processUploadedChat(options: {
  jobId: string;
  zipPath: string;
  slug: string;
  title?: string;
  defaultMyName?: string;
}): Promise<void> {
  const { jobId, zipPath, slug, title, defaultMyName } = options;
  const tmpRoot = path.join(getUploadTmpDir(), jobId);
  const extractDir = path.join(tmpRoot, "extract");

  try {
    await updateUploadJob(jobId, {
      status: "extracting",
      message: "Export wird entpackt…",
    });

    await extractZip(zipPath, extractDir);

    const chatTxt = await findChatTxt(extractDir);
    if (!chatTxt) {
      throw new Error(
        "Im ZIP wurde keine _chat.txt gefunden. Bitte einen WhatsApp-Chat-Export verwenden.",
      );
    }

    const exportRoot = path.dirname(chatTxt);
    const chatsDir = getChatsDirectory();
    const targetDir = path.join(chatsDir, slug);

    await fs.mkdir(chatsDir, { recursive: true });
    await fs.rm(targetDir, { recursive: true, force: true });
    await fs.mkdir(targetDir, { recursive: true });
    await copyDirContents(exportRoot, targetDir);

    const meta: Record<string, string> = {};
    if (title?.trim()) meta.title = title.trim();
    if (defaultMyName?.trim()) meta.defaultMyName = defaultMyName.trim();
    if (Object.keys(meta).length > 0) {
      await fs.writeFile(
        path.join(targetDir, CHAT_META_FILE),
        `${JSON.stringify(meta, null, 2)}\n`,
        "utf-8",
      );
    }

    await updateUploadJob(jobId, {
      status: "building",
      message: "Nachrichten werden vorbereitet…",
    });

    const built = await buildChat(slug);
    await refreshManifest();

    await updateUploadJob(jobId, {
      status: "done",
      message: "Chat ist bereit.",
      messageCount: built.messageCount,
      mediaCount: built.mediaFiles.length,
      title: built.title,
    });
  } catch (error) {
    await updateUploadJob(jobId, {
      status: "error",
      message: "Upload fehlgeschlagen.",
      error: publicUploadError(error),
    });
  } finally {
    releaseUploadSlot();
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(zipPath, { force: true }).catch(() => undefined);
  }
}

export type UploadFields = {
  slug: string;
  title?: string;
  defaultMyName?: string;
};

export async function parseUploadRequest(request: Request): Promise<{
  job: UploadJob;
  zipPath: string;
  fields: UploadFields;
}> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    throw new Error("Bitte eine ZIP-Datei als Formular-Upload senden.");
  }
  if (!request.body) {
    throw new Error("Leerer Upload.");
  }

  await ensureUploadDirs();

  const jobId = createJobId();
  const zipPath = path.join(getUploadTmpDir(), `${jobId}.zip`);
  const maxBytes = getMaxUploadBytes();

  const fieldsRaw: Record<string, string> = {};
  let fileReceived = false;
  let fileTooLarge = false;

  await new Promise<void>((resolve, reject) => {
    const busboy = Busboy({
      headers: { "content-type": contentType },
      limits: { files: 1, fileSize: maxBytes },
    });

    let filePipeline: Promise<void> | null = null;

    busboy.on("file", (fieldname, fileStream, info) => {
      if (fieldname !== "file") {
        fileStream.resume();
        return;
      }

      const filename = info.filename || "";
      if (!filename.toLowerCase().endsWith(".zip")) {
        fileStream.resume();
        reject(new Error("Nur ZIP-Dateien sind erlaubt (WhatsApp-Export)."));
        return;
      }

      fileReceived = true;
      const out = createWriteStream(zipPath);

      fileStream.on("limit", () => {
        fileTooLarge = true;
      });

      filePipeline = pipeline(fileStream, out);
    });

    busboy.on("field", (name, value) => {
      fieldsRaw[name] = value;
    });

    busboy.on("error", reject);
    busboy.on("finish", () => {
      Promise.resolve(filePipeline)
        .then(() => resolve())
        .catch(reject);
    });

    const nodeStream = Readable.fromWeb(request.body as import("stream/web").ReadableStream);
    nodeStream.on("error", reject);
    nodeStream.pipe(busboy);
  });

  if (fileTooLarge) {
    await fs.rm(zipPath, { force: true }).catch(() => undefined);
    throw new Error(`Die Datei ist zu groß (max. ${Math.round(maxBytes / (1024 * 1024))} MB).`);
  }

  if (!fileReceived) {
    throw new Error("Keine ZIP-Datei im Upload gefunden.");
  }

  const slug = normalizeSlugInput(fieldsRaw.slug || fieldsRaw.name || "");
  if (!slug || !isValidSlug(slug)) {
    await fs.rm(zipPath, { force: true }).catch(() => undefined);
    throw new Error(
      "Bitte einen gültigen Chat-Namen angeben (nur Kleinbuchstaben, Zahlen, Bindestriche).",
    );
  }

  const fields: UploadFields = {
    slug,
    title: fieldsRaw.title?.trim() || undefined,
    defaultMyName: fieldsRaw.defaultMyName?.trim() || undefined,
  };

  const job: UploadJob = {
    id: jobId,
    status: "uploading",
    slug,
    title: fields.title,
    message: "Upload empfangen, Verarbeitung startet…",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writeUploadJob(job);
  return { job, zipPath, fields };
}

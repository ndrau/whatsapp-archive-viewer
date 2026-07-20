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

export function getMaxUploadBytes(): number {
  const raw = process.env.MAX_UPLOAD_BYTES?.trim();
  if (!raw) return DEFAULT_MAX_UPLOAD_BYTES;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_UPLOAD_BYTES;
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

    if (entry.isDirectory()) {
      await copyDirContents(source, target);
    } else if (entry.isFile()) {
      await fs.copyFile(source, target);
    }
  }
}

async function extractZip(zipPath: string, extractDir: string): Promise<void> {
  await fs.rm(extractDir, { recursive: true, force: true });
  await fs.mkdir(extractDir, { recursive: true });

  const result = spawnSync("unzip", ["-q", "-o", zipPath, "-d", extractDir], {
    encoding: "utf-8",
  });

  if (result.error) {
    throw new Error(
      `Entpacken nicht möglich (${result.error.message}). Im Docker-Image muss „unzip“ installiert sein.`,
    );
  }

  if ((result.status ?? 1) !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(detail || "ZIP konnte nicht entpackt werden.");
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
      error: error instanceof Error ? error.message : "Unbekannter Fehler.",
    });
  } finally {
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

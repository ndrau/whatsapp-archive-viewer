import { promises as fs } from "fs";
import path from "path";

import { parseWhatsAppChat } from "@/lib/whatsapp-parser";
import {
  BUILT_CHAT_FILE,
  BUILT_MANIFEST_FILE,
  CHAT_META_FILE,
  type BuiltChatData,
  type BuiltChatManifest,
  type BuiltChatManifestEntry,
} from "@/types/built-chat";

const SOURCE_CHATS_DIR = path.join(process.cwd(), "chats");
const BUILT_CHATS_DIR = path.join(process.cwd(), ".built", "chats");
const SOURCE_FILE = "_chat.txt";
const SOURCE_IGNORED_FILES = new Set([SOURCE_FILE, CHAT_META_FILE, BUILT_CHAT_FILE, "manifest.json"]);

export interface ChatMeta {
  title?: string;
  defaultMyName?: string;
}

function isSourceChatDirectory(name: string): boolean {
  return !name.startsWith(".");
}

export function getSourceChatsDirectory(): string {
  return SOURCE_CHATS_DIR;
}

export function getBuiltChatsDirectory(): string {
  return BUILT_CHATS_DIR;
}

function getBuiltChatPath(slug: string): string {
  return path.join(BUILT_CHATS_DIR, slug, BUILT_CHAT_FILE);
}

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

async function readChatMeta(sourceDir: string): Promise<ChatMeta> {
  const metaPath = path.join(sourceDir, CHAT_META_FILE);

  try {
    const raw = await fs.readFile(metaPath, "utf-8");
    return JSON.parse(raw) as ChatMeta;
  } catch {
    return {};
  }
}

async function listSourceMediaFiles(sourceDir: string): Promise<string[]> {
  const files = await fs.readdir(sourceDir);
  return files.filter((file) => !SOURCE_IGNORED_FILES.has(file) && !file.startsWith("."));
}

export async function buildChat(slug: string): Promise<BuiltChatData> {
  const sourceDir = path.join(SOURCE_CHATS_DIR, slug);
  const sourcePath = path.join(sourceDir, SOURCE_FILE);
  const [text, mediaFiles, meta] = await Promise.all([
    fs.readFile(sourcePath, "utf-8"),
    listSourceMediaFiles(sourceDir),
    readChatMeta(sourceDir),
  ]);

  const parsed = parseWhatsAppChat(text, SOURCE_FILE);
  const builtAt = new Date().toISOString();
  const title = meta.title ?? parsed.chatTitle ?? titleFromSlug(slug);

  const built: BuiltChatData = {
    slug,
    title,
    builtAt,
    sourceFile: SOURCE_FILE,
    sourceDir: `chats/${slug}`,
    participants: parsed.participants,
    defaultMyName: meta.defaultMyName,
    mediaFiles,
    messages: parsed.messages.map((message) => ({
      id: message.id,
      date: message.date.toISOString(),
      sender: message.sender,
      text: message.text,
      attachment: message.attachment,
    })),
  };

  const builtDir = path.join(BUILT_CHATS_DIR, slug);
  await fs.mkdir(builtDir, { recursive: true });
  await fs.writeFile(getBuiltChatPath(slug), `${JSON.stringify(built, null, 2)}\n`, "utf-8");

  return built;
}

export async function buildAllChats(): Promise<BuiltChatManifest> {
  await fs.mkdir(SOURCE_CHATS_DIR, { recursive: true });
  await fs.mkdir(BUILT_CHATS_DIR, { recursive: true });

  const entries = await fs.readdir(SOURCE_CHATS_DIR, { withFileTypes: true });
  const chats: BuiltChatManifestEntry[] = [];
  const builtSlugs = new Set<string>();

  for (const entry of entries) {
    if (!entry.isDirectory() || !isSourceChatDirectory(entry.name)) continue;

    const sourcePath = path.join(SOURCE_CHATS_DIR, entry.name, SOURCE_FILE);

    try {
      await fs.access(sourcePath);
    } catch {
      continue;
    }

    const built = await buildChat(entry.name);
    builtSlugs.add(entry.name);

    chats.push({
      slug: built.slug,
      title: built.title,
      messageCount: built.messages.length,
      mediaCount: built.mediaFiles.length,
      participants: built.participants,
      builtAt: built.builtAt,
      defaultMyName: built.defaultMyName,
    });
  }

  const manifest: BuiltChatManifest = {
    builtAt: new Date().toISOString(),
    chats: chats.sort((a, b) => a.title.localeCompare(b.title, "de")),
  };

  await fs.writeFile(
    path.join(BUILT_CHATS_DIR, BUILT_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf-8",
  );

  await cleanupStaleBuiltChats(builtSlugs);

  return manifest;
}

async function cleanupStaleBuiltChats(activeSlugs: Set<string>) {
  const entries = await fs.readdir(BUILT_CHATS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (activeSlugs.has(entry.name)) continue;
    await fs.rm(path.join(BUILT_CHATS_DIR, entry.name), { recursive: true, force: true });
  }
}

export async function readBuiltChat(slug: string): Promise<BuiltChatData | null> {
  try {
    const raw = await fs.readFile(getBuiltChatPath(slug), "utf-8");
    return JSON.parse(raw) as BuiltChatData;
  } catch {
    return null;
  }
}

export async function readBuiltManifest(): Promise<BuiltChatManifest | null> {
  try {
    const raw = await fs.readFile(path.join(BUILT_CHATS_DIR, BUILT_MANIFEST_FILE), "utf-8");
    return JSON.parse(raw) as BuiltChatManifest;
  } catch {
    return null;
  }
}

export function getChatsDirectory(): string {
  return SOURCE_CHATS_DIR;
}

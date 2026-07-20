import { promises as fs } from "fs";
import path from "path";

import { chunkIdFromDate, dayKeyFromDate } from "@/lib/chat-day";
import { parseWhatsAppChat } from "@/lib/whatsapp-parser";
import {
  BUILT_CHUNKS_DIR,
  BUILT_INDEX_FILE,
  BUILT_MANIFEST_FILE,
  BUILT_SEARCH_FILE,
  CHAT_META_FILE,
  type BuiltChatIndex,
  type BuiltChatManifest,
  type BuiltChatManifestEntry,
  type BuiltDayIndex,
  type BuiltMessageRecord,
  type BuiltSearchEntry,
} from "@/types/built-chat";

const SOURCE_CHATS_DIR = path.join(process.cwd(), "chats");
const BUILT_CHATS_DIR = path.join(process.cwd(), ".built", "chats");
const SOURCE_FILE = "_chat.txt";
const SOURCE_IGNORED_FILES = new Set([
  SOURCE_FILE,
  CHAT_META_FILE,
  BUILT_INDEX_FILE,
  BUILT_SEARCH_FILE,
  BUILT_MANIFEST_FILE,
  BUILT_CHUNKS_DIR,
]);

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

async function buildMediaBytesLookup(
  sourceDir: string,
  mediaFiles: string[],
): Promise<(filename: string) => number | undefined> {
  const byName = new Map<string, number>();
  const byLower = new Map<string, number>();

  await Promise.all(
    mediaFiles.map(async (file) => {
      try {
        const stat = await fs.stat(path.join(sourceDir, file));
        byName.set(file, stat.size);
        byLower.set(file.toLowerCase(), stat.size);
      } catch {
        // Missing media files are fine — parser falls back to structural dedupe.
      }
    }),
  );

  return (filename: string) => byName.get(filename) ?? byLower.get(filename.toLowerCase());
}

function serializeMessage(message: {
  id: string;
  date: Date;
  sender: string;
  text: string;
  edited?: boolean;
  attachment?: BuiltMessageRecord["attachment"];
}): BuiltMessageRecord {
  return {
    id: message.id,
    date: message.date.toISOString(),
    sender: message.sender,
    text: message.text,
    edited: message.edited,
    attachment: message.attachment,
  };
}

function buildDayIndex(messages: BuiltMessageRecord[]): BuiltDayIndex[] {
  const days: BuiltDayIndex[] = [];

  for (const message of messages) {
    const date = new Date(message.date);
    const key = dayKeyFromDate(date);
    const lastDay = days.at(-1);

    if (!lastDay || lastDay.key !== key) {
      days.push({
        key,
        date: new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString(),
        messageCount: 1,
        chunkId: chunkIdFromDate(date),
      });
    } else {
      lastDay.messageCount += 1;
    }
  }

  return days;
}

function buildSearchEntries(messages: BuiltMessageRecord[]): BuiltSearchEntry[] {
  return messages.map((message) => ({
    id: message.id,
    date: message.date,
    sender: message.sender,
    text: message.text,
    attachment: message.attachment?.filename,
  }));
}

export async function buildChat(slug: string): Promise<BuiltChatIndex> {
  const sourceDir = path.join(SOURCE_CHATS_DIR, slug);
  const sourcePath = path.join(sourceDir, SOURCE_FILE);
  const [text, mediaFiles, meta] = await Promise.all([
    fs.readFile(sourcePath, "utf-8"),
    listSourceMediaFiles(sourceDir),
    readChatMeta(sourceDir),
  ]);

  const getMediaBytes = await buildMediaBytesLookup(sourceDir, mediaFiles);
  const parsed = parseWhatsAppChat(text, SOURCE_FILE, { getMediaBytes });
  const builtAt = new Date().toISOString();
  const title = meta.title ?? parsed.chatTitle ?? titleFromSlug(slug);
  const messages = parsed.messages.map(serializeMessage);
  const days = buildDayIndex(messages);

  const chunkMap = new Map<string, BuiltMessageRecord[]>();
  for (const message of messages) {
    const chunkId = chunkIdFromDate(new Date(message.date));
    const bucket = chunkMap.get(chunkId);
    if (bucket) bucket.push(message);
    else chunkMap.set(chunkId, [message]);
  }

  const builtDir = path.join(BUILT_CHATS_DIR, slug);
  const chunksDir = path.join(builtDir, BUILT_CHUNKS_DIR);
  await fs.mkdir(chunksDir, { recursive: true });

  const chunks = [...chunkMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, chunkMessages]) => {
      const file = `${BUILT_CHUNKS_DIR}/${id}.json`;
      return {
        id,
        file,
        messageCount: chunkMessages.length,
        startDate: chunkMessages[0].date,
        endDate: chunkMessages.at(-1)!.date,
        messages: chunkMessages,
      };
    });

  await Promise.all(
    chunks.map((chunk) =>
      fs.writeFile(
        path.join(builtDir, chunk.file),
        `${JSON.stringify({ id: chunk.id, messages: chunk.messages }, null, 2)}\n`,
        "utf-8",
      ),
    ),
  );

  const index: BuiltChatIndex = {
    slug,
    title,
    builtAt,
    sourceFile: SOURCE_FILE,
    sourceDir: `chats/${slug}`,
    participants: parsed.participants,
    defaultMyName: meta.defaultMyName,
    mediaFiles,
    messageCount: messages.length,
    days,
    chunks: chunks.map(({ id, file, messageCount, startDate, endDate }) => ({
      id,
      file,
      messageCount,
      startDate,
      endDate,
    })),
  };

  const search = { entries: buildSearchEntries(messages) };

  await fs.writeFile(
    path.join(builtDir, BUILT_INDEX_FILE),
    `${JSON.stringify(index, null, 2)}\n`,
    "utf-8",
  );
  await fs.writeFile(
    path.join(builtDir, BUILT_SEARCH_FILE),
    `${JSON.stringify(search)}\n`,
    "utf-8",
  );

  await fs.rm(path.join(builtDir, "chat.json"), { force: true });

  return index;
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
      messageCount: built.messageCount,
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

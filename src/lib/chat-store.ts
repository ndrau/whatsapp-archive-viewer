import { promises as fs } from "fs";
import path from "path";

import {
  BUILT_INDEX_FILE,
  BUILT_SEARCH_FILE,
  type BuiltChatChunk,
  type BuiltChatIndex,
  type BuiltMessageRecord,
  type BuiltSearchEntry,
  type BuiltSearchIndex,
} from "@/types/built-chat";
import { dayKeyFromIso, selectDayRange, selectDayWindow } from "@/lib/chat-day";
import { resolveSafePath } from "@/lib/slug";

const BUILT_CHATS_DIR = path.join(process.cwd(), ".built", "chats");

function getChatDir(slug: string): string {
  return resolveSafePath(BUILT_CHATS_DIR, slug);
}

export async function readBuiltChatIndex(slug: string): Promise<BuiltChatIndex | null> {
  try {
    const raw = await fs.readFile(path.join(getChatDir(slug), BUILT_INDEX_FILE), "utf-8");
    return JSON.parse(raw) as BuiltChatIndex;
  } catch {
    return null;
  }
}

export async function readBuiltChunk(slug: string, chunkFile: string): Promise<BuiltChatChunk | null> {
  try {
    const filePath = resolveSafePath(BUILT_CHATS_DIR, slug, chunkFile);
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as BuiltChatChunk;
  } catch {
    return null;
  }
}

async function readSearchIndex(slug: string): Promise<BuiltSearchEntry[]> {
  try {
    const raw = await fs.readFile(path.join(getChatDir(slug), BUILT_SEARCH_FILE), "utf-8");
    const parsed = JSON.parse(raw) as BuiltSearchIndex;
    return parsed.entries;
  } catch {
    return [];
  }
}

async function loadMessagesForDays(
  index: BuiltChatIndex,
  slug: string,
  windowDays: BuiltChatIndex["days"],
): Promise<BuiltMessageRecord[]> {
  if (windowDays.length === 0) return [];

  const dayKeySet = new Set(windowDays.map((day) => day.key));
  const chunkIds = [...new Set(windowDays.map((day) => day.chunkId))];
  const chunkFiles = new Map(
    index.chunks.filter((chunk) => chunkIds.includes(chunk.id)).map((chunk) => [chunk.id, chunk.file]),
  );

  const messages: BuiltMessageRecord[] = [];

  for (const chunkId of chunkIds) {
    const chunkFile = chunkFiles.get(chunkId);
    if (!chunkFile) continue;

    const chunk = await readBuiltChunk(slug, chunkFile);
    if (!chunk) continue;

    for (const message of chunk.messages) {
      if (dayKeySet.has(dayKeyFromIso(message.date))) {
        messages.push(message);
      }
    }
  }

  messages.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return messages;
}

export async function loadMessagesForDayWindow(
  slug: string,
  centerDayKey: string | undefined,
  radius: number,
): Promise<{ messages: BuiltMessageRecord[]; dayKeys: string[] }> {
  const index = await readBuiltChatIndex(slug);
  if (!index) {
    throw new Error("Chat-Index nicht gefunden.");
  }

  const windowDays = selectDayWindow(index.days, centerDayKey, radius);
  const messages = await loadMessagesForDays(index, slug, windowDays);

  return {
    messages,
    dayKeys: windowDays.map((day) => day.key),
  };
}

export async function loadMessagesForDayRange(
  slug: string,
  fromDayKey: string,
  toDayKey: string,
): Promise<{ messages: BuiltMessageRecord[]; dayKeys: string[] }> {
  const index = await readBuiltChatIndex(slug);
  if (!index) {
    throw new Error("Chat-Index nicht gefunden.");
  }

  const windowDays = selectDayRange(index.days, fromDayKey, toDayKey);
  const messages = await loadMessagesForDays(index, slug, windowDays);

  return {
    messages,
    dayKeys: windowDays.map((day) => day.key),
  };
}

export async function loadAllBuiltMessages(slug: string): Promise<BuiltMessageRecord[]> {
  const index = await readBuiltChatIndex(slug);
  if (!index) {
    throw new Error("Chat-Index nicht gefunden.");
  }

  const messages: BuiltMessageRecord[] = [];

  for (const chunkMeta of index.chunks) {
    const chunk = await readBuiltChunk(slug, chunkMeta.file);
    if (!chunk) continue;
    messages.push(...chunk.messages);
  }

  return messages;
}

export async function searchBuiltChat(
  slug: string,
  query: string,
  limit = 200,
): Promise<BuiltSearchEntry[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  const entries = await readSearchIndex(slug);

  return entries
    .filter((entry) => {
      const haystack = [entry.sender, entry.text, entry.attachment ?? ""].join(" ").toLowerCase();
      return haystack.includes(normalized);
    })
    .slice(0, limit);
}

export function toChatMessage(record: BuiltMessageRecord) {
  return {
    ...record,
    date: new Date(record.date),
  };
}

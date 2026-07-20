export interface BuiltChatManifestEntry {
  slug: string;
  title: string;
  messageCount: number;
  mediaCount: number;
  participants: string[];
  builtAt: string;
  defaultMyName?: string;
}

export interface BuiltChatManifest {
  builtAt: string;
  chats: BuiltChatManifestEntry[];
}

export interface BuiltMessageRecord {
  id: string;
  date: string;
  sender: string;
  text: string;
  edited?: boolean;
  attachment?: {
    kind: "image" | "video" | "audio" | "document" | "contact" | "sticker";
    filename: string;
    omitted: boolean;
  };
}

export interface BuiltDayIndex {
  key: string;
  date: string;
  messageCount: number;
  chunkId: string;
}

export interface BuiltChunkIndex {
  id: string;
  file: string;
  messageCount: number;
  startDate: string;
  endDate: string;
}

export interface BuiltChatIndex {
  slug: string;
  title: string;
  builtAt: string;
  sourceFile: string;
  sourceDir: string;
  participants: string[];
  defaultMyName?: string;
  mediaFiles: string[];
  messageCount: number;
  days: BuiltDayIndex[];
  chunks: BuiltChunkIndex[];
}

export interface BuiltChatChunk {
  id: string;
  messages: BuiltMessageRecord[];
}

export interface BuiltSearchEntry {
  id: string;
  date: string;
  sender: string;
  text: string;
  attachment?: string;
}

export interface BuiltSearchIndex {
  entries: BuiltSearchEntry[];
}

/** @deprecated Use BuiltChatIndex + chunk files instead */
export interface BuiltChatData {
  slug: string;
  title: string;
  builtAt: string;
  sourceFile: string;
  sourceDir: string;
  participants: string[];
  defaultMyName?: string;
  mediaFiles: string[];
  messages: BuiltMessageRecord[];
}

export const BUILT_INDEX_FILE = "index.json";
export const BUILT_SEARCH_FILE = "search.json";
export const BUILT_CHUNKS_DIR = "chunks";
export const BUILT_MANIFEST_FILE = "manifest.json";
export const CHAT_META_FILE = "meta.json";

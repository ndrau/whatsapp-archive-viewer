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

export interface BuiltChatData {
  slug: string;
  title: string;
  builtAt: string;
  sourceFile: string;
  sourceDir: string;
  participants: string[];
  defaultMyName?: string;
  mediaFiles: string[];
  messages: Array<{
    id: string;
    date: string;
    sender: string;
    text: string;
    attachment?: {
      kind: "image" | "video" | "audio" | "document" | "contact" | "sticker";
      filename: string;
      omitted: boolean;
    };
  }>;
}

export const BUILT_CHAT_FILE = "chat.json";
export const BUILT_MANIFEST_FILE = "manifest.json";
export const CHAT_META_FILE = "meta.json";

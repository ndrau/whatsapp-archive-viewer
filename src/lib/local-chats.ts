import { promises as fs } from "fs";
import path from "path";

import { readBuiltChatIndex } from "@/lib/chat-store";
import { isValidSlug, resolveSafePath } from "@/lib/slug";

const CHATS_DIR = path.join(process.cwd(), "chats");

export interface LocalChatSummary {
  slug: string;
  title: string;
  messageCount: number;
  participants: string[];
  mediaCount: number;
}

export { isValidSlug };

export function getChatsDirectory(): string {
  return CHATS_DIR;
}

export function resolveChatDirectory(slug: string): string {
  return resolveSafePath(CHATS_DIR, slug);
}

export async function listLocalChats(): Promise<LocalChatSummary[]> {
  const { readBuiltManifest } = await import("@/lib/build-chats");
  const manifest = await readBuiltManifest();

  if (manifest) {
    return manifest.chats.map((chat) => ({
      slug: chat.slug,
      title: chat.title,
      messageCount: chat.messageCount,
      participants: chat.participants,
      mediaCount: chat.mediaCount,
    }));
  }

  return [];
}

export async function readLocalChat(slug: string) {
  const index = await readBuiltChatIndex(slug);

  if (!index) {
    throw new Error("Chat-Index nicht gefunden.");
  }

  return {
    slug: index.slug,
    chatTitle: index.title,
    defaultMyName: index.defaultMyName,
    participants: index.participants,
    mediaFiles: index.mediaFiles,
    messageCount: index.messageCount,
    days: index.days,
    chunks: index.chunks,
  };
}

export async function resolveLocalMediaPath(slug: string, filename: string): Promise<string> {
  const chatDir = resolveChatDirectory(slug);
  const safeName = path.basename(filename);

  if (!safeName || safeName === "_chat.txt") {
    throw new Error("Ungültige Mediendatei.");
  }

  const directPath = path.join(chatDir, safeName);
  try {
    await fs.access(directPath);
    return directPath;
  } catch {
    // WhatsApp exports sometimes reference a basename while the folder uses the same name.
  }

  const files = await fs.readdir(chatDir);
  const match = files.find((file) => file.toLowerCase() === safeName.toLowerCase());

  if (!match) {
    throw new Error("Mediendatei nicht gefunden.");
  }

  return path.join(chatDir, match);
}

export function getMediaContentType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();

  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".heic":
      return "image/heic";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".3gp":
      return "video/3gpp";
    case ".opus":
      return "audio/opus";
    case ".ogg":
      return "audio/ogg";
    case ".m4a":
      return "audio/mp4";
    case ".aac":
      return "audio/aac";
    case ".mp3":
      return "audio/mpeg";
    case ".amr":
      return "audio/amr";
    case ".pdf":
      return "application/pdf";
    case ".vcf":
      return "text/vcard";
    default:
      return "application/octet-stream";
  }
}

import { promises as fs } from "fs";
import path from "path";

import { readBuiltChat, readBuiltManifest } from "@/lib/build-chats";
import { parseWhatsAppChat } from "@/lib/whatsapp-parser";

const CHATS_DIR = path.join(process.cwd(), "chats");

export interface LocalChatSummary {
  slug: string;
  title: string;
  messageCount: number;
  participants: string[];
  mediaCount: number;
}

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug);
}

export function getChatsDirectory(): string {
  return CHATS_DIR;
}

export function resolveChatDirectory(slug: string): string {
  if (!isValidSlug(slug)) {
    throw new Error("Ungültiger Chat-Name.");
  }

  const chatDir = path.join(CHATS_DIR, slug);
  const resolved = path.resolve(chatDir);
  const root = path.resolve(CHATS_DIR);

  if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
    throw new Error("Ungültiger Chat-Pfad.");
  }

  return resolved;
}

export async function listLocalChats(): Promise<LocalChatSummary[]> {
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
  const built = await readBuiltChat(slug);

  if (built) {
    return {
      slug: built.slug,
      chatTitle: built.title,
      defaultMyName: built.defaultMyName,
      participants: built.participants,
      mediaFiles: built.mediaFiles,
      messages: built.messages.map((message) => ({
        ...message,
        date: new Date(message.date),
      })),
    };
  }

  const chatDir = resolveChatDirectory(slug);
  const chatFile = path.join(chatDir, "_chat.txt");
  const text = await fs.readFile(chatFile, "utf-8");
  const parsed = parseWhatsAppChat(text, "_chat.txt");
  const mediaFiles = (await fs.readdir(chatDir)).filter(
    (file) => !["_chat.txt", "meta.json", "chat.json", "manifest.json"].includes(file) && !file.startsWith("."),
  );

  return {
    slug,
    chatTitle: parsed.chatTitle,
    participants: parsed.participants,
    mediaFiles,
    messages: parsed.messages,
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

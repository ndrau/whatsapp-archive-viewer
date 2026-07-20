import JSZip from "jszip";

import { parseWhatsAppChat } from "@/lib/whatsapp-parser";
import type { WhatsAppExport } from "@/types/whatsapp";

function isChatTextFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === "_chat.txt" || lower.endsWith(".txt");
}

function scoreChatFile(name: string): number {
  const lower = name.toLowerCase();
  if (lower.endsWith("/_chat.txt") || lower === "_chat.txt") return 100;
  if (lower.includes("whatsapp chat")) return 80;
  if (lower.endsWith(".txt")) return 10;
  return 0;
}

async function buildExport(
  chatText: string,
  chatFileName: string,
  mediaFiles: Map<string, Blob>,
): Promise<WhatsAppExport> {
  const parsed = parseWhatsAppChat(chatText, chatFileName);

  return {
    chatTitle: parsed.chatTitle,
    messages: parsed.messages,
    mediaFiles,
    participants: parsed.participants,
  };
}

export async function loadWhatsAppZip(file: File): Promise<WhatsAppExport> {
  const zip = await JSZip.loadAsync(file);
  const mediaFiles = new Map<string, Blob>();

  let bestChatPath = "";
  let bestChatScore = -1;
  let chatText = "";

  const entries = Object.values(zip.files).filter((entry) => !entry.dir);

  for (const entry of entries) {
    const path = entry.name;
    const fileName = path.split("/").pop() ?? path;

    if (isChatTextFile(fileName)) {
      const score = scoreChatFile(path);
      if (score > bestChatScore) {
        bestChatScore = score;
        bestChatPath = path;
        chatText = await entry.async("text");
      }
      continue;
    }

    const blob = await entry.async("blob");
    mediaFiles.set(path, blob);
    mediaFiles.set(fileName, blob);
  }

  if (!chatText) {
    throw new Error(
      "Keine Chat-Textdatei gefunden. Erwartet wird _chat.txt im ZIP-Export.",
    );
  }

  return buildExport(chatText, bestChatPath.split("/").pop() ?? "_chat.txt", mediaFiles);
}

export async function loadWhatsAppFolder(files: FileList | File[]): Promise<WhatsAppExport> {
  const fileArray = [...files];
  const mediaFiles = new Map<string, Blob>();

  let bestChatFile: File | null = null;
  let bestChatScore = -1;
  let chatText = "";

  for (const file of fileArray) {
    const relativePath = file.webkitRelativePath || file.name;
    const fileName = file.name;

    if (isChatTextFile(fileName)) {
      const score = scoreChatFile(relativePath);
      if (score > bestChatScore) {
        bestChatScore = score;
        bestChatFile = file;
        chatText = await file.text();
      }
      continue;
    }

    mediaFiles.set(relativePath, file);
    mediaFiles.set(fileName, file);
  }

  if (!chatText || !bestChatFile) {
    throw new Error(
      "Keine Chat-Textdatei gefunden. Ordner muss _chat.txt enthalten.",
    );
  }

  return buildExport(chatText, bestChatFile.name, mediaFiles);
}

export async function loadWhatsAppTextWithMedia(
  textFile: File,
  mediaFilesInput: FileList | File[],
): Promise<WhatsAppExport> {
  const chatText = await textFile.text();
  const mediaFiles = new Map<string, Blob>();

  for (const file of [...mediaFilesInput]) {
    const relativePath = file.webkitRelativePath || file.name;
    mediaFiles.set(relativePath, file);
    mediaFiles.set(file.name, file);
  }

  return buildExport(chatText, textFile.name, mediaFiles);
}

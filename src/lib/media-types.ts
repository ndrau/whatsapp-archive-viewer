import type { MediaKind, WhatsAppExport } from "@/types/whatsapp";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "3gp", "mkv", "webm"]);
const AUDIO_EXTENSIONS = new Set(["opus", "ogg", "m4a", "aac", "mp3", "amr", "caf"]);
const DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "zip",
  "rar",
]);
const CONTACT_EXTENSIONS = new Set(["vcf"]);
const STICKER_EXTENSIONS = new Set(["webp"]);

export function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? (parts.at(-1)?.toLowerCase() ?? "") : "";
}

export function getMediaKind(filename: string): MediaKind {
  const ext = getExtension(filename);
  const lower = filename.toLowerCase();

  if (STICKER_EXTENSIONS.has(ext) && lower.includes("sticker")) {
    return "sticker";
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return "image";
  }
  if (VIDEO_EXTENSIONS.has(ext)) {
    return "video";
  }
  if (AUDIO_EXTENSIONS.has(ext)) {
    return "audio";
  }
  if (CONTACT_EXTENSIONS.has(ext)) {
    return "contact";
  }
  if (DOCUMENT_EXTENSIONS.has(ext)) {
    return "document";
  }

  if (lower.includes("ptt") || lower.includes("audio")) {
    return "audio";
  }

  return "document";
}

export function isVoiceMessage(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    lower.includes("ptt") ||
    lower.includes("-audio-") ||
    lower.endsWith(".opus") ||
    lower.includes("sprachnachricht")
  );
}

export function findMediaBlob(
  filename: string,
  mediaFiles: Map<string, Blob>,
): Blob | undefined {

  const lower = filename.toLowerCase();

  for (const [key, blob] of mediaFiles.entries()) {
    if (key.toLowerCase() === lower) {
      return blob;
    }
  }

  for (const [key, blob] of mediaFiles.entries()) {
    const base = key.split("/").pop()?.toLowerCase();
    if (base === lower) {
      return blob;
    }
  }

  for (const [key, blob] of mediaFiles.entries()) {
    if (key.toLowerCase().endsWith(`/${lower}`) || key.toLowerCase().endsWith(lower)) {
      return blob;
    }
  }

  return undefined;
}

export function findMediaInIndex(filename: string, mediaIndex?: string[]): boolean {
  if (!mediaIndex?.length) return false;

  const lower = filename.toLowerCase();

  if (mediaIndex.some((file) => file.toLowerCase() === lower)) {
    return true;
  }

  return mediaIndex.some((file) => file.split("/").pop()?.toLowerCase() === lower);
}

export function buildMediaUrl(
  filename: string,
  exportData: Pick<WhatsAppExport, "mediaBaseUrl" | "mediaFiles">,
): string | undefined {
  if (exportData.mediaBaseUrl) {
    return `${exportData.mediaBaseUrl}/${encodeURIComponent(filename)}`;
  }

  const blob = findMediaBlob(filename, exportData.mediaFiles);
  if (!blob) return undefined;

  return URL.createObjectURL(blob);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

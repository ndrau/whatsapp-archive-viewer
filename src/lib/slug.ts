import path from "path";

import { isValidSlug } from "@/lib/slug-name";

export { isValidSlug, normalizeSlugInput, titleToSlug } from "@/lib/slug-name";

/**
 * Resolve `root/slug[/relative]` and reject path traversal.
 * `relative` may contain nested segments (e.g. `chunks/2026-07.json`) but never `..`.
 */
export function resolveSafePath(rootDir: string, slug: string, relativeFile?: string): string {
  if (!isValidSlug(slug)) {
    throw new Error("Ungültiger Chat-Name.");
  }

  const root = path.resolve(rootDir);
  const chatDir = path.resolve(root, slug);

  if (!chatDir.startsWith(`${root}${path.sep}`) && chatDir !== root) {
    throw new Error("Ungültiger Chat-Pfad.");
  }

  if (!relativeFile) return chatDir;

  if (path.isAbsolute(relativeFile) || relativeFile.split(/[/\\]/).includes("..")) {
    throw new Error("Ungültiger Dateipfad.");
  }

  const full = path.resolve(chatDir, relativeFile);
  if (!full.startsWith(`${chatDir}${path.sep}`) && full !== chatDir) {
    throw new Error("Ungültiger Dateipfad.");
  }

  return full;
}

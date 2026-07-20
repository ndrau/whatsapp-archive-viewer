import path from "path";

/** Chat folder names are lowercase slug-safe segments only. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug);
}

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

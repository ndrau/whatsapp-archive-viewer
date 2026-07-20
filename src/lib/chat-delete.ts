import { promises as fs } from "fs";

import {
  getBuiltChatsDirectory,
  getSourceChatsDirectory,
  refreshManifest,
} from "@/lib/build-chats";
import { isValidSlug, resolveSafePath } from "@/lib/slug";

/** When true/1/yes/on, chat delete UI and API are enabled (default: disabled). */
export function isChatDeleteEnabled(): boolean {
  const raw = process.env.ALLOW_CHAT_DELETE?.trim().toLowerCase();
  if (raw === undefined || raw === "") return false;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export async function deleteChat(slug: string): Promise<{ slug: string }> {
  if (!isChatDeleteEnabled()) {
    throw new Error("Chat-Löschen ist deaktiviert.");
  }

  if (!isValidSlug(slug)) {
    throw new Error("Ungültiger Chat-Name.");
  }

  const sourceDir = resolveSafePath(getSourceChatsDirectory(), slug);
  const builtDir = resolveSafePath(getBuiltChatsDirectory(), slug);

  const sourceExists = await pathExists(sourceDir);
  const builtExists = await pathExists(builtDir);

  if (!sourceExists && !builtExists) {
    throw new Error("Chat nicht gefunden.");
  }

  // Remove source first so a crashed mid-delete leaves orphan built data,
  // which refreshManifest / cleanupStaleBuiltChats can still reconcile.
  if (sourceExists) {
    await fs.rm(sourceDir, { recursive: true, force: true });
  }
  if (builtExists) {
    await fs.rm(builtDir, { recursive: true, force: true });
  }

  await refreshManifest();
  return { slug };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

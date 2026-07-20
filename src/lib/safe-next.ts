/** Allow only same-origin relative paths for post-login redirects. */
export function safeInternalPath(next: string | null | undefined): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  if (next.includes("\\") || next.includes("://")) return "/";
  if (/[\u0000-\u001f\u007f]/.test(next)) return "/";
  return next;
}

/** Chat folder names are lowercase slug-safe segments only. */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/** Turn a display name into a safe chat folder slug. */
export function titleToSlug(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return ascii
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function normalizeSlugInput(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (isValidSlug(trimmed)) return trimmed;
  return titleToSlug(trimmed);
}

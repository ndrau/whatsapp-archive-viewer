const EDITED_MARKER_PATTERNS = [
  /<\s*Diese Nachricht wurde bearbeitet\.?\s*>/gi,
  /<\s*This message was edited\.?\s*>/gi,
  /<\s*Nachricht bearbeitet\.?\s*>/gi,
  /<\s*Message edited\.?\s*>/gi,
  /<\s*Mensaje editado\.?\s*>/gi,
];

export function extractEditedMarker(text: string): { text: string; edited: boolean } {
  let edited = false;
  let result = text;

  for (const pattern of EDITED_MARKER_PATTERNS) {
    if (!pattern.test(result)) continue;
    edited = true;
    result = result.replace(pattern, "");
    pattern.lastIndex = 0;
  }

  return {
    text: result.replace(/[ \t]+$/gm, "").trim(),
    edited,
  };
}

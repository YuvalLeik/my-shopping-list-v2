/**
 * Split pasted text (a WhatsApp message, notes, a comma list) into item names.
 * Strips bullets, numbering and checkbox marks; drops empties and duplicates.
 */
export function parseBulkItems(text: string): string[] {
  const parts = text
    .split(/[\n\r,;]+/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*•·▪◦✓✔☐☑]|\[\s?[xX]?\s?\]|\d+[.)])\s*/u, '')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((line) => line.length > 0 && line.length <= 60);
  const seen = new Set<string>();
  return parts.filter((p) => {
    const key = p.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

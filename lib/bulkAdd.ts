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

const HEBREW_NUMBERS: Record<string, number> = {
  'שתי': 2, 'שני': 2, 'שתיים': 2, 'שניים': 2, 'זוג': 2,
  'שלוש': 3, 'שלושה': 3, 'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5,
  'שש': 6, 'שישה': 6, 'שבע': 7, 'שבעה': 7, 'שמונה': 8, 'תשע': 9, 'תשעה': 9, 'עשר': 10, 'עשרה': 10,
};
/** A number followed by one of these is part of the product ("1 ליטר חלב"), not a count. */
const UNIT_AFTER = /^(?:ליטר|ל'|ק"?ג|קילו|גר(?:ם)?|מ"?ל|%)/;

/**
 * "2 חלב", "חלב x2", "חלב ×2", "חלב - 2", "3 יח' יוגורט", "שתי חלה" → name + quantity.
 * Numbers that belong to the product ("חלב 3%", "1 ליטר", "ביצים L 12") are left alone.
 */
export function splitQuantity(line: string): { name: string; qty: number } {
  const s = line.trim();
  const valid = (n: number) => n >= 1 && n <= 50;
  // A bare leading number above 10 is usually a pack size ("12 ביצים"), not a count.
  let m = s.match(/^(\d{1,2})\s*(x|×|\*|יח(?:'|ידות)?|חבילות)?\s+(.+)$/i);
  if (m && valid(+m[1]) && (m[2] || +m[1] <= 10) && !UNIT_AFTER.test(m[3])) return { name: m[3].trim(), qty: +m[1] };
  m = s.match(/^(.+?)\s*(?:[x×*]\s*(\d{1,2})|-\s*(\d{1,2})|(\d{1,2})\s*(?:יח(?:'|ידות)?|חבילות))$/i);
  if (m) {
    const n = +(m[2] || m[3] || m[4]);
    if (valid(n)) return { name: m[1].trim(), qty: n };
  }
  m = s.match(/^(\S+)\s+(.+)$/);
  if (m && HEBREW_NUMBERS[m[1]]) return { name: m[2].trim(), qty: HEBREW_NUMBERS[m[1]] };
  return { name: s, qty: 1 };
}

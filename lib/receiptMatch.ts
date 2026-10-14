import { supabase } from './supabase';
import { getUserPersonalItems, fetchAllAliases, MatchedItem, PersonalItem } from './itemAliases';
import type { ParsedItem } from './receiptParser';

export type MatchSource = 'barcode' | 'alias' | 'ai' | 'fuzzy' | 'bag' | 'none';

export interface ReceiptMatch extends MatchedItem {
  source: MatchSource;
  barcode: string | null;
  isBag: boolean;
}

/** Lines at or above this confidence are saved without asking. */
export const AUTO_ACCEPT_CONFIDENCE = 85;

const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

// Tokens that say nothing about *what* the product is.
const NOISE = new Set([
  'גרם', 'גר', 'ג', 'קג', 'ק"ג', 'ליטר', 'ליט', 'ל', 'מל', 'מ"ל', 'יח', 'יחידות', 'מארז', 'ארוז', 'אריזה',
  'מבצע', 'טרי', 'טריה', 'חדש', 'שישייה', 'רביעייה', 'רביעיי', 'זוג', 'גביע', 'קרטון', 'קרטו', 'בקבוק', 'פחית',
]);

/** Comparable form of a product name: no sizes, units, numbers or prefixes. */
export function productKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[״"'׳`.,*()\-\/%+]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !/\d/.test(t) && !NOISE.has(t))
    // Strip a one-letter Hebrew prefix (ו/ה/ב/ל/מ/ש) from longer words.
    .map((t) => (t.length > 3 && 'והבלמש'.includes(t[0]) ? t.slice(1) : t))
    .join(' ')
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  const str = ` ${s} `;
  for (let i = 0; i < str.length - 1; i++) {
    const g = str.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** Dice coefficient on character bigrams (0..1), robust to word order and small spelling changes. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let total = 0;
  for (const [g, n] of A) { inter += Math.min(n, B.get(g) ?? 0); total += n; }
  for (const n of B.values()) total += n;
  const dice = (2 * inter) / total;
  // A short name that *starts* the longer one ("חלב" → "חלב תנובה טרי") is a strong
  // hint. Only at the start: Hebrew puts the head noun first, so "שוקולד חלב"
  // is chocolate, not milk.
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const contained = short.length >= 3 && `${long} `.startsWith(`${short} `) ? 0.85 : 0;
  return Math.max(dice, contained);
}

async function barcodeIndex(userId: string): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('user_item_barcodes')
    .select('item_name, barcode')
    .eq('local_user_id', userId);
  const map = new Map<string, string>();
  for (const r of data || []) if (r.barcode) map.set(String(r.barcode), r.item_name);
  return map;
}

/**
 * Match parsed receipt lines to the family's own item names.
 * Order: barcode seen before → confirmed alias → AI-proposed name → fuzzy.
 */
export async function matchParsedReceipt(
  userId: string,
  items: ParsedItem[],
  /** The AI parser saw the family's names and proposed matches: a line it left unmatched needs a much stronger fuzzy score. */
  opts: { aiProposedMatches?: boolean } = {},
): Promise<ReceiptMatch[]> {
  const fuzzyMin = opts.aiProposedMatches ? 0.8 : 0.5;
  const [personal, aliases, barcodes] = await Promise.all([
    getUserPersonalItems(userId),
    fetchAllAliases(userId).catch(() => []),
    barcodeIndex(userId).catch(() => new Map<string, string>()),
  ]);

  const byNorm = new Map<string, PersonalItem>(personal.map((p) => [normalize(p.name), p]));
  const keyed = personal.map((p) => ({ item: p, key: productKey(p.name) })).filter((p) => p.key);
  const aliasByName = new Map(aliases.map((a) => [normalize(a.alias_name), a]));
  const imageOf = (name: string) => byNorm.get(normalize(name))?.image_url ?? null;

  return items.map((it): ReceiptMatch => {
    const base = {
      originalName: it.name,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      totalPrice: it.totalPrice,
      barcode: it.barcode ?? null,
      isBag: !!it.isBag,
    };
    const hit = (name: string, confidence: number, source: MatchSource, isConfirmed: boolean): ReceiptMatch => ({
      ...base, matchedCanonicalName: name, matchedImageUrl: imageOf(name), confidence, isConfirmed, source,
    });

    if (it.isBag) return { ...base, matchedCanonicalName: null, matchedImageUrl: null, confidence: 100, isConfirmed: true, source: 'bag' };

    // 1. A barcode we've linked before is certain.
    const byBarcode = it.barcode ? barcodes.get(it.barcode) : undefined;
    if (byBarcode) return hit(byBarcode, 100, 'barcode', true);

    // 2. A receipt name the family confirmed before.
    const alias = aliasByName.get(normalize(it.name));
    if (alias) return hit(alias.canonical_name, alias.confirmed ? 100 : 90, 'alias', alias.confirmed);

    // 3. The parser's proposed mapping onto the family's names.
    if (it.matchName && byNorm.has(normalize(it.matchName))) {
      return hit(byNorm.get(normalize(it.matchName))!.name, 88, 'ai', false);
    }

    // 4. Fuzzy on the generic name (falls back to the printed name).
    const probe = productKey(it.genericName || it.name);
    let best: { item: PersonalItem; score: number } | null = null;
    for (const k of keyed) {
      const score = similarity(probe, k.key);
      if (!best || score > best.score) best = { item: k.item, score };
    }
    if (best && best.score >= fuzzyMin) {
      return hit(best.item.name, Math.round(best.score * 85), 'fuzzy', false);
    }
    return { ...base, matchedCanonicalName: null, matchedImageUrl: null, confidence: 0, isConfirmed: false, source: 'none' };
  });
}

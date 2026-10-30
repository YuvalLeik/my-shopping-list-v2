/**
 * Matching typed / pasted / spoken item names onto the family's own items:
 * nikud, quotes and spacing ignored; small typos tolerated.
 */

export const searchKey = (s: string) =>
  s.toLowerCase()
    .replace(/[֑-ׇ]/g, '') // nikud
    .replace(/["'`״׳]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Typos allowed for a word of this length (none for short words). */
const allowedTypos = (len: number) => (len >= 7 ? 2 : len >= 4 ? 1 : 0);

/** Whether `query` names `name`: substring, or every query word close to a word of the name. */
function scoreMatch(query: string, name: string): number {
  if (!query) return 0;
  if (name === query) return 100;
  if (name.startsWith(query)) return 80;
  if (name.split(' ').some((w) => w.startsWith(query))) return 70;
  if (name.includes(query)) return 60;
  const nameWords = name.split(' ');
  const ok = query.split(' ').every((qw) =>
    nameWords.some((nw) => levenshtein(qw, nw.slice(0, Math.max(qw.length, nw.length))) <= allowedTypos(qw.length)));
  return ok ? 40 : 0;
}

/**
 * Autocomplete: the family's own items first (best match, then most bought),
 * then other names from the shared catalog; at most `limit`.
 */
export function rankItemNames(
  query: string,
  family: { name: string; frequency: number }[],
  global: string[],
  limit = 8,
): string[] {
  const q = searchKey(query);
  if (!q) return [];
  const seen = new Set<string>();
  const mine = family
    .map((f) => ({ name: f.name, score: scoreMatch(q, searchKey(f.name)), freq: f.frequency }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || b.freq - a.freq);
  const out: string[] = [];
  for (const m of mine) {
    const k = searchKey(m.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m.name);
    if (out.length >= limit) return out;
  }
  // Shared catalog: substring matches only (typo matching there is noisy).
  const others = global
    .map((n) => ({ name: n, score: searchKey(n).includes(q) ? scoreMatch(q, searchKey(n)) : 0 }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.name.length - b.name.length);
  for (const m of others) {
    const k = searchKey(m.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(m.name);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The family item a free-text name refers to, or null. Exact (ignoring
 * nikud/quotes) or a near-typo of the whole name; deliberately strict, so
 * "חלב" doesn't turn into "חלב שקדים".
 */
export function matchFamilyItem(text: string, familyNames: string[]): string | null {
  const q = searchKey(text);
  if (!q) return null;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const name of familyNames) {
    const k = searchKey(name);
    if (k === q) return name;
    const d = levenshtein(q, k);
    if (d <= allowedTypos(q.length) && d < bestDist) {
      best = name;
      bestDist = d;
    }
  }
  return best;
}

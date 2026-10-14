import { supabase } from './supabase';

export type SuggestionKind = 'due' | 'staple' | 'forgotten';

export interface ItemSuggestion {
  name: string;
  category: string;
  kind: SuggestionKind;
  /** Lists this item appeared in. */
  timesBought: number;
  daysSinceLast: number;
  /** Typical gap between purchases, in days (null when bought once). */
  typicalIntervalDays: number | null;
  /** Short Hebrew explanation shown on the chip's tooltip. */
  reason: string;
}

const DAY = 86_400_000;
const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Suggestions for the list being built, from the family's own history of
 * completed lists:
 *  - due:       bought regularly and the usual gap has passed ("probably running out")
 *  - staple:    in at least half of all shops
 *  - forgotten: used to be bought, but well over twice the usual gap ago
 * Items already on the current list are left out.
 */
export async function getListSuggestions(
  userId: string,
  currentListNames: string[],
  now: Date = new Date(),
): Promise<Record<SuggestionKind, ItemSuggestion[]>> {
  const empty = { due: [], staple: [], forgotten: [] } as Record<SuggestionKind, ItemSuggestion[]>;

  const { data: lists } = await supabase
    .from('grocery_lists')
    .select('id, completed_at, created_at')
    .eq('local_user_id', userId)
    .not('completed_at', 'is', null);
  if (!lists?.length) return empty;

  const dateByList = new Map(lists.map((l) => [l.id as string, new Date(l.completed_at || l.created_at).getTime()]));
  const { data: rows } = await supabase
    .from('grocery_items')
    .select('name, category, list_id, unavailable, created_at')
    .in('list_id', Array.from(dateByList.keys()));
  if (!rows?.length) return empty;

  type Hist = { display: string; category: string; latest: number; dates: Set<number> };
  const hist = new Map<string, Hist>();
  for (const r of rows) {
    if (r.unavailable) continue;
    const when = dateByList.get(r.list_id);
    if (when == null) continue;
    const key = normalize(r.name);
    const h = hist.get(key) ?? { display: r.name, category: r.category || 'ללא קטגוריה', latest: 0, dates: new Set<number>() };
    // Same calendar day counts once (two lists on one shopping day).
    h.dates.add(Math.floor(when / DAY));
    if (when >= h.latest) {
      h.latest = when;
      h.display = r.name;
      if (r.category && r.category !== 'ללא קטגוריה') h.category = r.category;
    }
    hist.set(key, h);
  }

  const shoppingDays = new Set(Array.from(dateByList.values()).map((t) => Math.floor(t / DAY))).size;
  const onList = new Set(currentListNames.map(normalize));
  const today = Math.floor(now.getTime() / DAY);
  const out = { due: [], staple: [], forgotten: [] } as Record<SuggestionKind, ItemSuggestion[]>;

  for (const [key, h] of hist) {
    if (onList.has(key)) continue;
    const days = Array.from(h.dates).sort((a, b) => a - b);
    const times = days.length;
    const since = today - days[days.length - 1];
    const gaps = days.slice(1).map((d, i) => d - days[i]).filter((g) => g > 0);
    const interval = gaps.length ? Math.max(2, Math.round(median(gaps))) : null;
    const base = { name: h.display, category: h.category, timesBought: times, daysSinceLast: since, typicalIntervalDays: interval };

    if (interval && times >= 2 && since > Math.max(2 * interval, 30)) {
      out.forgotten.push({ ...base, kind: 'forgotten', reason: `לא נקנה ${since} ימים (בד״כ כל ${interval})` });
    } else if (interval && times >= 2 && since >= interval * 0.9) {
      out.due.push({ ...base, kind: 'due', reason: `נקנה בד״כ כל ${interval} ימים · עברו ${since}` });
    } else if (shoppingDays >= 3 && times / shoppingDays >= 0.5) {
      out.staple.push({ ...base, kind: 'staple', reason: `ב-${times} מתוך ${shoppingDays} קניות` });
    }
  }

  // Most overdue / most frequent first; keep the rails short enough to scan.
  out.due.sort((a, b) => b.daysSinceLast / (b.typicalIntervalDays || 1) - a.daysSinceLast / (a.typicalIntervalDays || 1));
  out.staple.sort((a, b) => b.timesBought - a.timesBought);
  out.forgotten.sort((a, b) => b.timesBought - a.timesBought || a.daysSinceLast - b.daysSinceLast);
  out.due = out.due.slice(0, 15);
  out.staple = out.staple.slice(0, 15);
  out.forgotten = out.forgotten.slice(0, 10);
  return out;
}

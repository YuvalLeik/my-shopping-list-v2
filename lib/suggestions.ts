import { supabase } from './supabase';

export type SuggestionKind = 'due' | 'staple' | 'forgotten';

export interface ItemSuggestion {
  name: string;
  category: string;
  kind: SuggestionKind;
  /** Shopping days this item was bought on. */
  timesBought: number;
  daysSinceLast: number;
  /** Typical gap between purchases, in days (null when bought once). */
  typicalIntervalDays: number | null;
  /** Usual quantity per shop (whole units; 1 for weighed items). */
  typicalQty: number;
  /** Short Hebrew explanation shown under the chip. */
  reason: string;
}

/** One item's purchase history, from completed lists and receipts. */
export interface ItemHistory {
  name: string;
  category: string;
  /** Distinct shopping days (epoch days), ascending. */
  days: number[];
  typicalQty: number;
  typicalIntervalDays: number | null;
  daysSinceLast: number;
}

export interface PurchaseHistory {
  items: Map<string, ItemHistory>;
  /** Number of distinct shopping days in the window. */
  shoppingDays: number;
}

const DAY = 86_400_000;
/** Older history says little about what the family buys now, and keeps queries small. */
const HISTORY_DAYS = 365;
export const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * The family's purchases over the last HISTORY_DAYS: items on completed
 * lists plus receipt lines (standalone purchases included), receipt names
 * mapped onto the family's own names through item_aliases. A receipt linked
 * to a list counts as the same shopping day as that list.
 */
export async function loadPurchaseHistory(userId: string, now: Date = new Date()): Promise<PurchaseHistory> {
  const since = new Date(now.getTime() - HISTORY_DAYS * DAY).toISOString();
  const [{ data: lists }, { data: records }, { data: aliases }] = await Promise.all([
    supabase.from('grocery_lists').select('id, completed_at, created_at')
      .eq('local_user_id', userId).not('completed_at', 'is', null).gte('completed_at', since),
    supabase.from('purchase_records').select('id, grocery_list_id, purchase_date, created_at')
      .eq('local_user_id', userId).gte('created_at', since),
    supabase.from('item_aliases').select('alias_name, canonical_name').eq('local_user_id', userId),
  ]);

  const dayOf = (iso: string) => Math.floor(new Date(iso).getTime() / DAY);
  const dayByList = new Map((lists || []).map((l) => [l.id as string, dayOf(l.completed_at || l.created_at)]));
  const dayByRecord = new Map((records || []).map((r) => [
    r.id as string,
    (r.grocery_list_id && dayByList.get(r.grocery_list_id)) ?? dayOf(r.purchase_date || r.created_at),
  ]));
  const canonical = new Map((aliases || []).map((a) => [normalizeName(a.alias_name), a.canonical_name as string]));

  const [{ data: listRows }, { data: receiptRows }] = await Promise.all([
    dayByList.size
      ? supabase.from('grocery_items').select('name, category, list_id, quantity, unavailable').in('list_id', Array.from(dayByList.keys()))
      : Promise.resolve({ data: [] as { name: string; category: string | null; list_id: string; quantity: number; unavailable: boolean | null }[] }),
    dayByRecord.size
      ? supabase.from('purchase_items').select('name, quantity, purchase_record_id').in('purchase_record_id', Array.from(dayByRecord.keys()))
      : Promise.resolve({ data: [] as { name: string; quantity: number | null; purchase_record_id: string }[] }),
  ]);

  type Acc = { name: string; category: string; latest: number; qtyByDay: Map<number, number> };
  const acc = new Map<string, Acc>();
  const allDays = new Set<number>();
  const add = (rawName: string, category: string | null, day: number, qty: number) => {
    const name = canonical.get(normalizeName(rawName)) ?? rawName;
    const key = normalizeName(name);
    const a = acc.get(key) ?? { name, category: 'ללא קטגוריה', latest: -1, qtyByDay: new Map<number, number>() };
    // A list and its receipt describe the same shop: keep the larger quantity, don't add.
    a.qtyByDay.set(day, Math.max(a.qtyByDay.get(day) ?? 0, qty));
    if (day >= a.latest) a.latest = day;
    if (category && category !== 'ללא קטגוריה') a.category = category;
    acc.set(key, a);
    allDays.add(day);
  };

  for (const r of listRows || []) {
    if (r.unavailable) continue;
    const day = dayByList.get(r.list_id);
    if (day != null) add(r.name, r.category, day, Number(r.quantity) || 1);
  }
  for (const r of receiptRows || []) {
    const day = dayByRecord.get(r.purchase_record_id);
    if (day != null) add(r.name, null, day, Number(r.quantity) || 1);
  }

  const today = Math.floor(now.getTime() / DAY);
  const items = new Map<string, ItemHistory>();
  for (const [key, a] of acc) {
    const days = Array.from(a.qtyByDay.keys()).sort((x, y) => x - y);
    const gaps = days.slice(1).map((d, i) => d - days[i]).filter((g) => g > 0);
    const qtys = Array.from(a.qtyByDay.values());
    // Weighed items (fractional kg) are added as 1; the weight is picked at the store.
    const typicalQty = qtys.some((q) => !Number.isInteger(q)) ? 1 : Math.max(1, Math.round(median(qtys)));
    items.set(key, {
      name: a.name,
      category: a.category,
      days,
      typicalQty,
      typicalIntervalDays: gaps.length ? Math.max(2, Math.round(median(gaps))) : null,
      daysSinceLast: today - a.latest,
    });
  }
  return { items, shoppingDays: allDays.size };
}

/**
 * Suggestions for the list being built, from the family's purchase history:
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
  const { items, shoppingDays } = await loadPurchaseHistory(userId, now);
  const onList = new Set(currentListNames.map(normalizeName));
  const out = { due: [], staple: [], forgotten: [] } as Record<SuggestionKind, ItemSuggestion[]>;

  for (const [key, h] of items) {
    if (onList.has(key)) continue;
    const times = h.days.length;
    const since = h.daysSinceLast;
    const interval = h.typicalIntervalDays;
    const base = {
      name: h.name, category: h.category, timesBought: times, daysSinceLast: since,
      typicalIntervalDays: interval, typicalQty: h.typicalQty,
    };
    const ago = since === 0 ? 'היום' : since === 1 ? 'אתמול' : `לפני ${since} ימים`;

    if (interval && times >= 2 && since > Math.max(2 * interval, 30)) {
      out.forgotten.push({ ...base, kind: 'forgotten', reason: `${ago} · בד״כ כל ${interval}` });
    } else if (interval && times >= 2 && since >= interval * 0.9) {
      out.due.push({ ...base, kind: 'due', reason: `${ago} · בד״כ כל ${interval}` });
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

/**
 * Typical spend per shop: median receipt total over the history window
 * (small top-up purchases ignored). Null until there are 3 receipts.
 */
export async function getUsualSpend(userId: string, now: Date = new Date()): Promise<number | null> {
  const since = new Date(now.getTime() - HISTORY_DAYS * DAY).toISOString();
  const { data } = await supabase.from('purchase_records').select('total_amount')
    .eq('local_user_id', userId).gte('created_at', since).gt('total_amount', 50);
  const totals = (data || []).map((r) => Number(r.total_amount)).filter((n) => Number.isFinite(n));
  return totals.length >= 3 ? Math.round(median(totals)) : null;
}

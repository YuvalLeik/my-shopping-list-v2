import { supabase } from '@/lib/supabase';
import { getAreaPrices } from '@/lib/cheapersal';
import { prefsFromUserRow, EXCLUDED_CITIES } from '@/lib/chains';

/** Items priced within this window are skipped, so budget goes to stale ones. */
const FRESH_HOURS = 20;
/** Rows older than this are purged; the UI labels anything over a day as stale. */
export const PRICE_RETENTION_DAYS = 7;
/** Stop spending once the plan's daily quota is this low (keeps room for manual refreshes). */
const QUOTA_FLOOR = 5;
// Cheapersal answers concurrent requests with 502s (and slows down for
// everyone), so price lookups are strictly sequential.
const PRICE_CONCURRENCY = 1;
const RESOLVE_CONCURRENCY = 3;
/** Consecutive API failures after which we assume it's down and stop. */
const MAX_CONSECUTIVE_ERRORS = 3;
const LIST_ITEMS_LIMIT = 60;
/** Cap on candidates per run (current list + most frequent items). */
const MAX_CANDIDATES = 120;
/** PostgREST puts .in() filters in the URL; keep each query short. */
const IN_CHUNK = 40;

export interface RefreshStats {
  userId: string;
  candidates: number;
  skippedFresh: number;
  priced: number;
  notFound: number;
  errors: number;
  resolved: number;
  droppedBadBarcodes: number;
  unmapped: string[];
  insertedRows: number;
  quotaRemaining: number | null;
  stoppedEarly: string | null;
}

interface Options {
  /** Max Cheapersal requests for this call. */
  budget: number;
  /** Max new names to resolve to barcodes via Open Food Facts. */
  resolveBudget: number;
  /** Price exactly these names (manual refresh); default = active list + frequent items. */
  onlyItems?: string[];
  /** Epoch ms after which no new work starts (serverless time limit). */
  deadline: number;
}

export function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

async function resolveBarcodeViaOpenFoodFacts(itemName: string): Promise<string | null> {
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(itemName)}&search_simple=1&action=process&json=true&page_size=5&fields=code,product_name,countries_tags`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MyShoppingList/1.0 (grocery comparison app)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.products?.length) return null;
    // Only Israeli products: a foreign barcode never has Israeli shelf prices.
    const product = data.products.find(
      (p: { countries_tags?: string[]; code?: string }) => p.countries_tags?.includes('en:israel') || p.code?.startsWith('729')
    );
    return product?.code || null;
  } catch {
    return null;
  }
}

async function candidateItems(userId: string): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (name: string) => {
    const n = normalizeItemName(name);
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(name.trim());
  };

  // The current list first: that's what "cheapest today" is about.
  const { data: activeLists } = await supabase
    .from('grocery_lists')
    .select('id')
    .eq('local_user_id', userId)
    .is('completed_at', null)
    .order('created_at', { ascending: false })
    .limit(1);
  if (activeLists?.length) {
    const { data: listItems } = await supabase
      .from('grocery_items')
      .select('name')
      .eq('list_id', activeLists[0].id)
      .limit(LIST_ITEMS_LIMIT);
    for (const item of listItems || []) push(item.name);
  }

  // Then the items the family lists most often, so the next list is
  // pre-priced. (List names, not receipt lines: those are often OCR noise.)
  const { data: lists } = await supabase
    .from('grocery_lists')
    .select('id')
    .eq('local_user_id', userId);
  const counts = new Map<string, { name: string; n: number }>();
  const listIds = (lists || []).map((l) => l.id as string);
  for (let i = 0; i < listIds.length; i += IN_CHUNK) {
    const { data: rows } = await supabase
      .from('grocery_items')
      .select('name')
      .in('list_id', listIds.slice(i, i + IN_CHUNK));
    for (const r of rows || []) {
      const key = normalizeItemName(r.name);
      const cur = counts.get(key) ?? { name: r.name, n: 0 };
      cur.n++;
      counts.set(key, cur);
    }
  }
  for (const { name } of Array.from(counts.values()).sort((a, b) => b.n - a.n)) {
    if (out.length >= MAX_CANDIDATES) break;
    push(name);
  }

  return out;
}

export async function refreshUserPrices(userId: string, opts: Options): Promise<RefreshStats> {
  const stats: RefreshStats = {
    userId, candidates: 0, skippedFresh: 0, priced: 0, notFound: 0, errors: 0, resolved: 0,
    droppedBadBarcodes: 0, unmapped: [], insertedRows: 0, quotaRemaining: null, stoppedEarly: null,
  };

  const { data: userRow } = await supabase.from('local_users').select('*').eq('id', userId).maybeSingle();
  const prefs = prefsFromUserRow(userRow);

  const names = opts.onlyItems?.length ? opts.onlyItems : await candidateItems(userId);
  stats.candidates = names.length;
  if (!names.length) return stats;

  // Skip items priced recently.
  const freshCutoff = new Date(Date.now() - FRESH_HOURS * 3600_000).toISOString();
  const { data: freshRows } = await supabase
    .from('market_price_comparisons')
    .select('item_name')
    .eq('local_user_id', userId)
    .gte('fetched_at', freshCutoff);
  const fresh = new Set((freshRows || []).map((r) => normalizeItemName(r.item_name)));
  const targets = names.filter((n) => !fresh.has(normalizeItemName(n)));
  stats.skippedFresh = names.length - targets.length;
  if (!targets.length) return stats;

  const byName = new Map<string, { barcode: string; source: string }>();
  const normTargets = targets.map(normalizeItemName);
  for (let i = 0; i < normTargets.length; i += IN_CHUNK) {
    const { data: mappings, error } = await supabase
      .from('user_item_barcodes')
      .select('item_name_normalized, barcode, source')
      .eq('local_user_id', userId)
      .in('item_name_normalized', normTargets.slice(i, i + IN_CHUNK));
    if (error) console.error('barcode lookup failed:', error.message);
    for (const m of mappings || []) byName.set(m.item_name_normalized, { barcode: m.barcode, source: m.source || '' });
  }

  const mapped = targets.filter((n) => byName.has(normalizeItemName(n)));
  const unmapped = targets.filter((n) => !byName.has(normalizeItemName(n)));

  let spent = 0;
  const rows: Array<Record<string, unknown>> = [];
  const refreshedNames = new Set<string>();

  let consecutiveErrors = 0;
  const canSpend = () => {
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) { stats.stoppedEarly ??= 'api_error'; return false; }
    if (spent >= opts.budget) { stats.stoppedEarly ??= 'budget'; return false; }
    if (stats.quotaRemaining != null && stats.quotaRemaining <= QUOTA_FLOOR) { stats.stoppedEarly ??= 'quota'; return false; }
    if (Date.now() > opts.deadline) { stats.stoppedEarly ??= 'time'; return false; }
    return true;
  };

  const priceOne = async (itemName: string, barcode: string, source: string) => {
    if (!canSpend()) return;
    spent++;
    const result = await getAreaPrices(barcode, {
      families: prefs.preferredChains,
      areaCities: prefs.areaCities,
      excludedCities: EXCLUDED_CITIES,
    });
    if (result.remaining != null) {
      stats.quotaRemaining = Math.min(stats.quotaRemaining ?? Infinity, result.remaining);
    }
    if (result.status === 'quota') { stats.quotaRemaining = 0; return; }
    if (result.status === 'error') { stats.errors++; consecutiveErrors++; return; }
    consecutiveErrors = 0;
    if (result.status === 'not_found') {
      stats.notFound++;
      // An auto-guessed barcode with no Israeli prices is a wrong guess: forget
      // it so a later run can try again. Receipt barcodes are kept.
      if (source.startsWith('auto')) {
        await supabase.from('user_item_barcodes').delete()
          .eq('local_user_id', userId).eq('item_name_normalized', normalizeItemName(itemName));
        stats.droppedBadBarcodes++;
      }
      return;
    }
    stats.priced++;
    refreshedNames.add(itemName);
    for (const e of result.entries) {
      rows.push({
        local_user_id: userId,
        item_name: itemName,
        barcode,
        chain_name: e.chainName,
        branch_name: e.branchName,
        price: e.price,
        promo_price: null,
        promo_description: null,
      });
    }
  };

  await mapLimit(mapped, PRICE_CONCURRENCY, async (name) => {
    const m = byName.get(normalizeItemName(name))!;
    await priceOne(name, m.barcode, m.source || '');
  });

  // Resolve new names (spread over days) and price them if budget remains.
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const offset = unmapped.length ? (dayIndex * opts.resolveBudget) % unmapped.length : 0;
  const rotated = [...unmapped.slice(offset), ...unmapped.slice(0, offset)];
  const toResolve = rotated.slice(0, opts.resolveBudget);
  stats.unmapped = rotated.slice(opts.resolveBudget);

  // Resolve in parallel (Open Food Facts copes), then price sequentially.
  const resolvedNow: Array<[string, string]> = [];
  await mapLimit(toResolve, RESOLVE_CONCURRENCY, async (name) => {
    if (Date.now() > opts.deadline) { stats.unmapped.push(name); return; }
    const barcode = await resolveBarcodeViaOpenFoodFacts(name);
    if (!barcode) { stats.unmapped.push(name); return; }
    stats.resolved++;
    await supabase.from('user_item_barcodes').upsert({
      local_user_id: userId,
      item_name: name,
      item_name_normalized: normalizeItemName(name),
      barcode,
      source: 'auto-openfoodfacts',
    }, { onConflict: 'local_user_id,item_name_normalized' });
    resolvedNow.push([name, barcode]);
  });
  for (const [name, barcode] of resolvedNow) await priceOne(name, barcode, 'auto-openfoodfacts');

  // Replace only the items we actually re-priced; everything else keeps its
  // last known prices (so a failed or partial run never blanks the UI).
  if (rows.length > 0) {
    const refreshed = Array.from(refreshedNames);
    for (let i = 0; i < refreshed.length; i += IN_CHUNK) {
      await supabase.from('market_price_comparisons').delete()
        .eq('local_user_id', userId)
        .in('item_name', refreshed.slice(i, i + IN_CHUNK));
    }
    const { error } = await supabase.from('market_price_comparisons').insert(rows);
    if (error) console.error(`Price insert failed for ${userId}:`, error);
    else stats.insertedRows = rows.length;
  }
  return stats;
}

export async function purgeOldPrices() {
  const cutoff = new Date(Date.now() - PRICE_RETENTION_DAYS * 86_400_000).toISOString();
  await supabase.from('market_price_comparisons').delete().lt('fetched_at', cutoff);
}

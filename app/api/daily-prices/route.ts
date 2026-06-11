import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getProductPrices } from '@/lib/cheapersal';

// Items per run: the user's CURRENT list comes first (that's what the
// where-to-shop comparison is about), then frequent historical items fill
// the remaining budget. Total stays inside Cheapersal's ~100 req/day plan.
const LIST_ITEMS_LIMIT = 40;
const TOTAL_FETCH_BUDGET = 45;
// New (unmapped) items resolved via Open Food Facts per run — spreads
// resolution over days instead of hammering the API in one go.
const RESOLVE_BUDGET_PER_RUN = 10;
const STALE_DAYS = 2;

export const dynamic = 'force-dynamic';

interface UserCronStats {
  userId: string;
  topItems: number;
  mappedItems: number;
  autoResolved: number;
  unmappedItems: string[];
  insertedRows: number;
}

function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function autoResolveBarcode(itemName: string): Promise<string | null> {
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(itemName)}&search_simple=1&action=process&json=true&page_size=5&fields=code,product_name,countries_tags`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MyShoppingList/1.0 (grocery comparison app)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.products?.length) return null;
    const israeliProduct = data.products.find(
      (p: { countries_tags?: string[] }) => p.countries_tags?.includes('en:israel')
    );
    const product = israeliProduct || data.products[0];
    return product?.code || null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: users } = await supabase
      .from('local_users')
      .select('id');

    if (!users?.length) {
      return NextResponse.json({ message: 'No users found', processed: 0 });
    }

    let totalInserted = 0;
    const perUser: UserCronStats[] = [];

    for (const user of users) {
      const result = await processUser(user.id);
      totalInserted += result.insertedRows;
      perUser.push(result);
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - STALE_DAYS);
    await supabase
      .from('market_price_comparisons')
      .delete()
      .lt('fetched_at', cutoff.toISOString());

    return NextResponse.json({
      message: 'Daily prices updated',
      users: users.length,
      totalInserted,
      perUser,
    });
  } catch (error) {
    console.error('Daily prices cron error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function processUser(userId: string): Promise<UserCronStats> {
  // 1. The user's current (newest, non-completed) list — these items are what
  //    the where-to-shop comparison needs, so they get priority.
  const targetItems: string[] = [];
  const seen = new Set<string>();
  const pushUnique = (name: string) => {
    const norm = normalizeItemName(name);
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    targetItems.push(name.trim());
  };

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
    for (const item of listItems || []) pushUnique(item.name);
  }

  // 2. Fill the remaining budget with the most frequently purchased items.
  const { data: priceRows } = await supabase
    .from('item_prices')
    .select('item_name')
    .eq('local_user_id', userId);

  if (priceRows?.length) {
    const countMap = new Map<string, number>();
    for (const row of priceRows) {
      countMap.set(row.item_name, (countMap.get(row.item_name) || 0) + 1);
    }
    const frequent = Array.from(countMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
    for (const name of frequent) {
      if (targetItems.length >= TOTAL_FETCH_BUDGET) break;
      pushUnique(name);
    }
  }

  const topItems = targetItems.slice(0, TOTAL_FETCH_BUDGET);
  if (topItems.length === 0) {
    return { userId, topItems: 0, mappedItems: 0, autoResolved: 0, unmappedItems: [], insertedRows: 0 };
  }

  const normalizedTopItems = topItems.map(normalizeItemName);
  const { data: mappings } = await supabase
    .from('user_item_barcodes')
    .select('item_name_normalized, barcode')
    .eq('local_user_id', userId)
    .in('item_name_normalized', normalizedTopItems);

  const barcodeMap = new Map<string, string>();
  for (const mapping of mappings || []) {
    barcodeMap.set(mapping.item_name_normalized, mapping.barcode);
  }

  const mappedItems: Array<{ itemName: string; barcode: string }> = [];
  const unmappedItems: string[] = [];
  let autoResolved = 0;

  // Split into already-mapped and unmapped items.
  const unmappedCandidates: string[] = [];
  for (const itemName of topItems) {
    const normalized = normalizeItemName(itemName);
    const barcode = barcodeMap.get(normalized);
    if (barcode) {
      mappedItems.push({ itemName, barcode });
    } else {
      unmappedCandidates.push(itemName);
    }
  }

  // Rotate the resolution window by day so a batch of unresolvable names
  // doesn't permanently block the rest from ever being attempted.
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const offset = unmappedCandidates.length > 0
    ? (dayIndex * RESOLVE_BUDGET_PER_RUN) % unmappedCandidates.length
    : 0;
  const rotated = [
    ...unmappedCandidates.slice(offset),
    ...unmappedCandidates.slice(0, offset),
  ];
  const toResolve = rotated.slice(0, RESOLVE_BUDGET_PER_RUN);
  const skipResolution = new Set(rotated.slice(RESOLVE_BUDGET_PER_RUN));

  for (const itemName of toResolve) {
    const normalized = normalizeItemName(itemName);
    const barcode = (await autoResolveBarcode(itemName)) ?? undefined;
    if (barcode) {
      autoResolved++;
      await supabase.from('user_item_barcodes').upsert({
        local_user_id: userId,
        item_name: itemName,
        item_name_normalized: normalized,
        barcode,
        source: 'auto-openfoodfacts',
      }, { onConflict: 'local_user_id,item_name_normalized' });
      mappedItems.push({ itemName, barcode });
    } else {
      unmappedItems.push(itemName);
    }
  }
  unmappedItems.push(...skipResolution);

  const rows: Array<{
    local_user_id: string;
    item_name: string;
    barcode: string | null;
    chain_name: string;
    branch_name: string | null;
    price: number;
    promo_price: number | null;
    promo_description: string | null;
  }> = [];

  for (const mapped of mappedItems) {
    try {
      const prices = await getProductPrices(mapped.barcode);
      for (const entry of prices) {
        rows.push({
          local_user_id: userId,
          item_name: mapped.itemName,
          barcode: mapped.barcode,
          chain_name: entry.chainName,
          branch_name: entry.branchName || null,
          price: entry.price,
          promo_price: null,
          promo_description: null,
        });
      }
    } catch (err) {
      console.error(`Failed to fetch prices for "${mapped.itemName}":`, err);
    }
  }

  if (rows.length > 0) {
    await supabase
      .from('market_price_comparisons')
      .delete()
      .eq('local_user_id', userId);

    const { error } = await supabase
      .from('market_price_comparisons')
      .insert(rows);
    if (error) {
      console.error(`Insert error for user ${userId}:`, error);
      return {
        userId,
        topItems: topItems.length,
        mappedItems: mappedItems.length,
        autoResolved,
        unmappedItems,
        insertedRows: 0,
      };
    }
  }

  return {
    userId,
    topItems: topItems.length,
    mappedItems: mappedItems.length,
    autoResolved,
    unmappedItems,
    insertedRows: rows.length,
  };
}

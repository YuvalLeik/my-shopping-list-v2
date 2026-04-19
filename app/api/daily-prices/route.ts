import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getProductPrices } from '@/lib/cheapersal';

const TOP_ITEMS_LIMIT = 15;
const STALE_DAYS = 2;
const OFF_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';

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

async function searchBarcodeViaOpenFoodFacts(itemName: string): Promise<string | null> {
  try {
    const url = `${OFF_SEARCH_URL}?search_terms=${encodeURIComponent(itemName)}&search_simple=1&action=process&json=true&page_size=5&fields=code,product_name,countries_tags`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
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
  const { data: priceRows } = await supabase
    .from('item_prices')
    .select('item_name')
    .eq('local_user_id', userId);

  if (!priceRows?.length) {
    return { userId, topItems: 0, mappedItems: 0, autoResolved: 0, unmappedItems: [], insertedRows: 0 };
  }

  const countMap = new Map<string, number>();
  for (const row of priceRows) {
    countMap.set(row.item_name, (countMap.get(row.item_name) || 0) + 1);
  }

  const topItems = Array.from(countMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_ITEMS_LIMIT)
    .map(([name]) => name);

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

  for (const itemName of topItems) {
    const normalized = normalizeItemName(itemName);
    let barcode: string | undefined = barcodeMap.get(normalized);

    if (!barcode) {
      barcode = (await searchBarcodeViaOpenFoodFacts(itemName)) ?? undefined;
      if (barcode) {
        autoResolved++;
        await supabase.from('user_item_barcodes').upsert({
          local_user_id: userId,
          item_name: itemName,
          item_name_normalized: normalized,
          barcode,
          source: 'auto-openfoodfacts',
        }, { onConflict: 'local_user_id,item_name_normalized' });
      }
    }

    if (!barcode) {
      unmappedItems.push(itemName);
      continue;
    }
    mappedItems.push({ itemName, barcode });
  }

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

import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { searchProduct, getProductPrices } from '@/lib/cheapersal';

const TOP_ITEMS_LIMIT = 15;
const STALE_DAYS = 2;

export const dynamic = 'force-dynamic';

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

    for (const user of users) {
      const inserted = await processUser(user.id);
      totalInserted += inserted;
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
    });
  } catch (error) {
    console.error('Daily prices cron error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function processUser(userId: string): Promise<number> {
  const { data: priceRows } = await supabase
    .from('item_prices')
    .select('item_name')
    .eq('local_user_id', userId);

  if (!priceRows?.length) return 0;

  const countMap = new Map<string, number>();
  for (const row of priceRows) {
    countMap.set(row.item_name, (countMap.get(row.item_name) || 0) + 1);
  }

  const topItems = Array.from(countMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_ITEMS_LIMIT)
    .map(([name]) => name);

  const barcodeCache = new Map<string, string>();
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

  for (const itemName of topItems) {
    try {
      let barcode = barcodeCache.get(itemName);

      if (!barcode) {
        const products = await searchProduct(itemName);
        if (!products.length) continue;
        barcode = products[0].barcode;
        barcodeCache.set(itemName, barcode);
      }

      const prices = await getProductPrices(barcode);
      for (const entry of prices) {
        rows.push({
          local_user_id: userId,
          item_name: itemName,
          barcode,
          chain_name: entry.chainName,
          branch_name: entry.branchName || null,
          price: entry.price,
          promo_price: null,
          promo_description: null,
        });
      }
    } catch (err) {
      console.error(`Failed to fetch prices for "${itemName}":`, err);
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from('market_price_comparisons')
      .insert(rows);
    if (error) {
      console.error(`Insert error for user ${userId}:`, error);
      return 0;
    }
  }

  return rows.length;
}

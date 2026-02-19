import { supabase } from './supabase';

export interface PricePoint {
  date: string;
  price: number;
  unit_price: number | null;
  store_name: string | null;
}

export interface AvgItemPrice {
  itemName: string;
  avgUnitPrice: number;
  count: number;
}

export interface StorePriceComparison {
  storeName: string;
  avgPrice: number;
  lastPrice: number;
}

export interface MonthlySpending {
  month: string;
  totalSpending: number;
}

/**
 * Bulk insert price records for items from a receipt.
 */
export async function recordPrices(
  userId: string,
  items: Array<{
    itemName: string;
    storeName?: string | null;
    price: number;
    quantity?: number;
    unitPrice?: number | null;
    purchaseDate?: string | null;
    purchaseRecordId?: string | null;
  }>
): Promise<void> {
  const rows = items
    .filter(i => i.price != null && i.price > 0)
    .map(i => ({
      local_user_id: userId,
      item_name: i.itemName,
      store_name: i.storeName ?? null,
      price: i.price,
      quantity: i.quantity ?? 1,
      unit_price: i.unitPrice ?? (i.quantity && i.quantity > 0 ? Math.round((i.price / i.quantity) * 100) / 100 : i.price),
      purchase_date: i.purchaseDate ?? null,
      purchase_record_id: i.purchaseRecordId ?? null,
    }));

  if (rows.length === 0) return;

  const { error } = await supabase.from('item_prices').insert(rows);
  if (error) {
    console.error('Failed to record prices:', error);
  }
}

/**
 * Get price history for a single item over time.
 */
export async function getItemPriceHistory(
  userId: string,
  itemName: string,
  limit: number = 50
): Promise<PricePoint[]> {
  const { data, error } = await supabase
    .from('item_prices')
    .select('purchase_date, price, unit_price, store_name')
    .eq('local_user_id', userId)
    .ilike('item_name', itemName.trim().toLowerCase())
    .order('purchase_date', { ascending: true })
    .limit(limit);

  if (error || !data) return [];

  return data.map(d => ({
    date: d.purchase_date ?? 'N/A',
    price: Number(d.price),
    unit_price: d.unit_price != null ? Number(d.unit_price) : null,
    store_name: d.store_name,
  }));
}

/**
 * Get average unit price per item across all receipts.
 */
export async function getAverageItemPrices(
  userId: string
): Promise<AvgItemPrice[]> {
  const { data, error } = await supabase
    .from('item_prices')
    .select('item_name, unit_price')
    .eq('local_user_id', userId);

  if (error || !data) return [];

  const map = new Map<string, { sum: number; count: number }>();
  for (const row of data) {
    const name = row.item_name;
    const up = row.unit_price != null ? Number(row.unit_price) : null;
    if (up == null) continue;
    const cur = map.get(name) || { sum: 0, count: 0 };
    map.set(name, { sum: cur.sum + up, count: cur.count + 1 });
  }

  return Array.from(map.entries())
    .map(([itemName, { sum, count }]) => ({
      itemName,
      avgUnitPrice: Math.round((sum / count) * 100) / 100,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Compare average prices for one item across stores.
 */
export async function getStorePriceComparison(
  userId: string,
  itemName: string
): Promise<StorePriceComparison[]> {
  const { data, error } = await supabase
    .from('item_prices')
    .select('store_name, unit_price, purchase_date')
    .eq('local_user_id', userId)
    .ilike('item_name', itemName.trim().toLowerCase())
    .not('store_name', 'is', null)
    .order('purchase_date', { ascending: false });

  if (error || !data) return [];

  const storeMap = new Map<string, { sum: number; count: number; lastPrice: number }>();
  for (const row of data) {
    const store = row.store_name ?? 'Unknown';
    const up = row.unit_price != null ? Number(row.unit_price) : 0;
    if (up <= 0) continue;
    const cur = storeMap.get(store);
    if (!cur) {
      storeMap.set(store, { sum: up, count: 1, lastPrice: up });
    } else {
      storeMap.set(store, { sum: cur.sum + up, count: cur.count + 1, lastPrice: cur.lastPrice });
    }
  }

  return Array.from(storeMap.entries())
    .map(([storeName, { sum, count, lastPrice }]) => ({
      storeName,
      avgPrice: Math.round((sum / count) * 100) / 100,
      lastPrice,
    }))
    .sort((a, b) => a.avgPrice - b.avgPrice);
}

/**
 * Get total spending by month from item_prices.
 */
export async function getSpendingByMonth(
  userId: string
): Promise<MonthlySpending[]> {
  const { data, error } = await supabase
    .from('item_prices')
    .select('purchase_date, price')
    .eq('local_user_id', userId)
    .not('purchase_date', 'is', null);

  if (error || !data) return [];

  const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const monthMap = new Map<string, number>();

  for (const row of data) {
    if (!row.purchase_date) continue;
    const d = new Date(row.purchase_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthMap.set(key, (monthMap.get(key) || 0) + Number(row.price));
  }

  return Array.from(monthMap.entries())
    .map(([key, totalSpending]) => {
      const [, m] = key.split('-');
      return {
        month: monthNames[parseInt(m) - 1] || key,
        totalSpending: Math.round(totalSpending * 100) / 100,
        _sort: key,
      };
    })
    .sort((a, b) => a._sort.localeCompare(b._sort))
    .map(({ month, totalSpending }) => ({ month, totalSpending }));
}

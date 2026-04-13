import { supabase } from './supabase';
import { getSpendingByMonth as getSpendingByMonthFromPrices, getAverageItemPrices, getItemPriceHistory, getStorePriceComparison, PricePoint, StorePriceComparison, MonthlySpending } from './itemPrices';

export type { PricePoint, StorePriceComparison, MonthlySpending };

/**
 * Batch-fetch categories from the global shopping_items catalog for a list of item names.
 * Returns a map of lowercased item name → category string (non-empty).
 */
async function batchGetCategoriesFromCatalog(names: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (names.length === 0) return result;

  const uniqueNames = [...new Set(names.map(n => n.trim()))].filter(Boolean);
  if (uniqueNames.length === 0) return result;

  try {
    const { data } = await supabase
      .from('shopping_items')
      .select('name, category')
      .in('name', uniqueNames);

    for (const row of data || []) {
      if (row.name && row.category) {
        result.set(row.name.trim().toLowerCase(), row.category);
      }
    }

    // Also try case-insensitive fallback for names not found above
    const notFound = uniqueNames.filter(n => !result.has(n.toLowerCase()));
    if (notFound.length > 0) {
      for (const name of notFound) {
        const { data: fuzzy } = await supabase
          .from('shopping_items')
          .select('name, category')
          .ilike('name', name)
          .limit(1)
          .maybeSingle();
        if (fuzzy?.category) {
          result.set(name.toLowerCase(), fuzzy.category);
        }
      }
    }
  } catch {
    // Non-critical — fall back to "ללא קטגוריה"
  }

  return result;
}

export interface TopItem {
  name: string;
  total_quantity: number;
}

export interface CategoryDistribution {
  category: string;
  count: number;
  total_quantity: number;
}

export interface MonthlyTrend {
  month: string;
  year: number;
  month_year: string;
  total_items: number;
}

/** Per-day completion timeline: date = YYYY-MM-DD from list completed_at. All dashboard data is per-user and from completed lists only. */
export interface CompletionDatePoint {
  date: string;
  listCount: number;
  totalItems: number;
}

export interface DashboardStats {
  totalPurchasedItems: number;
  totalCompletedLists: number;
  avgItemsPerList: number;
  topItems: TopItem[];
  categoryDistribution: CategoryDistribution[];
  monthlyTrend: MonthlyTrend[];
  completionTimelineByDay: CompletionDatePoint[];
}

/**
 * Get standalone purchase items for a user (from purchase_records with grocery_list_id null)
 */
async function getStandalonePurchaseItems(userId: string): Promise<{ name: string; quantity: number }[]> {
  const { data: records, error: recError } = await supabase
    .from('purchase_records')
    .select('id')
    .eq('local_user_id', userId)
    .is('grocery_list_id', null);

  if (recError || !records?.length) return [];

  const recordIds = records.map(r => r.id);
  const { data: items, error: itemsError } = await supabase
    .from('purchase_items')
    .select('name, quantity')
    .in('purchase_record_id', recordIds);

  if (itemsError || !items) return [];
  return items.map(i => ({ name: i.name, quantity: i.quantity ?? 1 }));
}

/**
 * Get top purchased items for a user (from completed lists + standalone purchases)
 */
export async function getTopPurchasedItems(userId: string, limit: number = 10): Promise<TopItem[]> {
  try {
    const itemMap = new Map<string, number>();

    // From completed lists
    const { data: completedLists, error: listsError } = await supabase
      .from('grocery_lists')
      .select('id')
      .eq('local_user_id', userId)
      .not('completed_at', 'is', null);

    if (!listsError && completedLists?.length) {
      const listIds = completedLists.map(list => list.id);
      const { data: items } = await supabase
        .from('grocery_items')
        .select('name, quantity')
        .in('list_id', listIds)
        .eq('purchased', true);

      for (const item of items || []) {
        itemMap.set(item.name, (itemMap.get(item.name) || 0) + item.quantity);
      }
    }

    // From standalone purchases
    const standaloneItems = await getStandalonePurchaseItems(userId);
    for (const item of standaloneItems) {
      itemMap.set(item.name, (itemMap.get(item.name) || 0) + item.quantity);
    }

    return Array.from(itemMap.entries())
      .map(([name, total_quantity]) => ({ name, total_quantity }))
      .sort((a, b) => b.total_quantity - a.total_quantity)
      .slice(0, limit);
  } catch (error) {
    console.error('Error getting top purchased items:', error);
    return [];
  }
}

/**
 * Get total number of purchased items (completed lists + standalone purchases)
 */
export async function getTotalPurchasedItems(userId: string): Promise<number> {
  try {
    let total = 0;

    const { data: completedLists, error: listsError } = await supabase
      .from('grocery_lists')
      .select('id')
      .eq('local_user_id', userId)
      .not('completed_at', 'is', null);

    if (!listsError && completedLists?.length) {
      const listIds = completedLists.map(list => list.id);
      const { data: items } = await supabase
        .from('grocery_items')
        .select('quantity')
        .in('list_id', listIds)
        .eq('purchased', true);
      total += (items || []).reduce((sum, item) => sum + item.quantity, 0);
    }

    const standaloneItems = await getStandalonePurchaseItems(userId);
    total += standaloneItems.reduce((sum, item) => sum + item.quantity, 0);

    return total;
  } catch (error) {
    console.error('Error getting total purchased items:', error);
    return 0;
  }
}

/**
 * Get total number of completed lists
 */
export async function getTotalCompletedLists(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('grocery_lists')
      .select('id')
      .eq('local_user_id', userId)
      .not('completed_at', 'is', null);

    if (error || !data) {
      return 0;
    }

    return data.length;
  } catch (error) {
    console.error('Error getting total completed lists:', error);
    return 0;
  }
}

/**
 * Get category distribution (completed lists + standalone purchases).
 * Items without a category are looked up in the global catalog before
 * falling back to "ללא קטגוריה".
 */
export async function getCategoryDistribution(userId: string): Promise<CategoryDistribution[]> {
  try {
    const categoryMap = new Map<string, { count: number; total_quantity: number }>();

    const { data: completedLists, error: listsError } = await supabase
      .from('grocery_lists')
      .select('id')
      .eq('local_user_id', userId)
      .not('completed_at', 'is', null);

    if (!listsError && completedLists?.length) {
      const listIds = completedLists.map(list => list.id);
      const { data: items } = await supabase
        .from('grocery_items')
        .select('name, category, quantity')
        .in('list_id', listIds)
        .eq('purchased', true);

      // Batch-lookup catalog categories for items missing a category
      const uncategorizedNames = (items || [])
        .filter(i => !i.category)
        .map(i => i.name);
      const catalogCategories = await batchGetCategoriesFromCatalog(uncategorizedNames);

      for (const item of items || []) {
        const category =
          item.category ||
          catalogCategories.get(item.name?.trim().toLowerCase()) ||
          'ללא קטגוריה';
        const current = categoryMap.get(category) || { count: 0, total_quantity: 0 };
        categoryMap.set(category, {
          count: current.count + 1,
          total_quantity: current.total_quantity + item.quantity,
        });
      }
    }

    // Standalone purchase items — try catalog before falling back
    const standaloneItems = await getStandalonePurchaseItems(userId);
    const standaloneNames = standaloneItems.map(i => i.name);
    const standaloneCatalogCats = await batchGetCategoriesFromCatalog(standaloneNames);

    for (const item of standaloneItems) {
      const category =
        standaloneCatalogCats.get(item.name?.trim().toLowerCase()) ||
        'ללא קטגוריה';
      const current = categoryMap.get(category) || { count: 0, total_quantity: 0 };
      categoryMap.set(category, {
        count: current.count + 1,
        total_quantity: current.total_quantity + item.quantity,
      });
    }

    return Array.from(categoryMap.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.total_quantity - a.total_quantity);
  } catch (error) {
    console.error('Error getting category distribution:', error);
    return [];
  }
}

/**
 * Get monthly trend of purchased items (completed lists + standalone purchases)
 */
export async function getMonthlyTrend(userId: string): Promise<MonthlyTrend[]> {
  try {
    const monthlyMap = new Map<string, number>();

    const { data: completedLists, error: listsError } = await supabase
      .from('grocery_lists')
      .select('id, completed_at')
      .eq('local_user_id', userId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: true });

    if (!listsError && completedLists) {
      for (const list of completedLists) {
        if (!list.completed_at) continue;
        const date = new Date(list.completed_at);
        const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const { data: items } = await supabase
          .from('grocery_items')
          .select('quantity')
          .eq('list_id', list.id)
          .eq('purchased', true);
        const itemCount = items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
        monthlyMap.set(monthYear, (monthlyMap.get(monthYear) || 0) + itemCount);
      }
    }

    const { data: standaloneRecords } = await supabase
      .from('purchase_records')
      .select('id, purchase_date')
      .eq('local_user_id', userId)
      .is('grocery_list_id', null);

    if (standaloneRecords) {
      for (const rec of standaloneRecords) {
        if (!rec.purchase_date) continue;
        const date = new Date(rec.purchase_date);
        const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const { data: items } = await supabase
          .from('purchase_items')
          .select('quantity')
          .eq('purchase_record_id', rec.id);
        const itemCount = items?.reduce((sum, item) => sum + (item.quantity ?? 1), 0) || 0;
        monthlyMap.set(monthYear, (monthlyMap.get(monthYear) || 0) + itemCount);
      }
    }

    const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    return Array.from(monthlyMap.entries())
      .map(([monthYear, total_items]) => {
        const [y, m] = monthYear.split('-');
        return { month: monthNames[parseInt(m) - 1], year: parseInt(y), month_year: monthYear, total_items };
      })
      .sort((a, b) => a.month_year.localeCompare(b.month_year));
  } catch (error) {
    console.error('Error getting monthly trend:', error);
    return [];
  }
}

/**
 * Get average items per list
 */
export async function getAvgItemsPerList(userId: string): Promise<number> {
  try {
    const totalLists = await getTotalCompletedLists(userId);
    if (totalLists === 0) {
      return 0;
    }

    const totalItems = await getTotalPurchasedItems(userId);
    return Math.round((totalItems / totalLists) * 10) / 10; // Round to 1 decimal
  } catch (error) {
    console.error('Error getting average items per list:', error);
    return 0;
  }
}

/**
 * Get all unique purchased item names (completed lists + standalone purchases)
 */
export async function getAllPurchasedItemNames(userId: string): Promise<string[]> {
  try {
    const nameSet = new Set<string>();

    const { data: completedLists, error: listsError } = await supabase
      .from('grocery_lists')
      .select('id')
      .eq('local_user_id', userId)
      .not('completed_at', 'is', null);

    if (!listsError && completedLists?.length) {
      const listIds = completedLists.map(list => list.id);
      const { data: items } = await supabase
        .from('grocery_items')
        .select('name')
        .in('list_id', listIds)
        .eq('purchased', true);
      (items || []).forEach(i => nameSet.add(i.name));
    }

    const standaloneItems = await getStandalonePurchaseItems(userId);
    standaloneItems.forEach(i => nameSet.add(i.name));

    return [...nameSet].sort((a, b) => a.localeCompare(b, 'he'));
  } catch (error) {
    console.error('Error getting all purchased item names:', error);
    return [];
  }
}

/**
 * Get monthly trend for a specific item (completed lists + standalone purchases)
 */
export async function getItemMonthlyTrend(userId: string, itemName: string): Promise<MonthlyTrend[]> {
  try {
    const monthlyMap = new Map<string, number>();

    const { data: completedLists, error: listsError } = await supabase
      .from('grocery_lists')
      .select('id, completed_at')
      .eq('local_user_id', userId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: true });

    if (!listsError && completedLists) {
      for (const list of completedLists) {
        if (!list.completed_at) continue;
        const date = new Date(list.completed_at);
        const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const { data: items } = await supabase
          .from('grocery_items')
          .select('quantity')
          .eq('list_id', list.id)
          .eq('purchased', true)
          .ilike('name', itemName);
        const itemCount = items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
        if (itemCount > 0) monthlyMap.set(monthYear, (monthlyMap.get(monthYear) || 0) + itemCount);
      }
    }

    const { data: standaloneRecords } = await supabase
      .from('purchase_records')
      .select('id, purchase_date')
      .eq('local_user_id', userId)
      .is('grocery_list_id', null);

    if (standaloneRecords) {
      for (const rec of standaloneRecords) {
        if (!rec.purchase_date) continue;
        const { data: items } = await supabase
          .from('purchase_items')
          .select('quantity')
          .eq('purchase_record_id', rec.id)
          .ilike('name', itemName);
        const itemCount = items?.reduce((sum, item) => sum + (item.quantity ?? 1), 0) || 0;
        if (itemCount > 0) {
          const date = new Date(rec.purchase_date);
          const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          monthlyMap.set(monthYear, (monthlyMap.get(monthYear) || 0) + itemCount);
        }
      }
    }

    const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    return Array.from(monthlyMap.entries())
      .map(([monthYear, total_items]) => {
        const [y, m] = monthYear.split('-');
        return { month: monthNames[parseInt(m) - 1], year: parseInt(y), month_year: monthYear, total_items };
      })
      .sort((a, b) => a.month_year.localeCompare(b.month_year));
  } catch (error) {
    console.error('Error getting item monthly trend:', error);
    return [];
  }
}

/**
 * Get completion timeline by day (completed lists + standalone purchases)
 */
export async function getCompletionTimelineByDay(userId: string): Promise<CompletionDatePoint[]> {
  try {
    const dateMap = new Map<string, { listCount: number; totalItems: number }>();

    const { data: completedLists, error: listsError } = await supabase
      .from('grocery_lists')
      .select('id, completed_at')
      .eq('local_user_id', userId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: true });

    if (!listsError && completedLists) {
      for (const list of completedLists) {
        if (!list.completed_at) continue;
        const d = new Date(list.completed_at);
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const { data: items } = await supabase
          .from('grocery_items')
          .select('quantity')
          .eq('list_id', list.id)
          .eq('purchased', true);
        const itemCount = items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
        const current = dateMap.get(date) || { listCount: 0, totalItems: 0 };
        dateMap.set(date, { listCount: current.listCount + 1, totalItems: current.totalItems + itemCount });
      }
    }

    const { data: standaloneRecords } = await supabase
      .from('purchase_records')
      .select('id, purchase_date')
      .eq('local_user_id', userId)
      .is('grocery_list_id', null);

    if (standaloneRecords) {
      for (const rec of standaloneRecords) {
        if (!rec.purchase_date) continue;
        const d = new Date(rec.purchase_date);
        const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const { data: items } = await supabase
          .from('purchase_items')
          .select('quantity')
          .eq('purchase_record_id', rec.id);
        const itemCount = items?.reduce((sum, item) => sum + (item.quantity ?? 1), 0) || 0;
        const current = dateMap.get(date) || { listCount: 0, totalItems: 0 };
        dateMap.set(date, { listCount: current.listCount, totalItems: current.totalItems + itemCount });
      }
    }

    return Array.from(dateMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error('Error getting completion timeline by day:', error);
    return [];
  }
}

// ---- Spending & Price Analytics (from item_prices table) ----

export interface SpendingItem {
  itemName: string;
  totalSpent: number;
  avgUnitPrice: number;
  purchaseCount: number;
}

export interface SpendingTimelinePoint {
  date: string;
  totalSpent: number;
}

export interface MonthlySpendingPoint {
  month: string;
  totalSpent: number;
  itemCount: number;
}

/**
 * Top items by total money spent.
 */
export async function getTopItemsBySpending(userId: string, limit: number = 10): Promise<SpendingItem[]> {
  const { data, error } = await supabase
    .from('item_prices')
    .select('item_name, price, unit_price')
    .eq('local_user_id', userId);

  if (error || !data) return [];

  const map = new Map<string, { totalSpent: number; unitPriceSum: number; count: number }>();
  for (const row of data) {
    const name = row.item_name;
    const cur = map.get(name) || { totalSpent: 0, unitPriceSum: 0, count: 0 };
    cur.totalSpent += Number(row.price);
    if (row.unit_price != null) cur.unitPriceSum += Number(row.unit_price);
    cur.count += 1;
    map.set(name, cur);
  }

  return Array.from(map.entries())
    .map(([itemName, { totalSpent, unitPriceSum, count }]) => ({
      itemName,
      totalSpent: Math.round(totalSpent * 100) / 100,
      avgUnitPrice: count > 0 ? Math.round((unitPriceSum / count) * 100) / 100 : 0,
      purchaseCount: count,
    }))
    .sort((a, b) => b.totalSpent - a.totalSpent)
    .slice(0, limit);
}

/**
 * Daily spending timeline from item_prices.
 */
export async function getSpendingTimeline(userId: string): Promise<SpendingTimelinePoint[]> {
  const { data, error } = await supabase
    .from('item_prices')
    .select('purchase_date, price')
    .eq('local_user_id', userId)
    .not('purchase_date', 'is', null)
    .order('purchase_date', { ascending: true });

  if (error || !data) return [];

  const dateMap = new Map<string, number>();
  for (const row of data) {
    if (!row.purchase_date) continue;
    const d = new Date(row.purchase_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dateMap.set(key, (dateMap.get(key) || 0) + Number(row.price));
  }

  return Array.from(dateMap.entries())
    .map(([date, totalSpent]) => ({ date, totalSpent: Math.round(totalSpent * 100) / 100 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Monthly spending with item count.
 */
export async function getMonthlySpendingStats(userId: string): Promise<MonthlySpendingPoint[]> {
  const { data, error } = await supabase
    .from('item_prices')
    .select('purchase_date, price')
    .eq('local_user_id', userId)
    .not('purchase_date', 'is', null);

  if (error || !data) return [];

  const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  const monthMap = new Map<string, { totalSpent: number; itemCount: number }>();

  for (const row of data) {
    if (!row.purchase_date) continue;
    const d = new Date(row.purchase_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const cur = monthMap.get(key) || { totalSpent: 0, itemCount: 0 };
    cur.totalSpent += Number(row.price);
    cur.itemCount += 1;
    monthMap.set(key, cur);
  }

  return Array.from(monthMap.entries())
    .map(([key, { totalSpent, itemCount }]) => {
      const [, m] = key.split('-');
      return {
        month: monthNames[parseInt(m) - 1] || key,
        totalSpent: Math.round(totalSpent * 100) / 100,
        itemCount,
        _sort: key,
      };
    })
    .sort((a, b) => a._sort.localeCompare(b._sort))
    .map(({ month, totalSpent, itemCount }) => ({ month, totalSpent, itemCount }));
}

/**
 * Total spending KPI.
 */
export async function getTotalSpending(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from('item_prices')
    .select('price')
    .eq('local_user_id', userId);

  if (error || !data) return 0;
  return Math.round(data.reduce((sum, r) => sum + Number(r.price), 0) * 100) / 100;
}

// Re-export price library functions for dashboard use
export { getAverageItemPrices, getItemPriceHistory, getStorePriceComparison, getSpendingByMonthFromPrices };

// ---- List-Receipt Reconciliation ----

export interface ReconciliationMatchedItem {
  groceryItem: string;
  purchaseItem: string;
  quantity: number;
  price: number | null;
}

export interface ReconciliationData {
  listId: string;
  listTitle: string;
  listDate: string;
  storeName: string | null;
  totalPlannedItems: number;
  totalPurchasedItems: number;
  matched: ReconciliationMatchedItem[];
  notPurchased: { name: string; quantity: number }[];
  extras: { name: string; quantity: number; price: number | null }[];
  fulfillmentRate: number;
  totalSpent: number | null;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function getListReconciliation(userId: string, listId: string): Promise<ReconciliationData | null> {
  try {
    const { data: list } = await supabase
      .from('grocery_lists')
      .select('id, title, completed_at')
      .eq('id', listId)
      .eq('local_user_id', userId)
      .single();

    if (!list) return null;

    const { data: groceryItems } = await supabase
      .from('grocery_items')
      .select('id, name, quantity')
      .eq('list_id', listId);

    const { data: purchaseRecords } = await supabase
      .from('purchase_records')
      .select('id, store_name, total_amount')
      .eq('grocery_list_id', listId)
      .eq('local_user_id', userId);

    if (!purchaseRecords?.length) {
      const planned = groceryItems || [];
      return {
        listId,
        listTitle: list.title,
        listDate: list.completed_at || '',
        storeName: null,
        totalPlannedItems: planned.length,
        totalPurchasedItems: 0,
        matched: [],
        notPurchased: planned.map(g => ({ name: g.name, quantity: g.quantity })),
        extras: [],
        fulfillmentRate: 0,
        totalSpent: null,
      };
    }

    const recordIds = purchaseRecords.map(r => r.id);
    const { data: purchaseItems } = await supabase
      .from('purchase_items')
      .select('id, name, quantity, total_price, matched_grocery_item_id')
      .in('purchase_record_id', recordIds);

    const planned = groceryItems || [];
    const purchased = purchaseItems || [];

    const matchedGroceryIds = new Set<string>();
    const matchedPurchaseIds = new Set<string>();
    const matched: ReconciliationMatchedItem[] = [];

    // Phase 1: Use matched_grocery_item_id FK
    for (const pi of purchased) {
      if (pi.matched_grocery_item_id) {
        const gi = planned.find(g => g.id === pi.matched_grocery_item_id);
        if (gi) {
          matched.push({
            groceryItem: gi.name,
            purchaseItem: pi.name,
            quantity: pi.quantity ?? 1,
            price: pi.total_price ?? null,
          });
          matchedGroceryIds.add(gi.id);
          matchedPurchaseIds.add(pi.id);
        }
      }
    }

    // Phase 2: Fallback name matching for unmatched items
    for (const pi of purchased) {
      if (matchedPurchaseIds.has(pi.id)) continue;
      const piNorm = normalizeName(pi.name);
      for (const gi of planned) {
        if (matchedGroceryIds.has(gi.id)) continue;
        if (normalizeName(gi.name) === piNorm) {
          matched.push({
            groceryItem: gi.name,
            purchaseItem: pi.name,
            quantity: pi.quantity ?? 1,
            price: pi.total_price ?? null,
          });
          matchedGroceryIds.add(gi.id);
          matchedPurchaseIds.add(pi.id);
          break;
        }
      }
    }

    const notPurchased = planned
      .filter(g => !matchedGroceryIds.has(g.id))
      .map(g => ({ name: g.name, quantity: g.quantity }));

    const extras = purchased
      .filter(p => !matchedPurchaseIds.has(p.id))
      .map(p => ({ name: p.name, quantity: p.quantity ?? 1, price: p.total_price ?? null }));

    const fulfillmentRate = planned.length > 0
      ? Math.round((matched.length / planned.length) * 100)
      : 0;

    const totalSpent = purchaseRecords.reduce(
      (sum, r) => sum + (r.total_amount ?? 0), 0
    ) || null;

    return {
      listId,
      listTitle: list.title,
      listDate: list.completed_at || '',
      storeName: purchaseRecords[0]?.store_name || null,
      totalPlannedItems: planned.length,
      totalPurchasedItems: purchased.length,
      matched,
      notPurchased,
      extras,
      fulfillmentRate,
      totalSpent,
    };
  } catch (error) {
    console.error('Error getting list reconciliation:', error);
    return null;
  }
}

export interface PlannedVsActualStats {
  totalReconciled: number;
  avgFulfillmentRate: number;
  avgExtrasPerTrip: number;
  totalPlannedSpent: number | null;
  totalActualSpent: number | null;
}

export async function getPlannedVsActualStats(userId: string): Promise<PlannedVsActualStats> {
  try {
    const { data: linkedRecords } = await supabase
      .from('purchase_records')
      .select('grocery_list_id')
      .eq('local_user_id', userId)
      .not('grocery_list_id', 'is', null);

    if (!linkedRecords?.length) {
      return { totalReconciled: 0, avgFulfillmentRate: 0, avgExtrasPerTrip: 0, totalPlannedSpent: null, totalActualSpent: null };
    }

    const listIds = [...new Set(linkedRecords.map(r => r.grocery_list_id!))];
    let totalFulfillment = 0;
    let totalExtras = 0;
    let totalActual = 0;
    let reconciled = 0;

    for (const listId of listIds) {
      const recon = await getListReconciliation(userId, listId);
      if (!recon) continue;
      reconciled++;
      totalFulfillment += recon.fulfillmentRate;
      totalExtras += recon.extras.length;
      if (recon.totalSpent != null) totalActual += recon.totalSpent;
    }

    return {
      totalReconciled: reconciled,
      avgFulfillmentRate: reconciled > 0 ? Math.round(totalFulfillment / reconciled) : 0,
      avgExtrasPerTrip: reconciled > 0 ? Math.round((totalExtras / reconciled) * 10) / 10 : 0,
      totalPlannedSpent: null,
      totalActualSpent: totalActual > 0 ? Math.round(totalActual * 100) / 100 : null,
    };
  } catch (error) {
    console.error('Error getting planned vs actual stats:', error);
    return { totalReconciled: 0, avgFulfillmentRate: 0, avgExtrasPerTrip: 0, totalPlannedSpent: null, totalActualSpent: null };
  }
}

export interface StoreBasketComparison {
  storeName: string;
  totalSpent: number;
  tripCount: number;
  avgBasketCost: number;
}

export async function getStoreComparisonByBasket(userId: string): Promise<StoreBasketComparison[]> {
  try {
    const { data: records } = await supabase
      .from('purchase_records')
      .select('store_name, total_amount')
      .eq('local_user_id', userId)
      .not('store_name', 'is', null);

    if (!records?.length) return [];

    const storeMap = new Map<string, { totalSpent: number; tripCount: number }>();
    for (const r of records) {
      if (!r.store_name) continue;
      const cur = storeMap.get(r.store_name) || { totalSpent: 0, tripCount: 0 };
      cur.totalSpent += r.total_amount ?? 0;
      cur.tripCount += 1;
      storeMap.set(r.store_name, cur);
    }

    return Array.from(storeMap.entries())
      .map(([storeName, { totalSpent, tripCount }]) => ({
        storeName,
        totalSpent: Math.round(totalSpent * 100) / 100,
        tripCount,
        avgBasketCost: tripCount > 0 ? Math.round((totalSpent / tripCount) * 100) / 100 : 0,
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);
  } catch (error) {
    console.error('Error getting store comparison by basket:', error);
    return [];
  }
}

export interface SpendingByCategory {
  category: string;
  totalSpent: number;
  itemCount: number;
}

export async function getSpendingByCategory(userId: string): Promise<SpendingByCategory[]> {
  try {
    const { data: records } = await supabase
      .from('purchase_records')
      .select('id')
      .eq('local_user_id', userId);

    if (!records?.length) return [];

    const recordIds = records.map(r => r.id);
    const { data: purchaseItems } = await supabase
      .from('purchase_items')
      .select('name, total_price, matched_grocery_item_id')
      .in('purchase_record_id', recordIds);

    if (!purchaseItems?.length) return [];

    // Build category map from matched grocery items
    const matchedIds = purchaseItems
      .filter(p => p.matched_grocery_item_id)
      .map(p => p.matched_grocery_item_id!);

    const groceryCategoryMap = new Map<string, string>(); // grocery_item_id → category

    if (matchedIds.length > 0) {
      const { data: groceryItems } = await supabase
        .from('grocery_items')
        .select('id, name, category')
        .in('id', matchedIds);

      // Collect grocery items that have no category so we can batch-lookup from catalog
      const groceryItemsNeedingCatalog = (groceryItems || []).filter(gi => !gi.category);
      const catalogCats = await batchGetCategoriesFromCatalog(
        groceryItemsNeedingCatalog.map(gi => gi.name)
      );

      for (const gi of groceryItems || []) {
        const cat =
          gi.category ||
          catalogCats.get(gi.name?.trim().toLowerCase()) ||
          null; // null means we still don't know
        if (cat) groceryCategoryMap.set(gi.id, cat);
      }
    }

    // Collect all purchase item names without a resolved category (for catalog fallback)
    const unmatchedNames = purchaseItems
      .filter(pi => !pi.matched_grocery_item_id || !groceryCategoryMap.has(pi.matched_grocery_item_id))
      .map(pi => pi.name);
    const unmatchedCatalogCats = await batchGetCategoriesFromCatalog(unmatchedNames);

    const categoryMap = new Map<string, { totalSpent: number; itemCount: number }>();

    for (const pi of purchaseItems) {
      let cat: string;
      if (pi.matched_grocery_item_id && groceryCategoryMap.has(pi.matched_grocery_item_id)) {
        cat = groceryCategoryMap.get(pi.matched_grocery_item_id)!;
      } else {
        cat =
          unmatchedCatalogCats.get(pi.name?.trim().toLowerCase()) ||
          'ללא קטגוריה';
      }

      const cur = categoryMap.get(cat) || { totalSpent: 0, itemCount: 0 };
      cur.totalSpent += pi.total_price ?? 0;
      cur.itemCount += 1;
      categoryMap.set(cat, cur);
    }

    return Array.from(categoryMap.entries())
      .map(([category, { totalSpent, itemCount }]) => ({
        category,
        totalSpent: Math.round(totalSpent * 100) / 100,
        itemCount,
      }))
      .sort((a, b) => b.totalSpent - a.totalSpent);
  } catch (error) {
    console.error('Error getting spending by category:', error);
    return [];
  }
}

export interface RecentReconciliation {
  listId: string;
  listTitle: string;
  listDate: string;
  storeName: string | null;
  fulfillmentRate: number;
  matchedCount: number;
  missedCount: number;
  extrasCount: number;
  totalSpent: number | null;
}

export async function getRecentReconciliations(userId: string, limit: number = 10): Promise<RecentReconciliation[]> {
  try {
    const { data: records } = await supabase
      .from('purchase_records')
      .select('grocery_list_id')
      .eq('local_user_id', userId)
      .not('grocery_list_id', 'is', null)
      .order('created_at', { ascending: false });

    if (!records?.length) return [];

    const listIds = [...new Set(records.map(r => r.grocery_list_id!))].slice(0, limit);
    const results: RecentReconciliation[] = [];

    for (const listId of listIds) {
      const recon = await getListReconciliation(userId, listId);
      if (!recon) continue;
      results.push({
        listId: recon.listId,
        listTitle: recon.listTitle,
        listDate: recon.listDate,
        storeName: recon.storeName,
        fulfillmentRate: recon.fulfillmentRate,
        matchedCount: recon.matched.length,
        missedCount: recon.notPurchased.length,
        extrasCount: recon.extras.length,
        totalSpent: recon.totalSpent,
      });
    }

    return results;
  } catch (error) {
    console.error('Error getting recent reconciliations:', error);
    return [];
  }
}

// ---- Missing Items by Store ----

export interface StoreMissingStats {
  storeName: string;
  totalMissedItems: number;
  reconciledTrips: number;
  avgMissedPerTrip: number;
}

/**
 * Aggregates which stores had the most missing items from reconciled lists.
 */
export async function getMissingItemsByStore(userId: string): Promise<StoreMissingStats[]> {
  try {
    const { data: records } = await supabase
      .from('purchase_records')
      .select('grocery_list_id, store_name')
      .eq('local_user_id', userId)
      .not('grocery_list_id', 'is', null)
      .not('store_name', 'is', null);

    if (!records?.length) return [];

    const storeMap = new Map<string, { totalMissed: number; trips: number }>();

    const processedListIds = new Set<string>();

    for (const rec of records) {
      if (!rec.grocery_list_id || !rec.store_name) continue;
      const key = `${rec.grocery_list_id}_${rec.store_name}`;
      if (processedListIds.has(key)) continue;
      processedListIds.add(key);

      const recon = await getListReconciliation(userId, rec.grocery_list_id);
      if (!recon) continue;

      const cur = storeMap.get(rec.store_name) || { totalMissed: 0, trips: 0 };
      cur.totalMissed += recon.notPurchased.length;
      cur.trips += 1;
      storeMap.set(rec.store_name, cur);
    }

    return Array.from(storeMap.entries())
      .map(([storeName, { totalMissed, trips }]) => ({
        storeName,
        totalMissedItems: totalMissed,
        reconciledTrips: trips,
        avgMissedPerTrip: trips > 0 ? Math.round((totalMissed / trips) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.avgMissedPerTrip - a.avgMissedPerTrip);
  } catch (error) {
    console.error('Error getting missing items by store:', error);
    return [];
  }
}

/**
 * Get all dashboard stats at once. All data is per-user and from completed lists (and purchased items) only.
 */
export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  try {
    const [totalPurchasedItems, totalCompletedLists, topItems, categoryDistribution, monthlyTrend, completionTimelineByDay] = await Promise.all([
      getTotalPurchasedItems(userId),
      getTotalCompletedLists(userId),
      getTopPurchasedItems(userId, 10),
      getCategoryDistribution(userId),
      getMonthlyTrend(userId),
      getCompletionTimelineByDay(userId),
    ]);

    const avgItemsPerList = totalCompletedLists > 0 
      ? Math.round((totalPurchasedItems / totalCompletedLists) * 10) / 10 
      : 0;

    return {
      totalPurchasedItems,
      totalCompletedLists,
      avgItemsPerList,
      topItems,
      categoryDistribution,
      monthlyTrend,
      completionTimelineByDay,
    };
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    return {
      totalPurchasedItems: 0,
      totalCompletedLists: 0,
      avgItemsPerList: 0,
      topItems: [],
      categoryDistribution: [],
      monthlyTrend: [],
      completionTimelineByDay: [],
    };
  }
}

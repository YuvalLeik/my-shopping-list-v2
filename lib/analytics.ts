import { supabase } from './supabase';
import { getSpendingByMonth as getSpendingByMonthFromPrices, getAverageItemPrices, getItemPriceHistory, getStorePriceComparison, PricePoint, StorePriceComparison, MonthlySpending } from './itemPrices';

export type { PricePoint, StorePriceComparison, MonthlySpending };

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
 * Get category distribution (completed lists + standalone as "ללא קטגוריה")
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
        .select('category, quantity')
        .in('list_id', listIds)
        .eq('purchased', true);

      for (const item of items || []) {
        const category = item.category || 'ללא קטגוריה';
        const current = categoryMap.get(category) || { count: 0, total_quantity: 0 };
        categoryMap.set(category, {
          count: current.count + 1,
          total_quantity: current.total_quantity + item.quantity,
        });
      }
    }

    const standaloneItems = await getStandalonePurchaseItems(userId);
    for (const item of standaloneItems) {
      const category = 'ללא קטגוריה';
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

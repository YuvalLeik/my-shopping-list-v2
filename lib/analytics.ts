import { supabase } from './supabase';

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
 * Get top purchased items for a user
 */
export async function getTopPurchasedItems(userId: string, limit: number = 10): Promise<TopItem[]> {
  try {
    // Get all completed lists for this user
    const { data: completedLists, error: listsError } = await supabase
      .from('grocery_lists')
      .select('id')
      .eq('local_user_id', userId)
      .not('completed_at', 'is', null);

    if (listsError || !completedLists || completedLists.length === 0) {
      return [];
    }

    const listIds = completedLists.map(list => list.id);

    // Get all purchased items from completed lists
    const { data: items, error: itemsError } = await supabase
      .from('grocery_items')
      .select('name, quantity')
      .in('list_id', listIds)
      .eq('purchased', true);

    if (itemsError || !items) {
      return [];
    }

    // Aggregate by name
    const itemMap = new Map<string, number>();
    for (const item of items) {
      const current = itemMap.get(item.name) || 0;
      itemMap.set(item.name, current + item.quantity);
    }

    // Convert to array and sort
    const topItems: TopItem[] = Array.from(itemMap.entries())
      .map(([name, total_quantity]) => ({ name, total_quantity }))
      .sort((a, b) => b.total_quantity - a.total_quantity)
      .slice(0, limit);

    return topItems;
  } catch (error) {
    console.error('Error getting top purchased items:', error);
    return [];
  }
}

/**
 * Get total number of purchased items
 */
export async function getTotalPurchasedItems(userId: string): Promise<number> {
  try {
    const { data: completedLists, error: listsError } = await supabase
      .from('grocery_lists')
      .select('id')
      .eq('local_user_id', userId)
      .not('completed_at', 'is', null);

    if (listsError || !completedLists || completedLists.length === 0) {
      return 0;
    }

    const listIds = completedLists.map(list => list.id);

    const { data: items, error: itemsError } = await supabase
      .from('grocery_items')
      .select('quantity')
      .in('list_id', listIds)
      .eq('purchased', true);

    if (itemsError || !items) {
      return 0;
    }

    return items.reduce((sum, item) => sum + item.quantity, 0);
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
 * Get category distribution
 */
export async function getCategoryDistribution(userId: string): Promise<CategoryDistribution[]> {
  try {
    const { data: completedLists, error: listsError } = await supabase
      .from('grocery_lists')
      .select('id')
      .eq('local_user_id', userId)
      .not('completed_at', 'is', null);

    if (listsError || !completedLists || completedLists.length === 0) {
      return [];
    }

    const listIds = completedLists.map(list => list.id);

    const { data: items, error: itemsError } = await supabase
      .from('grocery_items')
      .select('category, quantity')
      .in('list_id', listIds)
      .eq('purchased', true);

    if (itemsError || !items) {
      return [];
    }

    // Aggregate by category
    const categoryMap = new Map<string, { count: number; total_quantity: number }>();
    for (const item of items) {
      const category = item.category || 'ללא קטגוריה';
      const current = categoryMap.get(category) || { count: 0, total_quantity: 0 };
      categoryMap.set(category, {
        count: current.count + 1,
        total_quantity: current.total_quantity + item.quantity,
      });
    }

    return Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        count: data.count,
        total_quantity: data.total_quantity,
      }))
      .sort((a, b) => b.total_quantity - a.total_quantity);
  } catch (error) {
    console.error('Error getting category distribution:', error);
    return [];
  }
}

/**
 * Get monthly trend of purchased items
 */
export async function getMonthlyTrend(userId: string): Promise<MonthlyTrend[]> {
  try {
    const { data: completedLists, error: listsError } = await supabase
      .from('grocery_lists')
      .select('id, completed_at')
      .eq('local_user_id', userId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: true });

    if (listsError || !completedLists || completedLists.length === 0) {
      return [];
    }

    // Group by month
    const monthlyMap = new Map<string, number>();

    for (const list of completedLists) {
      if (!list.completed_at) continue;

      const date = new Date(list.completed_at);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const monthYear = `${year}-${String(month).padStart(2, '0')}`;

      // Get items count for this list
      const { data: items } = await supabase
        .from('grocery_items')
        .select('quantity')
        .eq('list_id', list.id)
        .eq('purchased', true);

      const itemCount = items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

      const current = monthlyMap.get(monthYear) || 0;
      monthlyMap.set(monthYear, current + itemCount);
    }

    // Convert to array and format
    const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

    return Array.from(monthlyMap.entries())
      .map(([monthYear, total_items]) => {
        const [year, month] = monthYear.split('-');
        return {
          month: monthNames[parseInt(month) - 1],
          year: parseInt(year),
          month_year: monthYear,
          total_items,
        };
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
 * Get all unique purchased item names for a user
 */
export async function getAllPurchasedItemNames(userId: string): Promise<string[]> {
  try {
    const { data: completedLists, error: listsError } = await supabase
      .from('grocery_lists')
      .select('id')
      .eq('local_user_id', userId)
      .not('completed_at', 'is', null);

    if (listsError || !completedLists || completedLists.length === 0) {
      return [];
    }

    const listIds = completedLists.map(list => list.id);

    const { data: items, error: itemsError } = await supabase
      .from('grocery_items')
      .select('name')
      .in('list_id', listIds)
      .eq('purchased', true);

    if (itemsError || !items) {
      return [];
    }

    // Get unique names and sort alphabetically
    const uniqueNames = [...new Set(items.map(item => item.name))].sort((a, b) => a.localeCompare(b, 'he'));
    return uniqueNames;
  } catch (error) {
    console.error('Error getting all purchased item names:', error);
    return [];
  }
}

/**
 * Get monthly trend for a specific item
 */
export async function getItemMonthlyTrend(userId: string, itemName: string): Promise<MonthlyTrend[]> {
  try {
    const { data: completedLists, error: listsError } = await supabase
      .from('grocery_lists')
      .select('id, completed_at')
      .eq('local_user_id', userId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: true });

    if (listsError || !completedLists || completedLists.length === 0) {
      return [];
    }

    // Group by month
    const monthlyMap = new Map<string, number>();

    for (const list of completedLists) {
      if (!list.completed_at) continue;

      const date = new Date(list.completed_at);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const monthYear = `${year}-${String(month).padStart(2, '0')}`;

      // Get items count for this specific item in this list
      const { data: items } = await supabase
        .from('grocery_items')
        .select('quantity')
        .eq('list_id', list.id)
        .eq('purchased', true)
        .ilike('name', itemName);

      const itemCount = items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

      if (itemCount > 0) {
        const current = monthlyMap.get(monthYear) || 0;
        monthlyMap.set(monthYear, current + itemCount);
      }
    }

    // Convert to array and format
    const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

    return Array.from(monthlyMap.entries())
      .map(([monthYear, total_items]) => {
        const [year, month] = monthYear.split('-');
        return {
          month: monthNames[parseInt(month) - 1],
          year: parseInt(year),
          month_year: monthYear,
          total_items,
        };
      })
      .sort((a, b) => a.month_year.localeCompare(b.month_year));
  } catch (error) {
    console.error('Error getting item monthly trend:', error);
    return [];
  }
}

/**
 * Get completion timeline by day: for each date (YYYY-MM-DD) with at least one completed list,
 * returns listCount and totalItems (purchased). Per-user, completed lists only.
 */
export async function getCompletionTimelineByDay(userId: string): Promise<CompletionDatePoint[]> {
  try {
    const { data: completedLists, error: listsError } = await supabase
      .from('grocery_lists')
      .select('id, completed_at')
      .eq('local_user_id', userId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: true });

    if (listsError || !completedLists || completedLists.length === 0) {
      return [];
    }

    const dateMap = new Map<string, { listCount: number; totalItems: number }>();

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
      dateMap.set(date, {
        listCount: current.listCount + 1,
        totalItems: current.totalItems + itemCount,
      });
    }

    return Array.from(dateMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error('Error getting completion timeline by day:', error);
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

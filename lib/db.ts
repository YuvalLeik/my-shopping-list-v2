import { supabase } from './supabaseClient';

export interface ShoppingList {
  id: string;
  list_date: string; // ISO date string YYYY-MM-DD
  title: string | null;
  is_completed: boolean;
  created_at: string;
}

export interface ShoppingItem {
  id: string;
  list_id: string;
  name: string;
  category: string;
  quantity: number;
  purchased: boolean;
  image_url: string | null;
  created_at: string;
}

export interface ShoppingListWithItemCount extends ShoppingList {
  item_count: number;
}

// Format date from ISO (YYYY-MM-DD) to DD.MM.YYYY
export function formatDateDisplay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

// Format date from DD.MM.YYYY to ISO (YYYY-MM-DD)
export function parseDateDisplay(displayDate: string): string {
  const [day, month, year] = displayDate.split('.');
  return `${year}-${month}-${day}`;
}

// Get today's date as ISO string (YYYY-MM-DD)
export function getTodayISO(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get all lists with item counts, sorted by date descending
export async function getLists(): Promise<ShoppingListWithItemCount[]> {
  try {
    const { data: lists, error: listsError } = await supabase
      .from('shopping_lists')
      .select('*')
      .order('list_date', { ascending: false });

    if (listsError) {
      throw new Error(`Failed to fetch lists: ${listsError.message}`);
    }

    if (!lists || lists.length === 0) {
      return [];
    }

    // Get item counts for each list
    const listIds = lists.map(list => list.id);
    const { data: items, error: itemsError } = await supabase
      .from('shopping_items')
      .select('list_id')
      .in('list_id', listIds);

    if (itemsError) {
      throw new Error(`Failed to fetch item counts: ${itemsError.message}`);
    }

    // Count items per list
    const itemCounts = new Map<string, number>();
    items?.forEach(item => {
      itemCounts.set(item.list_id, (itemCounts.get(item.list_id) || 0) + 1);
    });

    return lists.map(list => ({
      ...list,
      item_count: itemCounts.get(list.id) || 0,
    }));
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Unknown error fetching lists'
    );
  }
}

// Get list by date (ISO format YYYY-MM-DD)
export async function getListByDate(dateISO: string): Promise<ShoppingList | null> {
  try {
    const { data, error } = await supabase
      .from('shopping_lists')
      .select('*')
      .eq('list_date', dateISO)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      throw new Error(`Failed to fetch list: ${error.message}`);
    }

    return data;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Unknown error fetching list by date'
    );
  }
}

// Get list by ID
export async function getListById(listId: string): Promise<ShoppingList | null> {
  try {
    const { data, error } = await supabase
      .from('shopping_lists')
      .select('*')
      .eq('id', listId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to fetch list: ${error.message}`);
    }

    return data;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Unknown error fetching list by ID'
    );
  }
}

// Create a new list for a date
export async function createList(dateISO: string, title?: string): Promise<ShoppingList> {
  try {
    const { data, error } = await supabase
      .from('shopping_lists')
      .insert([{ list_date: dateISO, title: title || null }])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create list: ${error.message}`);
    }

    return data;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Unknown error creating list'
    );
  }
}

// Get or create list for a date (returns existing or creates new)
export async function getOrCreateList(dateISO: string): Promise<ShoppingList> {
  try {
    let list = await getListByDate(dateISO);
    if (!list) {
      list = await createList(dateISO);
    }
    return list;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Unknown error getting or creating list'
    );
  }
}

// Get items for a list
export async function getItems(listId: string): Promise<ShoppingItem[]> {
  try {
    const { data, error } = await supabase
      .from('shopping_items')
      .select('*')
      .eq('list_id', listId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch items: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Unknown error fetching items'
    );
  }
}

// Add item to a list
export async function addItem(
  listId: string,
  name: string,
  category: string = 'ללא קטגוריה',
  quantity: number = 1,
  imageUrl?: string | null
): Promise<ShoppingItem> {
  try {
    const { data, error } = await supabase
      .from('shopping_items')
      .insert([
        {
          list_id: listId,
          name,
          category,
          quantity,
          image_url: imageUrl || null,
        },
      ])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to add item: ${error.message}`);
    }

    return data;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Unknown error adding item'
    );
  }
}

// Update item
export async function updateItem(
  itemId: string,
  updates: {
    name?: string;
    category?: string;
    quantity?: number;
    purchased?: boolean;
    image_url?: string | null;
  }
): Promise<ShoppingItem> {
  try {
    const { data, error } = await supabase
      .from('shopping_items')
      .update(updates)
      .eq('id', itemId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update item: ${error.message}`);
    }

    return data;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Unknown error updating item'
    );
  }
}

// Delete item
export async function deleteItem(itemId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('shopping_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      throw new Error(`Failed to delete item: ${error.message}`);
    }
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Unknown error deleting item'
    );
  }
}

// Mark list as completed
export async function markListCompleted(listId: string): Promise<ShoppingList> {
  try {
    const { data, error } = await supabase
      .from('shopping_lists')
      .update({ is_completed: true })
      .eq('id', listId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to mark list as completed: ${error.message}`);
    }

    return data;
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'Unknown error marking list as completed'
    );
  }
}

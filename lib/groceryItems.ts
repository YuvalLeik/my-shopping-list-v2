import { supabase } from './supabase';
import { upsertShoppingItemToCatalog } from './shoppingItems';

export interface GroceryItem {
  id: string;
  list_id: string;
  name: string;
  category?: string;
  quantity: number;
  purchased?: boolean;
  image_url?: string | null;
  created_at: string;
}

export async function fetchGroceryItems(listId: string, userId?: string): Promise<GroceryItem[]> {
  // First verify the list belongs to the user (if userId provided)
  if (userId) {
    const { data: listCheck, error: listError } = await supabase
      .from('grocery_lists')
      .select('id')
      .eq('id', listId)
      .eq('local_user_id', userId)
      .single();

    if (listError || !listCheck) {
      throw new Error(`Failed to fetch grocery items: List not found or access denied`);
    }
  }

  const { data, error } = await supabase
    .from('grocery_items')
    .select('*')
    .eq('list_id', listId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch grocery items: ${error.message}`);
  }

  return data || [];
}

export async function createGroceryItem(
  listId: string,
  name: string,
  quantity: number = 1,
  category: string = 'ללא קטגוריה',
  image_url?: string | null
): Promise<GroceryItem> {
  const insertData: Record<string, unknown> = { list_id: listId, name, quantity, category };
  if (image_url !== undefined) {
    insertData.image_url = image_url;
  }

  const { data, error } = await supabase
    .from('grocery_items')
    .insert([insertData])
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to create grocery item: ${error.message}`);
  }

  // Also save to global catalog (shopping_items) for learning/suggestions
  // This is done asynchronously AFTER successful creation - don't fail if it doesn't work
  // Only update catalog if item creation succeeded
  upsertShoppingItemToCatalog(name, category, image_url).catch(() => {
    // Silently fail - catalog update is not critical, item is already in user's list
  });

  return data;
}

// Get category for an item by name from global catalog (shopping_items)
// This is shared across all users for learning
export async function getItemCategoryByName(itemName: string, userId: string): Promise<string | null> {
  void userId; // Reserved for future per-user filtering
  try {
    // Use global shopping_items catalog (not filtered by user_id)
    const { data, error } = await supabase
      .from('shopping_items')
      .select('category')
      .ilike('name', itemName.trim())
      .not('category', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) {
      return null;
    }

    return data[0]?.category || null;
  } catch {
    return null;
  }
}

export async function deleteGroceryItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('grocery_items')
    .delete()
    .eq('id', itemId);

  if (error) {
    throw new Error(`Failed to delete grocery item: ${error.message}`);
  }
}

export async function updateGroceryItem(
  itemId: string,
  updates: { quantity?: number; purchased?: boolean; image_url?: string | null }
): Promise<GroceryItem> {
  const { data, error } = await supabase
    .from('grocery_items')
    .update(updates)
    .eq('id', itemId)
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to update grocery item: ${error.message}`);
  }

  return data;
}

export async function fetchGroceryItemById(itemId: string): Promise<GroceryItem> {
  const { data, error } = await supabase
    .from('grocery_items')
    .select('*')
    .eq('id', itemId)
    .single();
  if (error) throw new Error(`Failed to fetch grocery item by id: ${error.message}`);
  return data as GroceryItem;
}

// Get all unique item names from global catalog (shopping_items) for autocomplete
// This is shared across all users for learning/suggestions
export async function getAllItemNames(userId: string): Promise<string[]> {
  void userId; // Reserved for future per-user filtering
  // Use global shopping_items catalog (not filtered by user_id)
  const { data, error } = await supabase
    .from('shopping_items')
    .select('name')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch item names: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Get unique names (case-insensitive deduplication)
  const uniqueNamesMap = new Map<string, string>();
  for (const item of data) {
    const normalized = item.name.toLowerCase().trim();
    if (!uniqueNamesMap.has(normalized)) {
      uniqueNamesMap.set(normalized, item.name); // Keep original casing
    }
  }

  return Array.from(uniqueNamesMap.values());
}

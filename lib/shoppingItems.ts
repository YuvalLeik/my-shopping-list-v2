import { supabase } from './supabase';

export interface ShoppingItemCatalog {
  id: string;
  name: string;
  image_url: string | null;
  category?: string | null;
}

/**
 * Normalize item name for consistent storage and lookup
 * - Trim whitespace
 * - Collapse multiple spaces to single space
 * - Convert to lowercase
 */
export function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Get shopping item by name (case-insensitive)
 * Returns the most recent shopping item with this name (by created_at)
 * Used as catalog for item images
 */
export async function getShoppingItemByName(name: string): Promise<ShoppingItemCatalog | null> {
  try {
    const normalizedName = normalizeItemName(name);
    const { data, error } = await supabase
      .from('shopping_items')
      .select('id, name, image_url, category')
      .ilike('name', normalizedName)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      // If no row found, return null (not an error)
      if (error.code === 'PGRST116') {
        return null;
      }
      // Return null on any error to allow graceful fallback
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      name: data.name,
      image_url: data.image_url,
      category: data.category || null,
    };
  } catch (err) {
    // Return null on any error to allow graceful fallback
    return null;
  }
}

/**
 * Upsert shopping item image by name
 * - Searches for existing item by normalized name (case-insensitive)
 * - If found: updates image_url
 * - If not found: creates new record with name and image_url (requires a dummy list_id)
 * 
 * Note: Since shopping_items requires list_id, we need to handle this carefully.
 * For catalog purposes, we'll update existing items or create with a placeholder list_id.
 */
/**
 * Get all unique shopping items by category from the global catalog
 * Returns items with id, name, image_url, and category
 * Filters by exact category match (including "ללא קטגוריה")
 * Deduplicates by name (case-insensitive + trim)
 * Sorts: first items with image_url, then by name (alphabetically)
 */
export async function getShoppingItemsByCategory(category: string): Promise<ShoppingItemCatalog[]> {
  try {
    // Normalize category for exact match (handle null/undefined as "ללא קטגוריה")
    const normalizedCategory = category || 'ללא קטגוריה';
    
    const { data, error } = await supabase
      .from('shopping_items')
      .select('id, name, image_url, category')
      .eq('category', normalizedCategory);

    if (error) {
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Deduplicate by normalized name (case-insensitive + trim)
    // Keep the item with image_url if there are duplicates
    const uniqueItemsMap = new Map<string, ShoppingItemCatalog>();
    for (const item of data) {
      const normalizedName = normalizeItemName(item.name);
      const existing = uniqueItemsMap.get(normalizedName);
      
      if (!existing) {
        // First occurrence - add it
        uniqueItemsMap.set(normalizedName, {
          id: item.id,
          name: item.name,
          image_url: item.image_url,
          category: item.category || null,
        });
      } else if (item.image_url && !existing.image_url) {
        // Prefer item with image_url over one without
        uniqueItemsMap.set(normalizedName, {
          id: item.id,
          name: item.name,
          image_url: item.image_url,
          category: item.category || null,
        });
      }
    }

    // Sort: first items with image_url, then by name (alphabetically)
    const items = Array.from(uniqueItemsMap.values());
    items.sort((a, b) => {
      // First: items with image_url come first
      const aHasImage = a.image_url ? 1 : 0;
      const bHasImage = b.image_url ? 1 : 0;
      if (aHasImage !== bHasImage) {
        return bHasImage - aHasImage;
      }
      // Then: sort by name (alphabetically)
      return a.name.localeCompare(b.name, 'he');
    });

    return items;
  } catch (err) {
    return [];
  }
}

/**
 * Diagnostic function: Get statistics about shopping_items table
 * Returns total count and top 5 categories
 */
export async function getShoppingItemsDiagnostics(): Promise<{
  totalCount: number;
  topCategories: Array<{ category: string; count: number }>;
}> {
  try {
    // Get total count
    const { count, error: countError } = await supabase
      .from('shopping_items')
      .select('*', { count: 'exact', head: true });

    const totalCount = count || 0;

    // Get top categories
    const { data: categoryData, error: categoryError } = await supabase
      .from('shopping_items')
      .select('category');

    if (categoryError || !categoryData) {
      return { totalCount, topCategories: [] };
    }

    // Count categories
    const categoryCounts = new Map<string, number>();
    for (const item of categoryData) {
      const cat = item.category || 'ללא קטגוריה';
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    }

    // Sort by count and get top 5
    const topCategories = Array.from(categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { totalCount, topCategories };
  } catch (err) {
    return { totalCount: 0, topCategories: [] };
  }
}

/**
 * Upsert shopping item to global catalog (name, category, image_url)
 * This ensures the item exists in shopping_items for learning/suggestions
 * Does not require user_id - this is global knowledge
 */
export async function upsertShoppingItemToCatalog(
  name: string,
  category: string = 'ללא קטגוריה',
  image_url?: string | null
): Promise<void> {
  try {
    const normalizedName = normalizeItemName(name);
    
    // Check if item already exists
    const { data: existing, error: findError } = await supabase
      .from('shopping_items')
      .select('id, category, image_url')
      .ilike('name', normalizedName)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError && findError.code !== 'PGRST116') {
      return; // Silently fail
    }

    // Get or create a catalog list_id
    let listId: string;
    const { data: firstList, error: listError } = await supabase
      .from('shopping_lists')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (listError || !firstList) {
      const { data: newList, error: createListError } = await supabase
        .from('shopping_lists')
        .insert({
          list_date: new Date().toISOString().split('T')[0],
          title: 'Item Catalog',
          is_completed: false,
        })
        .select('id')
        .single();

      if (createListError || !newList) {
        return; // Silently fail
      }
      listId = newList.id;
    } else {
      listId = firstList.id;
    }

    if (existing) {
      // Update existing item - prefer new category/image if provided
      const updates: { category?: string; image_url?: string } = {};
      if (category && category !== 'ללא קטגוריה' && (!existing.category || existing.category === 'ללא קטגוריה')) {
        updates.category = category;
      }
      if (image_url && !existing.image_url) {
        updates.image_url = image_url;
      }
      
      if (Object.keys(updates).length > 0) {
        await supabase
          .from('shopping_items')
          .update(updates)
          .eq('id', existing.id);
      }
    } else {
      // Create new item in catalog
      await supabase
        .from('shopping_items')
        .insert({
          list_id: listId,
          name: name,
          category: category,
          image_url: image_url || null,
          quantity: 1,
          purchased: false,
        });
    }
  } catch (err) {
    // Silently fail - don't break item creation
  }
}

/**
 * Get all distinct categories from shopping_items (non-empty)
 */
export async function getCategories(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('shopping_items')
      .select('category')
      .not('category', 'is', null);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Get unique categories
    const categories = new Set<string>();
    for (const item of data) {
      if (item.category && item.category.trim() !== '') {
        categories.add(item.category);
      }
    }

    // Also add "ללא קטגוריה" if there are items without category
    const { data: nullCategoryData } = await supabase
      .from('shopping_items')
      .select('id')
      .is('category', null)
      .limit(1);

    if (nullCategoryData && nullCategoryData.length > 0) {
      categories.add('ללא קטגוריה');
    }

    return Array.from(categories).sort();
  } catch (err) {
    throw err;
  }
}

/**
 * Get suggestions by prefix (for autocomplete)
 * Returns up to 8 items from shopping_items where name ILIKE 'prefix%'
 */
export async function getSuggestionsByPrefix(prefix: string): Promise<ShoppingItemCatalog[]> {
  try {
    if (!prefix || prefix.trim().length === 0) {
      return [];
    }

    const normalizedPrefix = normalizeItemName(prefix);
    
    const { data, error } = await supabase
      .from('shopping_items')
      .select('id, name, image_url, category')
      .ilike('name', `${normalizedPrefix}%`)
      .order('name', { ascending: true })
      .limit(8);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Deduplicate by normalized name
    const uniqueItemsMap = new Map<string, ShoppingItemCatalog>();
    for (const item of data) {
      const normalizedName = normalizeItemName(item.name);
      if (!uniqueItemsMap.has(normalizedName)) {
        uniqueItemsMap.set(normalizedName, {
          id: item.id,
          name: item.name,
          image_url: item.image_url,
          category: item.category || null,
        });
      }
    }

    return Array.from(uniqueItemsMap.values());
  } catch (err) {
    throw err;
  }
}

/**
 * Filter out items that already exist in the current list
 * Normalizes item names for comparison (trim, lowercase, collapse spaces)
 */
export function filterExistingItems(
  catalogItems: ShoppingItemCatalog[],
  currentListItems: Array<{ name: string }>
): ShoppingItemCatalog[] {
  if (!currentListItems || currentListItems.length === 0) {
    return catalogItems;
  }

  // Create a set of normalized names from current list
  const existingNames = new Set<string>();
  for (const item of currentListItems) {
    const normalized = normalizeItemName(item.name);
    existingNames.add(normalized);
  }

  // Filter out items that exist in the list
  return catalogItems.filter(item => {
    const normalized = normalizeItemName(item.name);
    return !existingNames.has(normalized);
  });
}

/**
 * Get items by category (up to 20 items)
 * Returns items from shopping_items filtered by exact category match
 */
export async function getItemsByCategory(category: string): Promise<ShoppingItemCatalog[]> {
  try {
    const normalizedCategory = category || 'ללא קטגוריה';
    
    const { data, error } = await supabase
      .from('shopping_items')
      .select('id, name, image_url, category')
      .eq('category', normalizedCategory)
      .order('name', { ascending: true })
      .limit(20);

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Deduplicate by normalized name, prefer items with image_url
    const uniqueItemsMap = new Map<string, ShoppingItemCatalog>();
    for (const item of data) {
      const normalizedName = normalizeItemName(item.name);
      const existing = uniqueItemsMap.get(normalizedName);
      
      if (!existing) {
        uniqueItemsMap.set(normalizedName, {
          id: item.id,
          name: item.name,
          image_url: item.image_url,
          category: item.category || null,
        });
      } else if (item.image_url && !existing.image_url) {
        // Prefer item with image_url
        uniqueItemsMap.set(normalizedName, {
          id: item.id,
          name: item.name,
          image_url: item.image_url,
          category: item.category || null,
        });
      }
    }

    // Sort: items with image_url first, then alphabetically
    const items = Array.from(uniqueItemsMap.values());
    items.sort((a, b) => {
      const aHasImage = a.image_url ? 1 : 0;
      const bHasImage = b.image_url ? 1 : 0;
      if (aHasImage !== bHasImage) {
        return bHasImage - aHasImage;
      }
      return a.name.localeCompare(b.name, 'he');
    });

    return items;
  } catch (err) {
    throw err;
  }
}

export async function upsertShoppingItemImageByName(name: string, imageUrl: string): Promise<void> {
  try {
    const normalizedName = normalizeItemName(name);
    
    // First, try to find existing item by normalized name (case-insensitive)
    const { data: existing, error: findError } = await supabase
      .from('shopping_items')
      .select('id')
      .ilike('name', normalizedName)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError && findError.code !== 'PGRST116') {
      // Error other than "not found" - return to allow graceful fallback
      return;
    }

    if (existing) {
      // Update existing item
      const { error: updateError } = await supabase
        .from('shopping_items')
        .update({ image_url: imageUrl })
        .eq('id', existing.id);

      if (updateError) {
        throw new Error(`Failed to update shopping item image: ${updateError.message}`);
      }
    } else {
      // Create new item - but we need a list_id
      // Get the first shopping_list or create a catalog list
      let listId: string;
      const { data: firstList, error: listError } = await supabase
        .from('shopping_lists')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (listError || !firstList) {
        // If no list exists, create a catalog list
        const { data: newList, error: createListError } = await supabase
          .from('shopping_lists')
          .insert({
            list_date: new Date().toISOString().split('T')[0],
            title: 'Item Catalog',
            is_completed: false,
          })
          .select('id')
          .single();

        if (createListError || !newList) {
          // If we can't create a list, silently fail (don't break image upload)
          return;
        }
        listId = newList.id;
      } else {
        listId = firstList.id;
      }

      // Try to insert new item
      const { data: insertedItem, error: insertError } = await supabase
        .from('shopping_items')
        .insert({
          list_id: listId,
          name: name, // Store original name (not normalized) for display
          image_url: imageUrl,
          category: 'ללא קטגוריה',
          quantity: 1,
          purchased: false,
        })
        .select('id')
        .single();

      if (insertError) {
        // Check if it's a unique violation or duplicate name error
        // If so, fetch the existing item and update it instead
        if (insertError.code === '23505' || insertError.message.includes('duplicate') || insertError.message.includes('unique')) {
          // Unique violation - item already exists, fetch it and update
          const { data: existingItem, error: fetchError } = await supabase
            .from('shopping_items')
            .select('id')
            .ilike('name', normalizedName)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (fetchError || !existingItem) {
            // Can't fetch existing item, silently fail
            return;
          }

          // Update the existing item
          const { error: updateError } = await supabase
            .from('shopping_items')
            .update({ image_url: imageUrl })
            .eq('id', existingItem.id);

          if (updateError) {
            // Silently fail - don't break image upload
            return;
          }
        } else {
          // Other error - silently fail
          return;
        }
      }
    }
  } catch (err) {
    // Don't throw - image upload should still succeed even if catalog save fails
    // The error will be logged by the caller if needed
  }
}

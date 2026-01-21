import { supabase } from './supabase';

export interface GroceryList {
  id: string;
  local_user_id: string;
  title: string;
  created_at: string;
  completed_at?: string | null;
}

export interface GroceryListWithCount extends GroceryList {
  item_count: number;
}

export async function fetchGroceryLists(userId: string): Promise<GroceryList[]> {
  // Try to filter by completed_at, but handle gracefully if column doesn't exist
  const { data, error } = await supabase
    .from('grocery_lists')
    .select('*')
    .eq('local_user_id', userId)
    .is('completed_at', null) // Only get non-completed lists
    .order('created_at', { ascending: false });

  if (error) {
    // If error is about completed_at column, try again without the filter
    if (error.message.includes('completed_at') || error.message.includes('column') || error.message.includes('schema cache')) {
      const { data: retryData, error: retryError } = await supabase
        .from('grocery_lists')
        .select('*')
        .eq('local_user_id', userId)
        .order('created_at', { ascending: false });
      
      if (retryError) {
        throw new Error(`Failed to fetch grocery lists: ${retryError.message}`);
      }
      
      return retryData || [];
    }
    throw new Error(`Failed to fetch grocery lists: ${error.message}`);
  }

  return data || [];
}

export async function fetchGroceryListsWithItemCount(userId: string, includeCompleted: boolean = true): Promise<GroceryListWithCount[]> {
  let query = supabase
    .from('grocery_lists')
    .select('*')
    .eq('local_user_id', userId);
  
  if (!includeCompleted) {
    query = query.is('completed_at', null);
  }
  
  const { data: lists, error: listsError } = await query.order('created_at', { ascending: false });

  if (listsError) {
    // If error is about completed_at column, try again without the filter
    if (listsError.message.includes('completed_at') || listsError.message.includes('column') || listsError.message.includes('schema cache')) {
      const { data: retryData, error: retryError } = await supabase
        .from('grocery_lists')
        .select('*')
        .eq('local_user_id', userId)
        .order('created_at', { ascending: false });
      
      if (retryError) {
        throw new Error(`Failed to fetch grocery lists: ${retryError.message}`);
      }
      
      // If includeCompleted is true, return all lists (they won't have completed_at)
      // If false, return empty array since we can't filter
      if (!includeCompleted) {
        return [];
      }
      
      const allLists = retryData || [];
      
      // Get item counts for each list
      const listIds = allLists.map(list => list.id);
      if (listIds.length === 0) {
        return [];
      }
      
      const { data: items, error: itemsError } = await supabase
        .from('grocery_items')
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

      return allLists.map(list => ({
        ...list,
        item_count: itemCounts.get(list.id) || 0,
      }));
    }
    throw new Error(`Failed to fetch grocery lists: ${listsError.message}`);
  }

  if (!lists || lists.length === 0) {
    return [];
  }

  // Get item counts for each list
  const listIds = lists.map(list => list.id);
  const { data: items, error: itemsError } = await supabase
    .from('grocery_items')
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
}

export async function createGroceryList(userId: string, title: string): Promise<GroceryList> {
  const { data, error } = await supabase
    .from('grocery_lists')
    .insert([{ local_user_id: userId, title }])
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create grocery list: ${error.message}`);
  }

  return data;
}

export async function deleteGroceryList(listId: string, userId: string): Promise<void> {
  // First verify the list belongs to the user
  const { data: listCheck, error: listError } = await supabase
    .from('grocery_lists')
    .select('id')
    .eq('id', listId)
    .eq('local_user_id', userId)
    .single();

  if (listError || !listCheck) {
    throw new Error(`Failed to delete grocery list: List not found or access denied`);
  }

  const { error } = await supabase
    .from('grocery_lists')
    .delete()
    .eq('id', listId)
    .eq('local_user_id', userId); // Double-check in delete

  if (error) {
    throw new Error(`Failed to delete grocery list: ${error.message}`);
  }
}

export async function updateGroceryListTitle(listId: string, title: string, userId: string): Promise<GroceryList> {
  // First verify the list belongs to the user
  const { data: listCheck, error: listError } = await supabase
    .from('grocery_lists')
    .select('id')
    .eq('id', listId)
    .eq('local_user_id', userId)
    .single();

  if (listError || !listCheck) {
    throw new Error(`Failed to update grocery list title: List not found or access denied`);
  }

  const { data, error } = await supabase
    .from('grocery_lists')
    .update({ title })
    .eq('id', listId)
    .eq('local_user_id', userId) // Double-check in update
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update grocery list title: ${error.message}`);
  }

  return data;
}

export async function markListAsCompleted(listId: string, userId: string): Promise<GroceryList> {
  // First verify the list belongs to the user
  const { data: listCheck, error: listError } = await supabase
    .from('grocery_lists')
    .select('id')
    .eq('id', listId)
    .eq('local_user_id', userId)
    .single();

  if (listError || !listCheck) {
    throw new Error(`Failed to mark list as completed: List not found or access denied`);
  }

  // Try to update completed_at
  const { data, error } = await supabase
    .from('grocery_lists')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', listId)
    .eq('local_user_id', userId) // Double-check in update
    .select()
    .single();

  if (error) {
    // If column doesn't exist, throw a clear error message
    if (error.message.includes('completed_at') || error.message.includes('column') || error.message.includes('schema cache')) {
      throw new Error(`השדה completed_at לא קיים במסד הנתונים. אנא הרץ את ה-migration: supabase/migrations/20260116000000_add_completed_at.sql`);
    }
    throw new Error(`Failed to mark list as completed: ${error.message}`);
  }

  if (!data) {
    throw new Error('Failed to mark list as completed: No data returned');
  }

  return data;
}

/**
 * Duplicate a grocery list with all its items
 * Creates a new list with title "העתק של {old.title}" and copies all items
 * All items will be in purchased=false state
 * Returns the new list and the count of duplicated items
 */
export async function duplicateGroceryList(listId: string, userId: string): Promise<{ list: GroceryList; itemCount: number }> {
  // First verify the list belongs to the user
  const { data: sourceList, error: listError } = await supabase
    .from('grocery_lists')
    .select('id, title')
    .eq('id', listId)
    .eq('local_user_id', userId)
    .single();

  if (listError || !sourceList) {
    throw new Error(`רשימה לא נמצאה או שאין לך גישה אליה: ${listError?.message || 'Unknown error'}`);
  }

  // Create new list with "העתק של" prefix
  const newTitle = `העתק של ${sourceList.title}`;
  const newList = await createGroceryList(userId, newTitle);

  // Fetch all items from source list
  const { data: sourceItems, error: itemsError } = await supabase
    .from('grocery_items')
    .select('*')
    .eq('list_id', listId);

  if (itemsError) {
    throw new Error(`נכשל בטעינת פריטים להעתקה: ${itemsError.message}`);
  }

  let itemCount = 0;

  // Copy all items to new list (with purchased=false)
  if (sourceItems && sourceItems.length > 0) {
    const itemsToInsert = sourceItems.map(item => ({
      list_id: newList.id,
      name: item.name,
      category: item.category || 'ללא קטגוריה',
      quantity: item.quantity,
      purchased: false, // All items start as not purchased
      image_url: item.image_url, // Preserve image_url
    }));

    const { error: insertError } = await supabase
      .from('grocery_items')
      .insert(itemsToInsert);

    if (insertError) {
      throw new Error(`נכשל בהעתקת פריטים: ${insertError.message}`);
    }

    itemCount = sourceItems.length;
  }

  return { list: newList, itemCount };
}

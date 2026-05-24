import { supabase } from "./supabase";
import { GroceryItem, GroceryList } from "@/app/types";

const LOCAL_USER_KEY = "grocery_local_user_id";
const DEFAULT_USER_ID = "01a6d46d-673f-4e2a-8956-a0fd0e00b23e";

export function getUserIdSync(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(LOCAL_USER_KEY);
  if (!id) {
    id = DEFAULT_USER_ID;
    localStorage.setItem(LOCAL_USER_KEY, id);
  }
  return id;
}

export async function getUserId(): Promise<string | null> {
  const id = getUserIdSync();
  return id || null;
}

// Get or create the active list for a given date, returns list ID
export async function getOrCreateListId(date: string): Promise<string> {
  const userId = await getUserId();
  if (!userId) throw new Error("User not authenticated");

  const { data: existing } = await supabase
    .from("grocery_lists")
    .select("id")
    .eq("local_user_id", userId)
    .eq("title", date)
    .eq("completed", false)
    .single();

  if (existing) return existing.id;

  const { data, error } = await supabase
    .from("grocery_lists")
    .insert({
      local_user_id: userId,
      title: date,
      completed: false,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

// --- Granular item operations (realtime-friendly) ---

export async function addItemToDb(
  listId: string,
  item: GroceryItem
): Promise<string> {
  const { data, error } = await supabase
    .from("grocery_items")
    .insert({
      id: item.id,
      list_id: listId,
      name: item.name,
      quantity: item.quantity,
      category: item.category || null,
      purchased: item.purchased,
      image_url: item.image || null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function updateItemInDb(
  itemId: string,
  changes: Partial<Pick<GroceryItem, "name" | "quantity" | "category" | "purchased" | "image">>
): Promise<void> {
  const update: Record<string, any> = {};
  if (changes.name !== undefined) update.name = changes.name;
  if (changes.quantity !== undefined) update.quantity = changes.quantity;
  if (changes.category !== undefined) update.category = changes.category || null;
  if (changes.purchased !== undefined) update.purchased = changes.purchased;
  if (changes.image !== undefined) update.image_url = changes.image || null;

  const { error } = await supabase
    .from("grocery_items")
    .update(update)
    .eq("id", itemId);

  if (error) throw error;
}

export async function removeItemFromDb(itemId: string): Promise<void> {
  const { error } = await supabase
    .from("grocery_items")
    .delete()
    .eq("id", itemId);

  if (error) throw error;
}

// --- Batch save (kept as fallback for initial load / date switching) ---

export async function saveGroceryList(
  date: string,
  items: GroceryItem[],
  completed: boolean = false
): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error("User not authenticated");

  const { data: existingList } = await supabase
    .from("grocery_lists")
    .select("id")
    .eq("local_user_id", userId)
    .eq("title", date)
    .eq("completed", false)
    .single();

  const listData: Record<string, any> = {
    local_user_id: userId,
    title: date,
    completed,
    completed_at: completed ? new Date().toISOString() : null,
  };

  let listId: string;

  if (existingList) {
    const { error } = await supabase
      .from("grocery_lists")
      .update(listData)
      .eq("id", existingList.id);
    if (error) throw error;
    listId = existingList.id;
  } else {
    const { data, error } = await supabase
      .from("grocery_lists")
      .insert(listData)
      .select("id")
      .single();
    if (error) throw error;
    listId = data.id;
  }

  await supabase.from("grocery_items").delete().eq("list_id", listId);

  if (items.length > 0) {
    const itemsToInsert = items.map((item) => ({
      id: item.id,
      list_id: listId,
      name: item.name,
      quantity: item.quantity,
      category: item.category || null,
      purchased: item.purchased,
      image_url: item.image || null,
    }));

    const { error } = await supabase
      .from("grocery_items")
      .insert(itemsToInsert);
    if (error) throw error;
  }
}

export async function loadGroceryList(
  date: string
): Promise<(GroceryList & { listId: string }) | null> {
  const userId = await getUserId();
  if (!userId) throw new Error("User not authenticated");

  const { data: list, error: listError } = await supabase
    .from("grocery_lists")
    .select("*")
    .eq("local_user_id", userId)
    .eq("title", date)
    .eq("completed", false)
    .single();

  if (listError) {
    if (listError.code === "PGRST116") return null;
    throw listError;
  }

  const { data: items, error: itemsError } = await supabase
    .from("grocery_items")
    .select("*")
    .eq("list_id", list.id)
    .order("created_at", { ascending: true });

  if (itemsError) throw itemsError;

  return {
    listId: list.id,
    date: list.title,
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      category: item.category || "",
      purchased: item.purchased,
      image: item.image_url || undefined,
    })),
    completed: list.completed,
    completedAt: list.completed_at || undefined,
  };
}

export async function completeGroceryList(date: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error("User not authenticated");

  const { error } = await supabase
    .from("grocery_lists")
    .update({
      completed: true,
      completed_at: new Date().toISOString(),
    })
    .eq("local_user_id", userId)
    .eq("title", date)
    .eq("completed", false);

  if (error) throw error;
}

export async function getCompletedLists(): Promise<GroceryList[]> {
  const userId = await getUserId();
  if (!userId) throw new Error("User not authenticated");

  const { data: lists, error } = await supabase
    .from("grocery_lists")
    .select("*, grocery_items(*)")
    .eq("local_user_id", userId)
    .eq("completed", true)
    .order("completed_at", { ascending: false });

  if (error) throw error;
  if (!lists || lists.length === 0) return [];

  return lists.map((list: any) => ({
    date: list.title,
    items: (list.grocery_items || [])
      .sort((a: any, b: any) => (a.created_at > b.created_at ? 1 : -1))
      .map((item: any) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        category: item.category || "",
        purchased: item.purchased,
        image: item.image_url || undefined,
      })),
    completed: list.completed,
    completedAt: list.completed_at || undefined,
  }));
}

export async function deleteCompletedList(date: string): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error("User not authenticated");

  const { data: list } = await supabase
    .from("grocery_lists")
    .select("id")
    .eq("local_user_id", userId)
    .eq("title", date)
    .eq("completed", true)
    .single();

  if (list) {
    await supabase.from("grocery_items").delete().eq("list_id", list.id);
    await supabase.from("grocery_lists").delete().eq("id", list.id);
  }
}

export async function saveItemImage(
  itemName: string,
  imageData: string
): Promise<void> {
  const userId = await getUserId();
  if (!userId) throw new Error("User not authenticated");

  const { error } = await supabase.from("item_images").upsert({
    user_id: userId,
    item_name: itemName.toLowerCase(),
    image_data: imageData,
  });

  if (error) throw error;
}

export async function getItemImage(
  itemName: string
): Promise<string | undefined> {
  const userId = await getUserId();
  if (!userId) return undefined;

  const { data } = await supabase
    .from("item_images")
    .select("image_data")
    .eq("user_id", userId)
    .eq("item_name", itemName.toLowerCase())
    .single();

  return data?.image_data || undefined;
}

export async function getAllItemNames(): Promise<
  Array<{ name: string; category: string; image?: string }>
> {
  const userId = await getUserId();
  if (!userId) return [];

  const { data: lists } = await supabase
    .from("grocery_lists")
    .select("id")
    .eq("local_user_id", userId);

  if (!lists || lists.length === 0) return [];

  const listIds = lists.map((l) => l.id);

  const { data: items } = await supabase
    .from("grocery_items")
    .select("name, category")
    .in("list_id", listIds)
    .order("name", { ascending: true });

  if (!items) return [];

  const uniqueItems = new Map<
    string,
    { name: string; category: string; image?: string }
  >();

  for (const item of items) {
    const key = item.name.toLowerCase();
    if (!uniqueItems.has(key)) {
      uniqueItems.set(key, {
        name: item.name,
        category: item.category || "",
      });
    }
  }

  const { data: images } = await supabase
    .from("item_images")
    .select("item_name, image_data")
    .eq("user_id", userId);

  if (images) {
    for (const img of images) {
      const key = img.item_name.toLowerCase();
      if (uniqueItems.has(key)) {
        uniqueItems.get(key)!.image = img.image_data;
      }
    }
  }

  return Array.from(uniqueItems.values());
}

import { supabase } from './supabase';
import { upsertShoppingItemToCatalog, forceUpdateShoppingItemByName } from './shoppingItems';

export interface ItemAlias {
  id: string;
  local_user_id: string;
  canonical_name: string;
  alias_name: string;
  store_name: string | null;
  confirmed: boolean;
  created_at: string;
}

export interface MatchedItem {
  originalName: string;
  matchedCanonicalName: string | null;
  matchedImageUrl: string | null;
  confidence: number;
  isConfirmed: boolean;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
}

export interface PersonalItem {
  name: string;
  image_url: string | null;
  category?: string;
  source?: 'grocery' | 'catalog';
  catalog_id?: string;
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Get the user's personal items from grocery lists AND manually-added catalog items.
 * Deduplicated by normalized name, preferring items with images.
 */
export async function getUserPersonalItems(userId: string): Promise<PersonalItem[]> {
  const map = new Map<string, PersonalItem>();

  // Source 1: grocery list items
  const { data: lists, error: listsErr } = await supabase
    .from('grocery_lists')
    .select('id')
    .eq('local_user_id', userId);

  if (!listsErr && lists?.length) {
    const listIds = lists.map(l => l.id);
    const { data: items, error: itemsErr } = await supabase
      .from('grocery_items')
      .select('name, image_url, category')
      .in('list_id', listIds);

    if (!itemsErr && items) {
      for (const item of items) {
        const norm = normalize(item.name);
        const existing = map.get(norm);
        if (!existing) {
          map.set(norm, { name: item.name, image_url: item.image_url || null, category: item.category || undefined, source: 'grocery' });
        } else if (item.image_url && !existing.image_url) {
          map.set(norm, { ...existing, name: item.name, image_url: item.image_url, category: item.category || existing.category, source: 'grocery' });
        }
      }
    }
  }

  // Source 2: manually-added catalog items (these take priority for category/image)
  const { data: catalogItems, error: catalogErr } = await supabase
    .from('user_catalog_items')
    .select('id, name, image_url, category')
    .eq('local_user_id', userId);

  if (!catalogErr && catalogItems) {
    for (const item of catalogItems) {
      const norm = normalize(item.name);
      const existing = map.get(norm);
      if (!existing) {
        map.set(norm, { name: item.name, image_url: item.image_url || null, category: item.category || undefined, source: 'catalog', catalog_id: item.id });
      } else {
        // Catalog entries take priority: overwrite image/category if provided
        map.set(norm, {
          ...existing,
          image_url: item.image_url || existing.image_url,
          category: item.category || existing.category,
          catalog_id: item.id,
        });
      }
    }
  }

  return Array.from(map.values());
}

/**
 * Exact alias lookup (case-insensitive on alias_name).
 * Also returns image_url by looking up the canonical name in user's personal items.
 */
export async function findAlias(
  userId: string,
  aliasName: string
): Promise<{ canonical_name: string; store_name: string | null; confirmed: boolean; image_url: string | null } | null> {
  const norm = normalize(aliasName);
  const { data, error } = await supabase
    .from('item_aliases')
    .select('canonical_name, store_name, confirmed')
    .eq('local_user_id', userId)
    .ilike('alias_name', norm)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  let imageUrl: string | null = null;
  const { data: lists, error: listsErr2 } = await supabase
    .from('grocery_lists')
    .select('id')
    .eq('local_user_id', userId);
  if (!listsErr2 && lists?.length) {
    const { data: imgItem } = await supabase
      .from('grocery_items')
      .select('image_url')
      .in('list_id', lists.map(l => l.id))
      .ilike('name', normalize(data.canonical_name))
      .not('image_url', 'is', null)
      .limit(1)
      .maybeSingle();
    if (imgItem) imageUrl = imgItem.image_url;
  }

  return { ...data, image_url: imageUrl };
}

/**
 * Fuzzy match against the user's personal items first (with image bonus),
 * then fall back to global catalog.
 */
export async function findAliasFuzzy(
  userId: string,
  receiptName: string
): Promise<{ canonical_name: string; similarity: number; image_url: string | null }[]> {
  const norm = normalize(receiptName);
  if (!norm || norm.length < 2) return [];

  // 1. Search user's personal items first
  const personalItems = await getUserPersonalItems(userId);
  const seen = new Set<string>();
  const results: { canonical_name: string; similarity: number; image_url: string | null }[] = [];

  for (const item of personalItems) {
    const itemNorm = normalize(item.name);
    if (seen.has(itemNorm)) continue;
    seen.add(itemNorm);

    let sim = computeSimilarity(norm, itemNorm);
    if (sim >= 0.3) {
      if (item.image_url) sim = Math.min(sim + 0.1, 1.0);
      results.push({ canonical_name: item.name, similarity: sim, image_url: item.image_url });
    }
  }

  // 2. If personal items yielded good results, return them
  results.sort((a, b) => b.similarity - a.similarity);
  if (results.length > 0 && results[0].similarity >= 0.5) {
    return results.slice(0, 5);
  }

  // 3. Fall back to global catalog with reduced scores
  const { data: catalogItems, error } = await supabase
    .from('shopping_items')
    .select('name, image_url')
    .limit(500);

  if (!error && catalogItems) {
    for (const item of catalogItems) {
      const catalogNorm = normalize(item.name);
      if (seen.has(catalogNorm)) continue;
      seen.add(catalogNorm);

      const sim = computeSimilarity(norm, catalogNorm);
      if (sim >= 0.3) {
        results.push({ canonical_name: item.name, similarity: sim * 0.7, image_url: item.image_url || null });
      }
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, 5);
}

function computeSimilarity(receiptNorm: string, catalogNorm: string): number {
  if (receiptNorm === catalogNorm) return 1.0;

  if (receiptNorm.includes(catalogNorm)) {
    return 0.6 + 0.3 * (catalogNorm.length / receiptNorm.length);
  }
  if (catalogNorm.includes(receiptNorm)) {
    return 0.5 + 0.3 * (receiptNorm.length / catalogNorm.length);
  }

  const rWords = receiptNorm.split(' ').filter(w => w.length > 1);
  const cWords = catalogNorm.split(' ').filter(w => w.length > 1);
  if (rWords.length === 0 || cWords.length === 0) return 0;

  let matchedWords = 0;
  for (const rw of rWords) {
    for (const cw of cWords) {
      if (rw === cw || rw.includes(cw) || cw.includes(rw)) {
        matchedWords++;
        break;
      }
    }
  }

  const overlap = matchedWords / Math.max(rWords.length, cWords.length);
  return overlap * 0.8;
}

export async function upsertAlias(
  userId: string,
  aliasName: string,
  canonicalName: string,
  storeName?: string | null
): Promise<void> {
  const trimmed = aliasName.trim();
  if (!trimmed) throw new Error('Alias name cannot be empty');

  const { error: insertErr } = await supabase
    .from('item_aliases')
    .insert({
      local_user_id: userId,
      canonical_name: canonicalName,
      alias_name: trimmed,
      store_name: storeName ?? null,
      confirmed: true,
    });

  if (!insertErr) return;

  if (insertErr.code === '23505') {
    const { error: updateErr } = await supabase
      .from('item_aliases')
      .update({
        canonical_name: canonicalName,
        store_name: storeName ?? null,
        confirmed: true,
      })
      .eq('local_user_id', userId)
      .ilike('alias_name', trimmed);
    if (updateErr) throw new Error(updateErr.message);
    return;
  }

  throw new Error(insertErr.message);
}

export async function fetchAllAliases(userId: string): Promise<ItemAlias[]> {
  const { data, error } = await supabase
    .from('item_aliases')
    .select('*')
    .eq('local_user_id', userId)
    .order('canonical_name', { ascending: true });

  if (error || !data) return [];
  return data;
}

export async function deleteAlias(aliasId: string): Promise<void> {
  const { error } = await supabase.from('item_aliases').delete().eq('id', aliasId);
  if (error) throw new Error(error.message);
}

/**
 * Bulk-resolve purchase item names to their canonical display info (name + image).
 * Uses aliases and personal items to find the best display for each name.
 */
export async function resolveItemDisplayInfo(
  userId: string,
  itemNames: string[]
): Promise<Map<string, { canonicalName: string; imageUrl: string | null }>> {
  const result = new Map<string, { canonicalName: string; imageUrl: string | null }>();
  if (!itemNames.length) return result;

  const allAliases = await fetchAllAliases(userId);
  const personalItems = await getUserPersonalItems(userId);

  const personalMap = new Map<string, PersonalItem>();
  for (const p of personalItems) {
    personalMap.set(normalize(p.name), p);
  }

  for (const name of itemNames) {
    const norm = normalize(name);

    // 1. Check if this name is an alias -> use canonical name + image
    const alias = allAliases.find(a => normalize(a.alias_name) === norm);
    if (alias) {
      const personal = personalMap.get(normalize(alias.canonical_name));
      result.set(name, {
        canonicalName: alias.canonical_name,
        imageUrl: personal?.image_url || null,
      });
      continue;
    }

    // 2. Check if this name itself is a personal item -> use its image
    const directMatch = personalMap.get(norm);
    if (directMatch) {
      result.set(name, {
        canonicalName: directMatch.name,
        imageUrl: directMatch.image_url,
      });
      continue;
    }

    // 3. No match
  }

  return result;
}

/**
 * Get receipt item names from purchase_items that have no alias mapping to any personal item.
 */
export async function getUnmatchedReceiptItems(userId: string): Promise<string[]> {
  const { data: records, error: recErr } = await supabase
    .from('purchase_records')
    .select('id')
    .eq('local_user_id', userId);

  if (recErr || !records?.length) return [];

  const recordIds = records.map(r => r.id);
  const { data: purchaseItems, error: piErr } = await supabase
    .from('purchase_items')
    .select('name')
    .in('purchase_record_id', recordIds)
    // Treat NULL as not ignored for backward compatibility
    .or('ignored.eq.false,ignored.is.null');

  if (piErr || !purchaseItems) return [];

  let allAliases: ItemAlias[] = [];
  let personalItems: PersonalItem[] = [];
  try {
    allAliases = await fetchAllAliases(userId);
    personalItems = await getUserPersonalItems(userId);
  } catch {
    return [];
  }

  const aliasSet = new Set(allAliases.map(a => normalize(a.alias_name)));
  const personalSet = new Set(personalItems.map(p => normalize(p.name)));

  const unmatchedSet = new Set<string>();
  for (const pi of purchaseItems) {
    if (!pi.name?.trim()) continue;
    const norm = normalize(pi.name);
    if (!aliasSet.has(norm) && !personalSet.has(norm)) {
      unmatchedSet.add(pi.name.trim());
    }
  }

  return Array.from(unmatchedSet).sort();
}

export async function dismissUnmatchedReceiptItem(userId: string, receiptItemName: string): Promise<void> {
  const trimmed = receiptItemName.trim();
  if (!trimmed) return;

  const { data: records, error: recErr } = await supabase
    .from('purchase_records')
    .select('id')
    .eq('local_user_id', userId);

  if (recErr || !records?.length) return;

  const recordIds = records.map(r => r.id);
  const { error } = await supabase
    .from('purchase_items')
    .update({ ignored: true })
    .in('purchase_record_id', recordIds)
    .eq('name', trimmed);

  if (error) throw new Error(error.message);
}

export async function undoDismissUnmatchedReceiptItem(userId: string, receiptItemName: string): Promise<void> {
  const trimmed = receiptItemName.trim();
  if (!trimmed) return;

  const { data: records, error: recErr } = await supabase
    .from('purchase_records')
    .select('id')
    .eq('local_user_id', userId);

  if (recErr || !records?.length) return;

  const recordIds = records.map(r => r.id);
  const { error } = await supabase
    .from('purchase_items')
    .update({ ignored: false })
    .in('purchase_record_id', recordIds)
    .eq('name', trimmed);

  if (error) throw new Error(error.message);
}

/**
 * Main matching function: for each receipt item, find alias or fuzzy-suggest
 * against user's personal items (with images) first, then global catalog.
 */
export async function matchReceiptItems(
  userId: string,
  items: Array<{ name: string; quantity: number; unitPrice: number | null; totalPrice: number | null }>,
  storeName?: string | null
): Promise<MatchedItem[]> {
  const results: MatchedItem[] = [];

  for (const item of items) {
    if (!item.name?.trim()) {
      results.push({
        originalName: item.name,
        matchedCanonicalName: null,
        matchedImageUrl: null,
        confidence: 0,
        isConfirmed: false,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      });
      continue;
    }

    // 1. Exact alias lookup
    const alias = await findAlias(userId, item.name);
    if (alias) {
      results.push({
        originalName: item.name,
        matchedCanonicalName: alias.canonical_name,
        matchedImageUrl: alias.image_url,
        confidence: alias.confirmed ? 100 : 90,
        isConfirmed: alias.confirmed,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      });
      continue;
    }

    // 2. Fuzzy match (personal items first, then global catalog)
    const fuzzy = await findAliasFuzzy(userId, item.name);
    if (fuzzy.length > 0 && fuzzy[0].similarity >= 0.4) {
      results.push({
        originalName: item.name,
        matchedCanonicalName: fuzzy[0].canonical_name,
        matchedImageUrl: fuzzy[0].image_url,
        confidence: Math.round(fuzzy[0].similarity * 80),
        isConfirmed: false,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      });
      continue;
    }

    // 3. No match
    results.push({
      originalName: item.name,
      matchedCanonicalName: null,
      matchedImageUrl: null,
      confidence: 0,
      isConfirmed: false,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    });
  }

  return results;
}

export async function addUserCatalogItem(
  userId: string,
  name: string,
  imageUrl?: string | null,
  category?: string
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Item name cannot be empty');

  const cat = category || 'ללא קטגוריה';

  const { data, error } = await supabase
    .from('user_catalog_items')
    .insert({
      local_user_id: userId,
      name: trimmed,
      image_url: imageUrl ?? null,
      category: cat,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('DUPLICATE');
    throw new Error(error.message);
  }

  // Sync to global shopping_items catalog so this item appears in
  // the main page autocomplete for all users
  upsertShoppingItemToCatalog(trimmed, cat, imageUrl ?? undefined).catch(() => {
    // Non-critical -- don't fail the add if catalog sync fails
  });

  return data.id;
}

export async function updateUserCatalogItemImage(
  itemId: string,
  imageUrl: string
): Promise<void> {
  const { error } = await supabase
    .from('user_catalog_items')
    .update({ image_url: imageUrl })
    .eq('id', itemId);
  if (error) throw new Error(error.message);
}

export async function deleteUserCatalogItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('user_catalog_items')
    .delete()
    .eq('id', itemId);
  if (error) throw new Error(error.message);
}

export async function getUserCatalogItems(
  userId: string
): Promise<Array<{ id: string; name: string; image_url: string | null; created_at: string }>> {
  const { data, error } = await supabase
    .from('user_catalog_items')
    .select('id, name, image_url, created_at')
    .eq('local_user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data;
}

/**
 * Update an existing personal item's category and/or image across all tables.
 * Ensures a user_catalog_items entry exists, updates grocery_items, and syncs to global catalog.
 * Returns the catalog_id for use with image uploads.
 */
export async function updatePersonalItemDetails(
  userId: string,
  itemName: string,
  updates: { category?: string; imageUrl?: string }
): Promise<string> {
  const trimmed = itemName.trim();
  const catalogUpdates: Record<string, string> = {};
  if (updates.category) catalogUpdates.category = updates.category;
  if (updates.imageUrl) catalogUpdates.image_url = updates.imageUrl;

  // 1. Ensure user_catalog_items entry exists (upsert by name)
  let catalogId: string;
  const { data: existing } = await supabase
    .from('user_catalog_items')
    .select('id')
    .eq('local_user_id', userId)
    .ilike('name', trimmed)
    .maybeSingle();

  if (existing) {
    catalogId = existing.id;
    if (Object.keys(catalogUpdates).length > 0) {
      const { error } = await supabase
        .from('user_catalog_items')
        .update(catalogUpdates)
        .eq('id', catalogId);
      if (error) throw new Error(error.message);
    }
  } else {
    const { data: newItem, error } = await supabase
      .from('user_catalog_items')
      .insert({
        local_user_id: userId,
        name: trimmed,
        image_url: updates.imageUrl ?? null,
        category: updates.category ?? 'ללא קטגוריה',
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    catalogId = newItem.id;
  }

  // 2. Update matching grocery_items for this user
  const { data: lists } = await supabase
    .from('grocery_lists')
    .select('id')
    .eq('local_user_id', userId);

  if (lists?.length) {
    const groceryUpdates: Record<string, string> = {};
    if (updates.category) groceryUpdates.category = updates.category;
    if (updates.imageUrl) groceryUpdates.image_url = updates.imageUrl;

    if (Object.keys(groceryUpdates).length > 0) {
      await supabase
        .from('grocery_items')
        .update(groceryUpdates)
        .in('list_id', lists.map(l => l.id))
        .ilike('name', trimmed);
    }
  }

  // 3. Sync to global shopping_items catalog
  const shoppingUpdates: Record<string, string> = {};
  if (updates.category) shoppingUpdates.category = updates.category;
  if (updates.imageUrl) shoppingUpdates.image_url = updates.imageUrl;

  if (Object.keys(shoppingUpdates).length > 0) {
    forceUpdateShoppingItemByName(trimmed, shoppingUpdates).catch(() => {});
  }

  return catalogId;
}

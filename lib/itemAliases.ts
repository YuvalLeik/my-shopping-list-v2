import { supabase } from './supabase';

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
  confidence: number;
  isConfirmed: boolean;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Exact alias lookup (case-insensitive on alias_name)
 */
export async function findAlias(
  userId: string,
  aliasName: string
): Promise<{ canonical_name: string; store_name: string | null; confirmed: boolean } | null> {
  const norm = normalize(aliasName);
  const { data, error } = await supabase
    .from('item_aliases')
    .select('canonical_name, store_name, confirmed')
    .eq('local_user_id', userId)
    .ilike('alias_name', norm)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

/**
 * Fuzzy match against the shopping_items catalog.
 * Uses substring containment and prefix matching for scoring.
 */
export async function findAliasFuzzy(
  userId: string,
  receiptName: string
): Promise<{ canonical_name: string; similarity: number }[]> {
  const norm = normalize(receiptName);
  if (!norm || norm.length < 2) return [];

  const { data: catalogItems, error } = await supabase
    .from('shopping_items')
    .select('name')
    .limit(500);

  if (error || !catalogItems) return [];

  const seen = new Set<string>();
  const results: { canonical_name: string; similarity: number }[] = [];

  for (const item of catalogItems) {
    const catalogNorm = normalize(item.name);
    if (seen.has(catalogNorm)) continue;
    seen.add(catalogNorm);

    const sim = computeSimilarity(norm, catalogNorm);
    if (sim >= 0.3) {
      results.push({ canonical_name: item.name, similarity: sim });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, 5);
}

function computeSimilarity(receiptNorm: string, catalogNorm: string): number {
  if (receiptNorm === catalogNorm) return 1.0;

  // One contains the other
  if (receiptNorm.includes(catalogNorm)) {
    return 0.6 + 0.3 * (catalogNorm.length / receiptNorm.length);
  }
  if (catalogNorm.includes(receiptNorm)) {
    return 0.5 + 0.3 * (receiptNorm.length / catalogNorm.length);
  }

  // Word overlap: split both into words and check overlap
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

/**
 * Upsert an alias (insert or update on conflict)
 */
export async function upsertAlias(
  userId: string,
  aliasName: string,
  canonicalName: string,
  storeName?: string | null
): Promise<void> {
  const norm = normalize(aliasName);

  const { data: existing } = await supabase
    .from('item_aliases')
    .select('id')
    .eq('local_user_id', userId)
    .ilike('alias_name', norm)
    .limit(1)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('item_aliases')
      .update({
        canonical_name: canonicalName,
        store_name: storeName ?? null,
        confirmed: true,
      })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('item_aliases')
      .insert({
        local_user_id: userId,
        canonical_name: canonicalName,
        alias_name: aliasName.trim(),
        store_name: storeName ?? null,
        confirmed: true,
      });
  }
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
  await supabase.from('item_aliases').delete().eq('id', aliasId);
}

/**
 * Main matching function: for each receipt item, find alias or fuzzy-suggest.
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
        confidence: alias.confirmed ? 100 : 90,
        isConfirmed: alias.confirmed,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      });
      continue;
    }

    // 2. Fuzzy match against catalog
    const fuzzy = await findAliasFuzzy(userId, item.name);
    if (fuzzy.length > 0 && fuzzy[0].similarity >= 0.5) {
      results.push({
        originalName: item.name,
        matchedCanonicalName: fuzzy[0].canonical_name,
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
      confidence: 0,
      isConfirmed: false,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    });
  }

  return results;
}

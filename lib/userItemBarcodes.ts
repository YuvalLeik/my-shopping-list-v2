import { supabase } from './supabase';

export interface UserItemBarcode {
  id: string;
  local_user_id: string;
  item_name: string;
  item_name_normalized: string;
  barcode: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface UnmappedItem {
  itemName: string;
  usageCount: number;
}

function normalizeItemName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function fetchUserItemBarcodes(userId: string): Promise<UserItemBarcode[]> {
  const { data, error } = await supabase
    .from('user_item_barcodes')
    .select('*')
    .eq('local_user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch item barcodes: ${error.message}`);
  }

  return data || [];
}

export async function upsertUserItemBarcode(
  userId: string,
  itemName: string,
  barcode: string,
  source: string = 'manual'
): Promise<void> {
  const trimmedItemName = itemName.trim();
  const trimmedBarcode = barcode.trim();

  if (!trimmedItemName || !trimmedBarcode) {
    throw new Error('Item name and barcode are required.');
  }

  const payload = {
    local_user_id: userId,
    item_name: trimmedItemName,
    item_name_normalized: normalizeItemName(trimmedItemName),
    barcode: trimmedBarcode,
    source,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('user_item_barcodes')
    .upsert(payload, { onConflict: 'local_user_id,item_name_normalized' });

  if (error) {
    throw new Error(`Failed to save barcode mapping: ${error.message}`);
  }
}

export async function getTopUnmappedPricedItems(userId: string, limit: number = 6): Promise<UnmappedItem[]> {
  const { data: priceRows, error: priceError } = await supabase
    .from('item_prices')
    .select('item_name')
    .eq('local_user_id', userId);

  if (priceError) {
    throw new Error(`Failed to fetch priced items: ${priceError.message}`);
  }

  if (!priceRows?.length) return [];

  const countMap = new Map<string, { itemName: string; usageCount: number }>();
  for (const row of priceRows) {
    const key = normalizeItemName(row.item_name);
    const current = countMap.get(key);
    if (current) {
      current.usageCount += 1;
    } else {
      countMap.set(key, { itemName: row.item_name, usageCount: 1 });
    }
  }

  const normalizedNames = Array.from(countMap.keys());
  const { data: mappings, error: mappingsError } = await supabase
    .from('user_item_barcodes')
    .select('item_name_normalized')
    .eq('local_user_id', userId)
    .in('item_name_normalized', normalizedNames);

  if (mappingsError) {
    throw new Error(`Failed to fetch existing mappings: ${mappingsError.message}`);
  }

  const mappedSet = new Set((mappings || []).map((row) => row.item_name_normalized));
  return Array.from(countMap.entries())
    .filter(([normalized]) => !mappedSet.has(normalized))
    .map(([, value]) => value)
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, limit);
}

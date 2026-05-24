import { supabase } from "./supabase";
import { getUserIdSync } from "./database";

export interface PriceMemory {
  vendor_name: string;
  item_name: string;
  unit_price: number;
  currency: string;
  last_used_at: string;
}

export interface StoreComparison {
  vendor_name: string;
  total: number;
  itemCount: number;
  items: { name: string; price: number }[];
}

function normalizeItemName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, " ");
}

export async function savePriceMemory(
  vendorName: string,
  itemName: string,
  unitPrice: number,
  currency = "ILS"
): Promise<void> {
  const userId = getUserIdSync();
  if (!userId) return;

  const normalizedName = normalizeItemName(itemName);

  await supabase.from("price_memories").upsert(
    {
      local_user_id: userId,
      vendor_name: vendorName,
      item_name: itemName,
      normalized_name: normalizedName,
      unit_price: unitPrice,
      currency,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "local_user_id,vendor_name,normalized_name" }
  );
}

export async function getPriceSuggestionsForVendor(
  vendorName: string,
  itemNames: string[]
): Promise<Record<string, number>> {
  const userId = getUserIdSync();
  if (!userId) return {};

  const normalizedNames = itemNames.map(normalizeItemName);

  const { data } = await supabase
    .from("price_memories")
    .select("normalized_name, unit_price")
    .eq("local_user_id", userId)
    .eq("vendor_name", vendorName)
    .in("normalized_name", normalizedNames);

  if (!data) return {};

  const result: Record<string, number> = {};
  for (const item of itemNames) {
    const norm = normalizeItemName(item);
    const match = data.find((d) => d.normalized_name === norm);
    if (match) result[item] = match.unit_price;
  }
  return result;
}

export async function getKnownVendors(): Promise<string[]> {
  const userId = getUserIdSync();
  if (!userId) return [];

  const { data } = await supabase
    .from("price_memories")
    .select("vendor_name")
    .eq("local_user_id", userId)
    .order("last_used_at", { ascending: false });

  if (!data) return [];

  const seen = new Set<string>();
  return data
    .map((d) => d.vendor_name)
    .filter((v) => { if (seen.has(v)) return false; seen.add(v); return true; });
}

export async function getCheapestStoreComparison(
  itemNames: string[]
): Promise<StoreComparison[]> {
  const userId = getUserIdSync();
  if (!userId) return [];

  const normalizedNames = itemNames.map(normalizeItemName);

  const { data } = await supabase
    .from("price_memories")
    .select("vendor_name, item_name, normalized_name, unit_price")
    .eq("local_user_id", userId)
    .in("normalized_name", normalizedNames)
    .order("last_used_at", { ascending: false });

  if (!data || data.length === 0) return [];

  // Group by vendor, keeping the most recent price per item
  const vendorItemMap = new Map<string, Map<string, { name: string; price: number }>>();

  for (const row of data) {
    if (!vendorItemMap.has(row.vendor_name)) {
      vendorItemMap.set(row.vendor_name, new Map());
    }
    const itemMap = vendorItemMap.get(row.vendor_name)!;
    if (!itemMap.has(row.normalized_name)) {
      itemMap.set(row.normalized_name, { name: row.item_name, price: row.unit_price });
    }
  }

  const comparisons: StoreComparison[] = [];
  for (const [vendor, itemMap] of vendorItemMap.entries()) {
    const items = Array.from(itemMap.values());
    const total = items.reduce((sum, i) => sum + i.price, 0);
    comparisons.push({
      vendor_name: vendor,
      total,
      itemCount: items.length,
      items,
    });
  }

  comparisons.sort((a, b) => b.itemCount - a.itemCount || a.total - b.total);
  return comparisons;
}

export async function getSpendingHistory(): Promise<
  { date: string; total: number; vendor?: string }[]
> {
  const userId = getUserIdSync();
  if (!userId) return [];

  const { data } = await supabase
    .from("grocery_lists")
    .select("title, total_cost, completed_at")
    .eq("local_user_id", userId)
    .eq("completed", true)
    .not("total_cost", "is", null)
    .order("completed_at", { ascending: true })
    .limit(20);

  if (!data) return [];

  return data
    .filter((d) => d.total_cost && d.total_cost > 0)
    .map((d) => ({
      date: d.title,
      total: d.total_cost,
    }));
}

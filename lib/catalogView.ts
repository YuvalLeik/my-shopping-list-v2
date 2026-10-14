import { supabase } from './supabase';
import { getUserPersonalItems } from './itemAliases';
import { getItemAveragePrices } from './itemPrices';
import { getUserChainPrefs } from './analytics';
import { chainFamily } from './chains';

export interface CatalogEntry {
  name: string;
  image_url: string | null;
  category: string;
  avgPrice: number | null;
  cheapestChain: string | null;
  cheapestPrice: number | null;
  frequency: number;
}

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Builds the product-catalog view for the storefront grid:
 * the user's personal items enriched with average paid price,
 * today's cheapest chain (from market_price_comparisons), and
 * how often the item was bought (for most-purchased-first ordering).
 */
export async function getCatalogWithMeta(userId: string): Promise<CatalogEntry[]> {
  const personalItems = await getUserPersonalItems(userId);
  if (personalItems.length === 0) return [];

  const names = personalItems.map((p) => p.name);

  // Frequency: how many times each item appeared across all of the user's lists
  const frequencyByName = new Map<string, number>();
  const { data: lists } = await supabase
    .from('grocery_lists')
    .select('id')
    .eq('local_user_id', userId);
  if (lists?.length) {
    const { data: items } = await supabase
      .from('grocery_items')
      .select('name')
      .in('list_id', lists.map((l) => l.id));
    if (items) {
      for (const item of items) {
        const norm = normalize(item.name);
        frequencyByName.set(norm, (frequencyByName.get(norm) ?? 0) + 1);
      }
    }
  }

  // Receipt purchases also count toward frequency
  const { data: priceRows } = await supabase
    .from('item_prices')
    .select('item_name')
    .eq('local_user_id', userId);
  if (priceRows) {
    for (const row of priceRows) {
      const norm = normalize(row.item_name);
      frequencyByName.set(norm, (frequencyByName.get(norm) ?? 0) + 1);
    }
  }

  // Average paid price (alias-aware, batched)
  const avgPrices = await getItemAveragePrices(userId, names);

  // Cheapest current chain per item from market data, among the family's
  // preferred chains (same window as getDailyPriceRecommendation).
  const cheapestByName = new Map<string, { chain: string; price: number }>();
  const { preferredChains } = await getUserChainPrefs(userId);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const { data: marketRows } = await supabase
    .from('market_price_comparisons')
    .select('item_name, chain_name, price, promo_price')
    .eq('local_user_id', userId)
    .gte('fetched_at', cutoff.toISOString());
  if (marketRows) {
    for (const row of marketRows) {
      const chain = chainFamily(row.chain_name, preferredChains);
      if (!chain) continue;
      const norm = normalize(row.item_name);
      const effective =
        row.promo_price != null && Number(row.promo_price) > 0 && Number(row.promo_price) < Number(row.price)
          ? Number(row.promo_price)
          : Number(row.price);
      if (!(effective > 0)) continue;
      const current = cheapestByName.get(norm);
      if (!current || effective < current.price) {
        cheapestByName.set(norm, { chain, price: effective });
      }
    }
  }

  return personalItems
    .map((p) => {
      const norm = normalize(p.name);
      const cheapest = cheapestByName.get(norm) ?? null;
      return {
        name: p.name,
        image_url: p.image_url,
        category: p.category || 'ללא קטגוריה',
        avgPrice: avgPrices.get(p.name) ?? null,
        cheapestChain: cheapest?.chain ?? null,
        cheapestPrice: cheapest?.price ?? null,
        frequency: frequencyByName.get(norm) ?? 0,
      };
    })
    .sort((a, b) => b.frequency - a.frequency || a.name.localeCompare(b.name, 'he'));
}

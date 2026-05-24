import { supabase } from "./supabase";
import { GroceryItem } from "@/app/types";
import { getUserIdSync } from "./database";

export interface ItemFrequency {
  item_name: string;
  normalized_name: string;
  category: string;
  purchase_count: number;
  last_purchased_at: string;
  first_purchased_at: string;
  avg_interval_days: number | null;
}

export interface SuggestedItem {
  name: string;
  category: string;
  image?: string;
  reason: "frequent" | "overdue" | "regular";
  reasonText: string;
  score: number;
}

async function getUserId(): Promise<string | null> {
  return getUserIdSync() || null;
}

export async function updateItemFrequencies(
  items: GroceryItem[]
): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  const now = new Date().toISOString();

  for (const item of items) {
    const normalizedName = item.name.toLowerCase().trim();

    const { data: existing } = await supabase
      .from("item_frequencies")
      .select("*")
      .eq("user_id", userId)
      .eq("normalized_name", normalizedName)
      .single();

    if (existing) {
      const newCount = existing.purchase_count + 1;
      const firstPurchased = new Date(existing.first_purchased_at);
      const daysSinceFirst =
        (Date.now() - firstPurchased.getTime()) / (1000 * 60 * 60 * 24);
      const avgInterval = newCount > 1 ? daysSinceFirst / (newCount - 1) : null;

      await supabase
        .from("item_frequencies")
        .update({
          purchase_count: newCount,
          last_purchased_at: now,
          avg_interval_days: avgInterval,
          category: item.category || existing.category,
          updated_at: now,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("item_frequencies").insert({
        user_id: userId,
        item_name: item.name,
        normalized_name: normalizedName,
        category: item.category || "",
        purchase_count: 1,
        last_purchased_at: now,
        first_purchased_at: now,
        avg_interval_days: null,
      });
    }
  }
}

export async function getSuggestions(
  currentItemNames: string[]
): Promise<SuggestedItem[]> {
  const userId = await getUserId();
  if (!userId) return [];

  const { data: frequencies, error } = await supabase
    .from("item_frequencies")
    .select("*")
    .eq("user_id", userId)
    .gte("purchase_count", 2)
    .order("purchase_count", { ascending: false })
    .limit(50);

  if (error || !frequencies) return [];

  const currentNormalized = new Set(
    currentItemNames.map((n) => n.toLowerCase().trim())
  );

  const now = Date.now();
  const suggestions: SuggestedItem[] = [];

  for (const freq of frequencies) {
    if (currentNormalized.has(freq.normalized_name)) continue;

    const daysSinceLastPurchase =
      (now - new Date(freq.last_purchased_at).getTime()) / (1000 * 60 * 60 * 24);

    let reason: SuggestedItem["reason"] = "frequent";
    let reasonText = "";
    let score = 0;

    if (
      freq.avg_interval_days &&
      daysSinceLastPurchase > freq.avg_interval_days * 1.2
    ) {
      // Overdue - haven't bought in longer than usual
      reason = "overdue";
      const weeks = Math.round(daysSinceLastPurchase / 7);
      if (weeks <= 1) {
        reasonText = `לא קניתם כבר שבוע`;
      } else {
        reasonText = `לא קניתם כבר ${weeks} שבועות`;
      }
      score = 100 + freq.purchase_count;
    } else if (freq.avg_interval_days && freq.avg_interval_days <= 10) {
      // Regular weekly item
      reason = "regular";
      reasonText = "קונים כל שבוע";
      score = 80 + freq.purchase_count;
    } else {
      // Frequently bought
      reason = "frequent";
      reasonText = `נקנה ${freq.purchase_count} פעמים`;
      score = freq.purchase_count;
    }

    suggestions.push({
      name: freq.item_name,
      category: freq.category || "",
      reason,
      reasonText,
      score,
    });
  }

  suggestions.sort((a, b) => b.score - a.score);
  return suggestions.slice(0, 15);
}

export async function checkAndBackfill(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;

  // Check if backfill already done
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("frequency_backfill_done")
    .eq("id", userId)
    .single();

  if (profile?.frequency_backfill_done) return;

  // Get all completed lists with items
  const { data: lists } = await supabase
    .from("grocery_lists")
    .select("*, grocery_items(*)")
    .eq("local_user_id", userId)
    .eq("completed", true)
    .order("completed_at", { ascending: true });

  if (!lists || lists.length === 0) {
    // Mark as done even if no lists
    await supabase
      .from("user_profiles")
      .update({ frequency_backfill_done: true })
      .eq("id", userId);
    return;
  }

  // Build frequency data from history
  const frequencyMap = new Map<
    string,
    {
      item_name: string;
      category: string;
      count: number;
      firstDate: Date;
      lastDate: Date;
    }
  >();

  for (const list of lists) {
    const listDate = new Date(list.completed_at || list.title);
    const items = (list as any).grocery_items || [];

    for (const item of items) {
      const key = item.name.toLowerCase().trim();
      const existing = frequencyMap.get(key);

      if (existing) {
        existing.count++;
        if (listDate > existing.lastDate) existing.lastDate = listDate;
        if (listDate < existing.firstDate) existing.firstDate = listDate;
        if (item.category && !existing.category) {
          existing.category = item.category;
        }
      } else {
        frequencyMap.set(key, {
          item_name: item.name,
          category: item.category || "",
          count: 1,
          firstDate: listDate,
          lastDate: listDate,
        });
      }
    }
  }

  // Insert frequency data
  const rows = Array.from(frequencyMap.entries()).map(([key, data]) => {
    const daysBetween =
      (data.lastDate.getTime() - data.firstDate.getTime()) /
      (1000 * 60 * 60 * 24);
    const avgInterval =
      data.count > 1 ? daysBetween / (data.count - 1) : null;

    return {
      user_id: userId,
      item_name: data.item_name,
      normalized_name: key,
      category: data.category,
      purchase_count: data.count,
      first_purchased_at: data.firstDate.toISOString(),
      last_purchased_at: data.lastDate.toISOString(),
      avg_interval_days: avgInterval,
    };
  });

  if (rows.length > 0) {
    // Upsert to handle any existing entries
    await supabase.from("item_frequencies").upsert(rows, {
      onConflict: "user_id,normalized_name",
    });
  }

  // Mark backfill as done
  await supabase
    .from("user_profiles")
    .update({ frequency_backfill_done: true })
    .eq("id", userId);
}

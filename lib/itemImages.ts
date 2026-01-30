import { supabase } from './supabase';

/**
 * Normalize item name for consistent storage and lookup
 * - Trim whitespace
 * - Convert to lowercase
 */
export function normalizeItemName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Get image URL for an item by name (case-insensitive)
 * Returns null if no image is stored for this item name
 */
export async function getItemImageUrlByName(name: string): Promise<string | null> {
  try {
    const normalizedName = normalizeItemName(name);
    const { data, error } = await supabase
      .from('item_images')
      .select('image_url')
      .eq('name', normalizedName)
      .single();

    if (error) {
      // If no row found, return null (not an error)
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to fetch item image: ${error.message}`);
    }

    return data?.image_url || null;
  } catch {
    // Return null on any error to allow graceful fallback
    return null;
  }
}

/**
 * Upsert item image by name
 * - If item name exists: updates image_url and updated_at
 * - If item name doesn't exist: creates new record
 * Uses normalized name (lowercase, trimmed) for case-insensitive matching
 */
export async function upsertItemImage(name: string, imageUrl: string): Promise<void> {
  try {
    const normalizedName = normalizeItemName(name);
    const { error } = await supabase
      .from('item_images')
      .upsert(
        {
          name: normalizedName,
          image_url: imageUrl,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'name',
        }
      );

    if (error) {
      throw new Error(`Failed to upsert item image: ${error.message}`);
    }
  } catch (err) {
    // Log error but don't throw - image upload should still succeed even if global save fails
    throw err;
  }
}

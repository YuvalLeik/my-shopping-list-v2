import { supabase } from './supabase';

/**
 * Normalize item name for consistent storage and lookup
 * - Trim whitespace
 * - Convert to lowercase
 */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Get image URL for an item by name (case-insensitive)
 * Returns null if no image is stored for this item name
 */
export async function getItemImage(name: string): Promise<string | null> {
  try {
    const normalizedName = normalizeName(name);
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
      // Return null on any error to allow graceful fallback
      return null;
    }

    return data?.image_url || null;
  } catch (err) {
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
export async function upsertItemImage(name: string, image_url: string): Promise<void> {
  try {
    const normalizedName = normalizeName(name);
    const { error } = await supabase
      .from('item_images')
      .upsert(
        {
          name: normalizedName,
          image_url: image_url,
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
    // Don't throw - image upload should still succeed even if global save fails
    // The error will be logged by the caller if needed
  }
}

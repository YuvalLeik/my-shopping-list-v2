import { supabase } from './supabaseClient';

export async function uploadItemImage(file: File, itemId: string, override: boolean = false) {
  const bucket = 'item-images';

  const ext = file.name.split('.').pop() || 'jpg';
  
  // For override: use fixed path main.{ext}, for new: use UUID
  const fileName = override ? `main.${ext}` : `${crypto.randomUUID()}.${ext}`;

  // חשוב: חייב להתחיל ב-public בגלל ה-policy
  const path = `public/items/${itemId}/${fileName}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
    upsert: override, // Use upsert for override mode
  });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);

  if (!data?.publicUrl) {
    throw new Error('Failed to get public URL for uploaded image');
  }

  return {
    publicUrl: data.publicUrl,
    path,
  };
}

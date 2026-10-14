/**
 * Shrink a receipt photo before upload: phone photos are 3–8MB each and a
 * few of them exceed the server's request limit. Max 2000px on the long
 * side at JPEG 0.85 keeps receipt text sharp at ~300–600KB. Also converts
 * HEIC on browsers that can decode it (iPhone Safari). Returns the original
 * file when the browser can't decode it.
 */
export async function compressImage(file: File, maxSide = 2000, quality = 0.85): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < 400_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

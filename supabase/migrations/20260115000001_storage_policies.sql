-- Storage policies for item-images bucket
-- Note: This assumes the bucket 'item-images' already exists
-- If it doesn't exist, create it first in Supabase Dashboard > Storage

-- Enable RLS on storage.objects (if not already enabled)
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public Access for item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload for item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete for item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Update for item-images" ON storage.objects;

-- Get bucket_id from bucket name (we'll use a subquery)
-- Allow public read access to item-images bucket
CREATE POLICY "Public Access for item-images"
ON storage.objects
FOR SELECT
USING (
  bucket_id IN (
    SELECT id FROM storage.buckets WHERE name = 'item-images'
  )
);

-- Allow public upload to item-images bucket
CREATE POLICY "Public Upload for item-images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id IN (
    SELECT id FROM storage.buckets WHERE name = 'item-images'
  )
);

-- Allow public update for item-images bucket (for replacing images)
CREATE POLICY "Public Update for item-images"
ON storage.objects
FOR UPDATE
USING (
  bucket_id IN (
    SELECT id FROM storage.buckets WHERE name = 'item-images'
  )
)
WITH CHECK (
  bucket_id IN (
    SELECT id FROM storage.buckets WHERE name = 'item-images'
  )
);

-- Allow public delete from item-images bucket
CREATE POLICY "Public Delete for item-images"
ON storage.objects
FOR DELETE
USING (
  bucket_id IN (
    SELECT id FROM storage.buckets WHERE name = 'item-images'
  )
);

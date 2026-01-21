-- Simple storage policies for item-images bucket (alternative approach)
-- Use this if the subquery approach doesn't work
-- IMPORTANT: Replace 'YOUR_BUCKET_ID_HERE' with the actual bucket ID from Supabase Dashboard > Storage

-- First, get the bucket ID by running this query in Supabase SQL Editor:
-- SELECT id, name FROM storage.buckets WHERE name = 'item-images';
-- Then replace 'YOUR_BUCKET_ID_HERE' below with the actual UUID

-- Enable RLS on storage.buckets if not already enabled
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

-- Allow public to see the bucket
DROP POLICY IF EXISTS "Public can see item-images bucket" ON storage.buckets;
CREATE POLICY "Public can see item-images bucket"
ON storage.buckets
FOR SELECT
TO public
USING (name = 'item-images');

-- Enable RLS on storage.objects if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Public Access for item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload for item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete for item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Update for item-images" ON storage.objects;

-- Simple policies using bucket name lookup
-- SELECT policy (required for uploads to work properly)
CREATE POLICY "Public Access for item-images"
ON storage.objects
FOR SELECT
TO public
USING (
  (bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'item-images'))
);

-- INSERT policy (for uploads)
CREATE POLICY "Public Upload for item-images"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  (bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'item-images'))
);

-- UPDATE policy (for replacing images)
CREATE POLICY "Public Update for item-images"
ON storage.objects
FOR UPDATE
TO public
USING (
  (bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'item-images'))
)
WITH CHECK (
  (bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'item-images'))
);

-- DELETE policy
CREATE POLICY "Public Delete for item-images"
ON storage.objects
FOR DELETE
TO public
USING (
  (bucket_id IN (SELECT id FROM storage.buckets WHERE name = 'item-images'))
);

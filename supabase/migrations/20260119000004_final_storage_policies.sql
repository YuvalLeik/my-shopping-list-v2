-- Final storage policies for item-images bucket
-- This version does NOT try to modify storage.buckets (which requires owner permissions)
-- IMPORTANT: You need to get the bucket_id first!

-- STEP 1: First, run this query to get your bucket ID:
-- SELECT id, name, public FROM storage.buckets WHERE name = 'item-images';
-- Copy the UUID from the 'id' column

-- STEP 2: Replace 'YOUR_BUCKET_ID_HERE' below with the actual UUID from step 1
-- Then run this entire migration

-- Enable RLS on storage.objects if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies for item-images
DROP POLICY IF EXISTS "Public Access for item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload for item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete for item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Update for item-images" ON storage.objects;

-- IMPORTANT: Replace 'YOUR_BUCKET_ID_HERE' with your actual bucket ID from step 1!
-- You can find it by running: SELECT id FROM storage.buckets WHERE name = 'item-images';

-- SELECT policy (required for uploads to work)
CREATE POLICY "Public Access for item-images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'YOUR_BUCKET_ID_HERE');

-- INSERT policy (for uploads) - THIS IS THE CRITICAL ONE
CREATE POLICY "Public Upload for item-images"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'YOUR_BUCKET_ID_HERE');

-- UPDATE policy (for replacing images)
CREATE POLICY "Public Update for item-images"
ON storage.objects
FOR UPDATE
TO public
USING (bucket_id = 'YOUR_BUCKET_ID_HERE')
WITH CHECK (bucket_id = 'YOUR_BUCKET_ID_HERE');

-- DELETE policy
CREATE POLICY "Public Delete for item-images"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'YOUR_BUCKET_ID_HERE');

-- Direct storage policies for item-images bucket
-- This uses a simpler approach that should work more reliably
-- IMPORTANT: Run this AFTER creating the 'item-images' bucket in Supabase Dashboard

-- Step 1: First, let's check if the bucket exists and get its ID
-- Run this query first to see the bucket ID:
-- SELECT id, name, public FROM storage.buckets WHERE name = 'item-images';

-- Step 2: Enable RLS on storage.buckets if not already enabled
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

-- Step 3: Allow public to read bucket metadata (required for subquery to work)
DROP POLICY IF EXISTS "Public can see item-images bucket" ON storage.buckets;
CREATE POLICY "Public can see item-images bucket"
ON storage.buckets
FOR SELECT
TO public
USING (true);  -- Allow seeing all buckets (or change to: USING (name = 'item-images'))

-- Step 4: Enable RLS on storage.objects if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Step 5: Drop all existing policies for item-images
DROP POLICY IF EXISTS "Public Access for item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload for item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete for item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Update for item-images" ON storage.objects;

-- Step 6: Create policies using a simpler approach
-- SELECT policy (required for uploads to work)
CREATE POLICY "Public Access for item-images"
ON storage.objects
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1 FROM storage.buckets 
    WHERE storage.buckets.id = storage.objects.bucket_id 
    AND storage.buckets.name = 'item-images'
  )
);

-- INSERT policy (for uploads) - THIS IS THE CRITICAL ONE
CREATE POLICY "Public Upload for item-images"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM storage.buckets 
    WHERE storage.buckets.id = storage.objects.bucket_id 
    AND storage.buckets.name = 'item-images'
  )
);

-- UPDATE policy (for replacing images)
CREATE POLICY "Public Update for item-images"
ON storage.objects
FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1 FROM storage.buckets 
    WHERE storage.buckets.id = storage.objects.bucket_id 
    AND storage.buckets.name = 'item-images'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM storage.buckets 
    WHERE storage.buckets.id = storage.objects.bucket_id 
    AND storage.buckets.name = 'item-images'
  )
);

-- DELETE policy
CREATE POLICY "Public Delete for item-images"
ON storage.objects
FOR DELETE
TO public
USING (
  EXISTS (
    SELECT 1 FROM storage.buckets 
    WHERE storage.buckets.id = storage.objects.bucket_id 
    AND storage.buckets.name = 'item-images'
  )
);

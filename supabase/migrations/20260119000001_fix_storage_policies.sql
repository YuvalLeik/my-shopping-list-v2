-- Fix storage policies for item-images bucket
-- This migration fixes the RLS policies to work correctly with Supabase Storage
-- IMPORTANT: Make sure the 'item-images' bucket exists and is public before running this

-- First, ensure we can read bucket metadata
DROP POLICY IF EXISTS "Public bucket access" ON storage.buckets;
CREATE POLICY "Public bucket access"
ON storage.buckets
FOR SELECT
TO public
USING (name = 'item-images');

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public Access for item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Upload for item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete for item-images" ON storage.objects;
DROP POLICY IF EXISTS "Public Update for item-images" ON storage.objects;

-- Allow public read access to item-images bucket (SELECT is required for uploads to work)
CREATE POLICY "Public Access for item-images"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id IN (
    SELECT id FROM storage.buckets WHERE name = 'item-images'
  )
);

-- Allow public upload to item-images bucket
CREATE POLICY "Public Upload for item-images"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id IN (
    SELECT id FROM storage.buckets WHERE name = 'item-images'
  )
);

-- Allow public update for item-images bucket (for replacing images)
CREATE POLICY "Public Update for item-images"
ON storage.objects
FOR UPDATE
TO public
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
TO public
USING (
  bucket_id IN (
    SELECT id FROM storage.buckets WHERE name = 'item-images'
  )
);

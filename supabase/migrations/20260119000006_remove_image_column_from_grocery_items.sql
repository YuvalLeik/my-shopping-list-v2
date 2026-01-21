-- Remove image column from grocery_items table (rollback)
-- This migration removes the image column (not image_url) that stores base64 image data
-- IMPORTANT: This will delete all image data stored in the image column!

-- Drop any index on the image column if it exists
DROP INDEX IF EXISTS idx_grocery_items_image;
DROP INDEX IF EXISTS idx_grocery_items_image_url;

-- Remove the image column
ALTER TABLE grocery_items 
DROP COLUMN IF EXISTS image;

-- Also remove image_url if it exists (just to be safe)
ALTER TABLE grocery_items 
DROP COLUMN IF EXISTS image_url;

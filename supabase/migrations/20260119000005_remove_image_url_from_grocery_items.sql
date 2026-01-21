-- Remove image_url column from grocery_items table (rollback)
-- This migration removes the image_url column that was added for image support
-- Run this ONLY if you ran the migration 20260119000000_add_image_url_to_grocery_items.sql

-- Drop the index first
DROP INDEX IF EXISTS idx_grocery_items_image_url;

-- Remove the image_url column
ALTER TABLE grocery_items 
DROP COLUMN IF EXISTS image_url;

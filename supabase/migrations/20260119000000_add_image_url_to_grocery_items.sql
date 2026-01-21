-- Add image_url column to grocery_items table
ALTER TABLE grocery_items 
ADD COLUMN IF NOT EXISTS image_url text;

-- Create index for image_url for better query performance (optional, but can help with filtering)
CREATE INDEX IF NOT EXISTS idx_grocery_items_image_url ON grocery_items(image_url) WHERE image_url IS NOT NULL;

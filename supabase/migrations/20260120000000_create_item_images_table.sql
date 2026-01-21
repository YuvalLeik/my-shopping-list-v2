-- Create item_images table for global item image storage
-- This table stores images by item name (case-insensitive) so that
-- the same item name always gets the same image across all lists

CREATE TABLE IF NOT EXISTS item_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  image_url text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index on name for faster lookups (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_item_images_name_lower ON item_images(lower(name));

-- Create trigger to update updated_at automatically
CREATE OR REPLACE FUNCTION update_item_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_item_images_updated_at ON item_images;
CREATE TRIGGER trigger_update_item_images_updated_at
  BEFORE UPDATE ON item_images
  FOR EACH ROW
  EXECUTE FUNCTION update_item_images_updated_at();

-- Enable RLS
ALTER TABLE item_images ENABLE ROW LEVEL SECURITY;

-- Allow public read access
DROP POLICY IF EXISTS "Public read access to item_images" ON item_images;
CREATE POLICY "Public read access to item_images"
ON item_images
FOR SELECT
TO public
USING (true);

-- Allow public insert/update (for upsert)
DROP POLICY IF EXISTS "Public insert access to item_images" ON item_images;
CREATE POLICY "Public insert access to item_images"
ON item_images
FOR INSERT
TO public
WITH CHECK (true);

DROP POLICY IF EXISTS "Public update access to item_images" ON item_images;
CREATE POLICY "Public update access to item_images"
ON item_images
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

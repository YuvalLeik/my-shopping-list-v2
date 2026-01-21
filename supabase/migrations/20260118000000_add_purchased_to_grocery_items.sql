-- Add purchased column to grocery_items table
ALTER TABLE grocery_items 
ADD COLUMN IF NOT EXISTS purchased boolean DEFAULT false;

-- Create index for purchased for better query performance
CREATE INDEX IF NOT EXISTS idx_grocery_items_purchased ON grocery_items(purchased);

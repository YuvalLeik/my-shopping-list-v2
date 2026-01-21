-- Add category column to grocery_items table
ALTER TABLE grocery_items 
ADD COLUMN IF NOT EXISTS category text DEFAULT 'ללא קטגוריה';

-- Create index for category for better query performance
CREATE INDEX IF NOT EXISTS idx_grocery_items_category ON grocery_items(category);

-- Create index for name and category together for faster lookups
CREATE INDEX IF NOT EXISTS idx_grocery_items_name_category ON grocery_items(name, category);

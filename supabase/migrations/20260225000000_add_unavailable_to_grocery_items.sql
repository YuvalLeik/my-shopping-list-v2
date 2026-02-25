ALTER TABLE grocery_items
ADD COLUMN IF NOT EXISTS unavailable boolean DEFAULT false;

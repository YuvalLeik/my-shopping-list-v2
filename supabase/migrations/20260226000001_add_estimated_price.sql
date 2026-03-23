ALTER TABLE grocery_items
ADD COLUMN IF NOT EXISTS estimated_price numeric(12,2) DEFAULT NULL;

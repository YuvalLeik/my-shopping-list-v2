ALTER TABLE user_catalog_items
ADD COLUMN IF NOT EXISTS category text DEFAULT 'ללא קטגוריה';

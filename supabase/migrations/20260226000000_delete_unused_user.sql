-- Safely delete the unused user 'הלייקינים הגדולים'
-- All related data (grocery_lists, grocery_items, purchase_records, purchase_items,
-- item_aliases, item_prices, user_catalog_items) will be CASCADE-deleted.
-- Global tables (shopping_items, item_images) are shared and unaffected.
DELETE FROM local_users WHERE name = 'הלייקינים הגדולים';

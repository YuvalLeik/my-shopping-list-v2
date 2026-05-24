-- Diagnostic queries — run these in Supabase SQL Editor to see what data exists.
-- Copy the OUTPUT and share it back so we know exactly what to restore.

-- 1. Does price_memories table exist? What columns does it have?
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'price_memories'
ORDER BY ordinal_position;

-- 2. How many price memory rows exist? Show first 10.
SELECT COUNT(*) AS total_price_memories FROM price_memories;
SELECT * FROM price_memories LIMIT 10;

-- 3. Distinct vendors in price_memories
SELECT vendor_name, COUNT(*) AS items
FROM price_memories
GROUP BY vendor_name
ORDER BY items DESC;

-- 4. Distinct user identifiers in price_memories (could be user_id OR local_user_id)
-- This errors if the column doesn't exist — that's the answer.
SELECT DISTINCT user_id FROM price_memories LIMIT 20;
-- If above fails, try:
-- SELECT DISTINCT local_user_id FROM price_memories LIMIT 20;

-- 5. Do grocery_items have any prices saved?
SELECT COUNT(*) AS items_with_prices
FROM grocery_items
WHERE unit_price IS NOT NULL AND unit_price > 0;

SELECT name, unit_price, vendor_name, list_id
FROM grocery_items
WHERE unit_price IS NOT NULL AND unit_price > 0
LIMIT 20;

-- 6. Do grocery_lists have total_cost saved?
SELECT COUNT(*) AS lists_with_total
FROM grocery_lists
WHERE total_cost IS NOT NULL AND total_cost > 0;

SELECT title, total_cost, local_user_id, completed
FROM grocery_lists
WHERE total_cost IS NOT NULL AND total_cost > 0
ORDER BY completed_at DESC NULLS LAST
LIMIT 20;

-- 7. What user IDs exist in grocery_lists right now?
SELECT local_user_id, COUNT(*) AS list_count
FROM grocery_lists
GROUP BY local_user_id
ORDER BY list_count DESC;

-- Backfill: Recover total_cost for completed lists
-- Run this in Supabase SQL Editor. Safe to re-run.

-- 1. Update total_cost for lists that have items with price data
UPDATE grocery_lists gl
SET total_cost = sub.computed_total
FROM (
  SELECT
    gi.list_id,
    SUM(COALESCE(gi.line_total, gi.unit_price * gi.quantity, 0)) AS computed_total
  FROM grocery_items gi
  WHERE gi.unit_price IS NOT NULL AND gi.unit_price > 0
  GROUP BY gi.list_id
  HAVING SUM(COALESCE(gi.line_total, gi.unit_price * gi.quantity, 0)) > 0
) sub
WHERE gl.id = sub.list_id
  AND (gl.total_cost IS NULL OR gl.total_cost = 0);

-- 2. Also try to backfill item prices from price_memories for items that lost prices
-- This looks up the most recent price for each item name per vendor
UPDATE grocery_items gi
SET
  unit_price = pm.unit_price,
  line_total = pm.unit_price * gi.quantity,
  vendor_name = pm.vendor_name
FROM (
  SELECT DISTINCT ON (normalized_name)
    normalized_name,
    item_name,
    unit_price,
    vendor_name
  FROM price_memories
  ORDER BY normalized_name, last_used_at DESC
) pm
WHERE gi.unit_price IS NULL
  AND LOWER(TRIM(REGEXP_REPLACE(gi.name, '\s+', ' ', 'g'))) = pm.normalized_name;

-- 3. After backfilling items, recompute total_cost for lists that still have NULL total
UPDATE grocery_lists gl
SET total_cost = sub.computed_total
FROM (
  SELECT
    gi.list_id,
    SUM(COALESCE(gi.line_total, gi.unit_price * gi.quantity, 0)) AS computed_total
  FROM grocery_items gi
  WHERE gi.unit_price IS NOT NULL AND gi.unit_price > 0
  GROUP BY gi.list_id
  HAVING SUM(COALESCE(gi.line_total, gi.unit_price * gi.quantity, 0)) > 0
) sub
WHERE gl.id = sub.list_id
  AND (gl.total_cost IS NULL OR gl.total_cost = 0);

-- 4. Show results
SELECT
  gl.title AS date,
  gl.total_cost,
  gl.completed,
  COUNT(gi.id) AS item_count,
  COUNT(CASE WHEN gi.unit_price IS NOT NULL AND gi.unit_price > 0 THEN 1 END) AS items_with_prices
FROM grocery_lists gl
LEFT JOIN grocery_items gi ON gi.list_id = gl.id
WHERE gl.local_user_id = '01a6d46d-673f-4e2a-8956-a0fd0e00b23e'
GROUP BY gl.id, gl.title, gl.total_cost, gl.completed
ORDER BY gl.completed_at DESC NULLS LAST
LIMIT 30;

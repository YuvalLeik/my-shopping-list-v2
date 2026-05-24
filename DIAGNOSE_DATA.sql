-- Robust diagnostic — each block is independent.
-- Run in Supabase SQL Editor. Paste the output back.
-- Each block prints its own "STATUS" rows so you can see what worked vs. didn't.

-- =====================================================
-- BLOCK A: list every table in your public schema
-- =====================================================
SELECT 'A: existing tables' AS check, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- =====================================================
-- BLOCK B: does price_memories exist? What columns?
-- =====================================================
SELECT 'B: price_memories columns' AS check, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'price_memories'
ORDER BY ordinal_position;

-- =====================================================
-- BLOCK C: count rows in price_memories (safe — uses dynamic SQL)
-- =====================================================
DO $$
DECLARE
  cnt BIGINT;
  has_user_id BOOLEAN;
  has_local_user_id BOOLEAN;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='price_memories') THEN
    EXECUTE 'SELECT COUNT(*) FROM price_memories' INTO cnt;
    RAISE NOTICE 'C: price_memories total rows = %', cnt;

    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='price_memories' AND column_name='user_id')
      INTO has_user_id;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema='public' AND table_name='price_memories' AND column_name='local_user_id')
      INTO has_local_user_id;
    RAISE NOTICE 'C: has user_id column = %, has local_user_id column = %', has_user_id, has_local_user_id;
  ELSE
    RAISE NOTICE 'C: price_memories table does NOT exist yet';
  END IF;
END $$;

-- =====================================================
-- BLOCK D: grocery_items — do price columns exist? Any rows with prices?
-- =====================================================
SELECT 'D: grocery_items price columns' AS check, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'grocery_items'
  AND column_name IN ('unit_price','line_total','vendor_name','price','store','store_name');

DO $$
DECLARE
  cnt BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='grocery_items' AND column_name='unit_price') THEN
    EXECUTE 'SELECT COUNT(*) FROM grocery_items WHERE unit_price IS NOT NULL AND unit_price > 0' INTO cnt;
    RAISE NOTICE 'D: grocery_items with unit_price > 0 = %', cnt;
  ELSE
    RAISE NOTICE 'D: grocery_items.unit_price column does NOT exist yet';
  END IF;
END $$;

-- =====================================================
-- BLOCK E: grocery_lists — total_cost column? Any rows with totals?
-- =====================================================
SELECT 'E: grocery_lists columns' AS check, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'grocery_lists'
ORDER BY ordinal_position;

DO $$
DECLARE
  cnt BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='grocery_lists' AND column_name='total_cost') THEN
    EXECUTE 'SELECT COUNT(*) FROM grocery_lists WHERE total_cost IS NOT NULL AND total_cost > 0' INTO cnt;
    RAISE NOTICE 'E: grocery_lists with total_cost > 0 = %', cnt;
  ELSE
    RAISE NOTICE 'E: grocery_lists.total_cost column does NOT exist yet';
  END IF;
END $$;

-- =====================================================
-- BLOCK F: which user IDs have data in grocery_lists?
-- =====================================================
SELECT 'F: lists per user' AS check, local_user_id, COUNT(*) AS list_count
FROM grocery_lists
GROUP BY local_user_id
ORDER BY list_count DESC;

-- =====================================================
-- BLOCK G: receipts table?
-- =====================================================
SELECT 'G: receipts columns' AS check, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'receipts'
ORDER BY ordinal_position;

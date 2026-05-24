-- Migration: Price Memories + Receipts (no auth version)
-- Run this in Supabase SQL Editor. Safe to re-run.

-- =====================================================
-- 1. price_memories: remembers prices per vendor per item
-- =====================================================
CREATE TABLE IF NOT EXISTS price_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_user_id TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  item_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'ILS',
  last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(local_user_id, vendor_name, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_price_memories_user_vendor ON price_memories(local_user_id, vendor_name);
CREATE INDEX IF NOT EXISTS idx_price_memories_normalized ON price_memories(local_user_id, normalized_name);

ALTER TABLE price_memories DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 2. Add price columns to grocery_items
-- =====================================================
ALTER TABLE grocery_items
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS line_total NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS vendor_name TEXT;

-- =====================================================
-- 3. Add total_cost to grocery_lists
-- =====================================================
ALTER TABLE grocery_lists
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC(10, 2);

-- =====================================================
-- 4. receipts: stores uploaded receipt photos + OCR result
-- =====================================================
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_user_id TEXT NOT NULL,
  list_id UUID,
  vendor_name TEXT,
  receipt_total NUMERIC(10, 2),
  currency TEXT DEFAULT 'ILS',
  image_base64 TEXT,                -- the receipt photo (data URL)
  ocr_raw_text TEXT,                -- raw OCR text from Gemini
  ocr_json JSONB,                   -- structured extraction from Gemini
  status TEXT DEFAULT 'pending',    -- pending | processing | done | failed
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_receipts_user ON receipts(local_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_list ON receipts(list_id);

ALTER TABLE receipts DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 5. receipt_lines: individual line items extracted from a receipt
-- =====================================================
CREATE TABLE IF NOT EXISTS receipt_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  raw_line_text TEXT,
  item_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  quantity NUMERIC(10, 3) DEFAULT 1,
  unit_price NUMERIC(10, 2),
  line_total NUMERIC(10, 2),
  matched_item_id UUID,             -- FK to grocery_items.id (when applied)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipt_lines_receipt ON receipt_lines(receipt_id);

ALTER TABLE receipt_lines DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 6. Migrate OLD price_memories rows (if they exist with user_id UUID auth column)
-- This silently does nothing if the old column doesn't exist.
-- =====================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'price_memories' AND column_name = 'user_id'
  ) THEN
    -- Copy old auth-based rows into local_user_id column for any rows that still have user_id but no local_user_id
    UPDATE price_memories
    SET local_user_id = user_id::TEXT
    WHERE local_user_id IS NULL AND user_id IS NOT NULL;
  END IF;
END $$;

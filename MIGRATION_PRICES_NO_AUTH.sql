-- Migration: Price Memories (no auth version)
-- Run this in Supabase SQL Editor

-- 1. Create price_memories table using local_user_id
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

-- Disable RLS (no auth)
ALTER TABLE price_memories DISABLE ROW LEVEL SECURITY;

-- 2. Add price columns to grocery_items if not already there
ALTER TABLE grocery_items
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS line_total NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS vendor_name TEXT;

-- 3. Add total_cost to grocery_lists if not already there
ALTER TABLE grocery_lists
  ADD COLUMN IF NOT EXISTS total_cost NUMERIC(10, 2);

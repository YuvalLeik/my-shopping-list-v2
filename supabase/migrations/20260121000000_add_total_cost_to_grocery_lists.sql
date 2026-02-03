-- Add total_cost column to grocery_lists for optional cost of completed list
ALTER TABLE grocery_lists
ADD COLUMN IF NOT EXISTS total_cost numeric(12,2) DEFAULT NULL;

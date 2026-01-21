-- Add completed_at column to grocery_lists table
ALTER TABLE grocery_lists 
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

-- Create index for completed_at for better query performance
CREATE INDEX IF NOT EXISTS idx_grocery_lists_completed_at ON grocery_lists(completed_at);

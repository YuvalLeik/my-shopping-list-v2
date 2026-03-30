-- Hide "unmatched receipt items" from the Settings unmatched list
-- (without deleting receipts or breaking reconciliation/spending)
ALTER TABLE purchase_items
ADD COLUMN IF NOT EXISTS ignored boolean DEFAULT false;


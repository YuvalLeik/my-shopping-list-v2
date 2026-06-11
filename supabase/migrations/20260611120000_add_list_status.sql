-- List lifecycle status: 'building' (being planned) or 'ready' (ready for shopping).
-- Completion is still tracked by completed_at. Additive and safe to re-run.
ALTER TABLE grocery_lists ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'building';

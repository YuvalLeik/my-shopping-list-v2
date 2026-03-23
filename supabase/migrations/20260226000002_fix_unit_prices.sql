-- Recalculate all unit_price values to be price / quantity
-- This fixes historical records where the parser's unitPrice was incorrect
-- (e.g., total line price stored as unit_price instead of per-unit price)
UPDATE item_prices
SET unit_price = ROUND(price / GREATEST(quantity, 1), 2)
WHERE quantity > 0;

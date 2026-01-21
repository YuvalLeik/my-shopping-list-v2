-- Enable pgcrypto extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop existing tables if they exist (for clean migration)
DROP TABLE IF EXISTS shopping_items CASCADE;
DROP TABLE IF EXISTS shopping_lists CASCADE;

-- Create shopping_lists table
CREATE TABLE shopping_lists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    list_date date NOT NULL,
    title text,
    is_completed boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

-- Create shopping_items table
CREATE TABLE shopping_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id uuid NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
    name text NOT NULL,
    category text NOT NULL DEFAULT 'ללא קטגוריה',
    quantity integer NOT NULL DEFAULT 1,
    purchased boolean NOT NULL DEFAULT false,
    image_url text,
    created_at timestamp with time zone DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_shopping_lists_list_date ON shopping_lists(list_date);
CREATE INDEX idx_shopping_items_list_id ON shopping_items(list_id);
CREATE INDEX idx_shopping_items_purchased ON shopping_items(purchased);

-- Enable pgcrypto extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create local_users table
CREATE TABLE local_users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- Create grocery_lists table
CREATE TABLE grocery_lists (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    local_user_id uuid NOT NULL REFERENCES local_users(id) ON DELETE CASCADE,
    title text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

-- Create grocery_items table
CREATE TABLE grocery_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id uuid NOT NULL REFERENCES grocery_lists(id) ON DELETE CASCADE,
    name text NOT NULL,
    quantity integer NOT NULL DEFAULT 1,
    created_at timestamp with time zone DEFAULT now()
);

-- Create indexes for foreign keys
CREATE INDEX idx_grocery_lists_local_user_id ON grocery_lists(local_user_id);
CREATE INDEX idx_grocery_items_list_id ON grocery_items(list_id);

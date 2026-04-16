create table if not exists market_price_comparisons (
  id uuid primary key default gen_random_uuid(),
  local_user_id text not null,
  item_name text not null,
  barcode text,
  chain_name text not null,
  branch_name text,
  price numeric not null,
  promo_price numeric,
  promo_description text,
  fetched_at timestamptz not null default now()
);

create index if not exists idx_mpc_user_date on market_price_comparisons(local_user_id, fetched_at);
create index if not exists idx_mpc_user_chain on market_price_comparisons(local_user_id, chain_name);

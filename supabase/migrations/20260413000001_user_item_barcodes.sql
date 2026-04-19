create table if not exists user_item_barcodes (
  id uuid primary key default gen_random_uuid(),
  local_user_id uuid not null references local_users(id) on delete cascade,
  item_name text not null,
  item_name_normalized text not null,
  barcode text not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_user_item_barcodes_unique_item
  on user_item_barcodes(local_user_id, item_name_normalized);

create index if not exists idx_user_item_barcodes_user
  on user_item_barcodes(local_user_id);

create index if not exists idx_user_item_barcodes_barcode
  on user_item_barcodes(barcode);

alter table user_item_barcodes enable row level security;

drop policy if exists "Public read user_item_barcodes" on user_item_barcodes;
create policy "Public read user_item_barcodes" on user_item_barcodes
for select to public using (true);

drop policy if exists "Public insert user_item_barcodes" on user_item_barcodes;
create policy "Public insert user_item_barcodes" on user_item_barcodes
for insert to public with check (true);

drop policy if exists "Public update user_item_barcodes" on user_item_barcodes;
create policy "Public update user_item_barcodes" on user_item_barcodes
for update to public using (true) with check (true);

drop policy if exists "Public delete user_item_barcodes" on user_item_barcodes;
create policy "Public delete user_item_barcodes" on user_item_barcodes
for delete to public using (true);

grant all on public.user_item_barcodes to anon;
grant all on public.user_item_barcodes to authenticated;
grant all on public.user_item_barcodes to service_role;

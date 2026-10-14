-- Which chains the family shops at and which cities' branches to price.
-- NULL / empty means "use the app defaults" (lib/chains.ts).
alter table local_users add column if not exists preferred_chains text[];
alter table local_users add column if not exists price_area_cities text[];

drop policy if exists "Public update local_users" on local_users;
create policy "Public update local_users" on local_users
  for update using (true) with check (true);

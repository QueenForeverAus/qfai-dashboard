-- Tours seasons (Admin Settings SoT). Additive. Staging only; prod held.
-- Assignment is computed: active show_date in [date_from, date_to].
-- No tour_id on shows/runs. Calendar publish is out of scope.
-- Incomplete rows (null date_from or date_to) are Settings-only until both dates are set.
-- Seed dates are initial values only. Portal logic must read ranges from this table.

create table if not exists public.tours (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date_from date,
  date_to date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tours_name_unique unique (name),
  constraint tours_date_range_check check (
    date_from is null
    or date_to is null
    or date_to >= date_from
  )
);

create index if not exists tours_sort_order_idx
  on public.tours (sort_order, date_from, name);

alter table public.tours enable row level security;

drop policy if exists "Authenticated users can view tours" on public.tours;
create policy "Authenticated users can view tours" on public.tours
  for select using (auth.role() = 'authenticated');

drop policy if exists "Admins and owners can insert tours" on public.tours;
create policy "Admins and owners can insert tours" on public.tours
  for insert
  with check (get_my_role() = any (array['admin'::text, 'owner'::text]));

drop policy if exists "Admins and owners can update tours" on public.tours;
create policy "Admins and owners can update tours" on public.tours
  for update
  using (get_my_role() = any (array['admin'::text, 'owner'::text]))
  with check (get_my_role() = any (array['admin'::text, 'owner'::text]));

drop policy if exists "Admins and owners can delete tours" on public.tours;
create policy "Admins and owners can delete tours" on public.tours
  for delete
  using (get_my_role() = any (array['admin'::text, 'owner'::text]));

grant select, insert, update, delete on table public.tours to authenticated;

-- Idempotent seed. ON CONFLICT DO NOTHING so Settings edits survive re-apply.
insert into public.tours (name, date_from, date_to, sort_order)
values
  ('Greatest Hits Tour — 20th Anniversary (2026 Tour)', '2026-01-01', '2026-12-31', 10),
  ('Greatest Hits Tour — Don''t Stop Us Now (2027 Tour)', '2027-01-01', '2027-12-31', 20)
on conflict (name) do nothing;

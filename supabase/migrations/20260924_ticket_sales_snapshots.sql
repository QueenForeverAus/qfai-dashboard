-- Ticket Sales & Ads slice 1. Additive. Apply on staging (nlenbzhwnyigsihcphoz) only.
-- Dated weekly snapshots so the board can show Δ week. Pace is a separate
-- owner/admin judgement and is not overwritten when a week is re-ingested.
-- No Meta, ads, or recommendation columns.

create table if not exists public.ticket_sales_snapshots (
  id uuid primary key default gen_random_uuid(),
  as_of_date date not null,
  source_file text,
  source_sheet text,
  ingested_at timestamptz not null default now(),
  ingested_by uuid references public.profiles(id),
  constraint ticket_sales_snapshots_as_of_unique unique (as_of_date)
);

create table if not exists public.ticket_sales_snapshot_rows (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.ticket_sales_snapshots(id) on delete cascade,
  show_id uuid references public.shows(id) on delete set null,
  sheet_row_key text not null,
  venue_name text not null,
  venue_city text,
  state_territory text,
  show_date date,
  sold integer,
  comps integer,
  total_with_comps integer,
  house_capacity integer,
  on_sale_capacity integer,
  capacity_basis text not null default 'missing'
    check (capacity_basis in ('on_sale', 'house', 'missing')),
  display_capacity integer,
  pct_sold integer,
  reported_on_as_of boolean not null default false,
  update_source text,
  final_figure integer,
  constraint ticket_sales_snapshot_rows_key_unique unique (snapshot_id, sheet_row_key)
);

create index if not exists ticket_sales_snapshot_rows_snapshot_idx
  on public.ticket_sales_snapshot_rows (snapshot_id);

create index if not exists ticket_sales_snapshot_rows_show_idx
  on public.ticket_sales_snapshot_rows (show_id);

create table if not exists public.ticket_sales_pace (
  show_id uuid primary key references public.shows(id) on delete cascade,
  pace text check (pace is null or pace in ('clear', 'watch', 'impediment')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.ticket_sales_snapshots enable row level security;
alter table public.ticket_sales_snapshot_rows enable row level security;
alter table public.ticket_sales_pace enable row level security;

revoke all on table public.ticket_sales_snapshots from anon, public;
revoke all on table public.ticket_sales_snapshot_rows from anon, public;
revoke all on table public.ticket_sales_pace from anon, public;

grant select on table public.ticket_sales_snapshots to authenticated;
grant select on table public.ticket_sales_snapshot_rows to authenticated;
grant select, insert, update on table public.ticket_sales_pace to authenticated;

grant select, insert, update, delete on table public.ticket_sales_snapshots to service_role;
grant select, insert, update, delete on table public.ticket_sales_snapshot_rows to service_role;
grant select, insert, update, delete on table public.ticket_sales_pace to service_role;

drop policy if exists "Owners and admins can read ticket sales snapshots" on public.ticket_sales_snapshots;
create policy "Owners and admins can read ticket sales snapshots"
  on public.ticket_sales_snapshots
  for select
  to authenticated
  using ((select get_my_role()) = any (array['admin'::text, 'owner'::text]));

drop policy if exists "Owners and admins can read ticket sales snapshot rows" on public.ticket_sales_snapshot_rows;
create policy "Owners and admins can read ticket sales snapshot rows"
  on public.ticket_sales_snapshot_rows
  for select
  to authenticated
  using ((select get_my_role()) = any (array['admin'::text, 'owner'::text]));

drop policy if exists "Owners and admins can read ticket sales pace" on public.ticket_sales_pace;
create policy "Owners and admins can read ticket sales pace"
  on public.ticket_sales_pace
  for select
  to authenticated
  using ((select get_my_role()) = any (array['admin'::text, 'owner'::text]));

drop policy if exists "Owners and admins can insert ticket sales pace" on public.ticket_sales_pace;
create policy "Owners and admins can insert ticket sales pace"
  on public.ticket_sales_pace
  for insert
  to authenticated
  with check ((select get_my_role()) = any (array['admin'::text, 'owner'::text]));

drop policy if exists "Owners and admins can update ticket sales pace" on public.ticket_sales_pace;
create policy "Owners and admins can update ticket sales pace"
  on public.ticket_sales_pace
  for update
  to authenticated
  using ((select get_my_role()) = any (array['admin'::text, 'owner'::text]))
  with check ((select get_my_role()) = any (array['admin'::text, 'owner'::text]));

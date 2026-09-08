-- Tour Desk v2 Phase 1 — Run Advancing twin sheet (staging only — nlenbzhwnyigsihcphoz)
-- Additive: copied run cost lines + working P&L chrome, separate from cost_fields.
-- Do NOT apply to prod (pfbgrukqxegkiaksuatm).
-- booked_cost_snapshot remains the freeze audit snapshot. This workspace is editable.
-- Settlements Col2 may still read cost_fields until Phase 4 (residual).

create table if not exists public.run_advancing_workspaces (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  copied_at timestamptz not null default now(),
  copied_by uuid references public.profiles (id),
  archived_at timestamptz,
  archived_by uuid references public.profiles (id),
  shows_chrome jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.run_advancing_workspaces is
  'P1 Run Advancing workspace. Copied at BOOKED; soft-archived on UNBOOKED. Never writes back to cost_fields.';
comment on column public.run_advancing_workspaces.shows_chrome is
  'Working P&L chrome (ticket price, capacity, venue inside overrides) copied at BOOKED. Not live share of shows.';
comment on column public.run_advancing_workspaces.archived_at is
  'Soft-archive timestamp. Active workspace is archived_at IS NULL.';

create unique index if not exists run_advancing_workspaces_active_run_idx
  on public.run_advancing_workspaces (run_id)
  where archived_at is null;

create index if not exists run_advancing_workspaces_run_id_idx
  on public.run_advancing_workspaces (run_id);

create table if not exists public.advancing_cost_fields (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.run_advancing_workspaces (id) on delete cascade,
  run_id uuid not null references public.runs (id) on delete cascade,
  source_cost_field_id uuid,
  show_id uuid references public.shows (id) on delete set null,
  category text not null,
  field_key text not null,
  label text not null,
  value numeric(12, 2),
  state text not null default 'guess',
  source text,
  line_items jsonb,
  entries jsonb,
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.advancing_cost_fields is
  'P1 editable copy of run cost lines for Run Advancing. Distinct rows from cost_fields — no live share.';
comment on column public.advancing_cost_fields.source_cost_field_id is
  'cost_fields.id at copy time (audit only). Edits do not write back to that row.';

create unique index if not exists advancing_cost_fields_workspace_line_idx
  on public.advancing_cost_fields (
    workspace_id,
    coalesce(show_id, '00000000-0000-0000-0000-000000000000'::uuid),
    field_key
  );

create index if not exists advancing_cost_fields_workspace_id_idx
  on public.advancing_cost_fields (workspace_id);

create index if not exists advancing_cost_fields_run_id_idx
  on public.advancing_cost_fields (run_id);

alter table public.run_advancing_workspaces enable row level security;
alter table public.advancing_cost_fields enable row level security;

drop policy if exists "Authenticated users can view run advancing workspaces" on public.run_advancing_workspaces;
create policy "Authenticated users can view run advancing workspaces" on public.run_advancing_workspaces
  for select using (auth.role() = 'authenticated');

drop policy if exists "Admins and owners can modify run advancing workspaces" on public.run_advancing_workspaces;
create policy "Admins and owners can modify run advancing workspaces" on public.run_advancing_workspaces
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );

drop policy if exists "Authenticated users can view advancing cost fields" on public.advancing_cost_fields;
create policy "Authenticated users can view advancing cost fields" on public.advancing_cost_fields
  for select using (auth.role() = 'authenticated');

drop policy if exists "Admins and owners can modify advancing cost fields" on public.advancing_cost_fields;
create policy "Admins and owners can modify advancing cost fields" on public.advancing_cost_fields
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );

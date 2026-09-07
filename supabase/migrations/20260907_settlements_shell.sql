-- W1.3 Settlements shell (staging only — nlenbzhwnyigsihcphoz)
-- Additive: run-level Finalise snapshot + band-cost lines.
-- Do NOT apply to prod (pfbgrukqxegkiaksuatm).

create table if not exists public.run_settlements (
  run_id uuid primary key references public.runs (id) on delete cascade,
  costing_finalised_at timestamptz,
  costing_finalised_by uuid references public.profiles (id),
  costing_snapshot jsonb,
  nudge_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.run_settlements is
  'W1.3 per-run Settlements shell. costing_snapshot is the hard-locked Run Costing copy after Finalise.';
comment on column public.run_settlements.costing_snapshot is
  'Frozen cost_fields payload at Finalise. Left pane reads this only — never live cost_fields.';
comment on column public.run_settlements.nudge_due_at is
  'Display stub: Finalise + 24h. Cron / email nudge is later.';

create table if not exists public.band_cost_lines (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  show_id uuid references public.shows (id) on delete set null,
  description text not null,
  amount numeric(12, 2) not null default 0,
  notes text,
  source text,
  paid boolean not null default false,
  waived boolean not null default false,
  paid_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint band_cost_lines_not_paid_and_waived check (not (paid and waived))
);

comment on table public.band_cost_lines is
  'W1.3 right-pane Band Costs (receipts / surprise costs). Not written into the Finalise snapshot.';

create index if not exists band_cost_lines_run_id_idx
  on public.band_cost_lines (run_id);
create index if not exists band_cost_lines_show_id_idx
  on public.band_cost_lines (show_id);

alter table public.run_settlements enable row level security;
alter table public.band_cost_lines enable row level security;

drop policy if exists "Admins and owners can view run settlements" on public.run_settlements;
create policy "Admins and owners can view run settlements" on public.run_settlements
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );

drop policy if exists "Admins and owners can modify run settlements" on public.run_settlements;
create policy "Admins and owners can modify run settlements" on public.run_settlements
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );

drop policy if exists "Admins and owners can view band cost lines" on public.band_cost_lines;
create policy "Admins and owners can view band cost lines" on public.band_cost_lines
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );

drop policy if exists "Admins and owners can modify band cost lines" on public.band_cost_lines;
create policy "Admins and owners can modify band cost lines" on public.band_cost_lines
  for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role in ('admin', 'owner'))
  );

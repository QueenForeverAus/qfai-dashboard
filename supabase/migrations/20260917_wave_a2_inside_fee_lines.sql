-- Wave A2: itemised Inside fee lines + hard-delete tombstones (staging).
-- Additive / idempotent. Do NOT apply to prod from this PR.
-- Deleted Costings/Advancing lines must stay deleted across Factors refresh.

create table if not exists public.cost_line_tombstones (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  sheet text not null default 'costings',
  show_id uuid references public.shows (id) on delete cascade,
  field_key text not null,
  seed_key text not null,
  deleted_at timestamptz not null default now(),
  constraint cost_line_tombstones_sheet_check check (sheet in ('costings', 'advancing'))
);

comment on table public.cost_line_tombstones is
  'Wave A2 hard-delete preserve. Factors refresh and page-open seed must not resurrect these field/seed keys.';

comment on column public.cost_line_tombstones.seed_key is
  'Seed identity (booking_fee, accommodation:…, or * for the whole field).';

create unique index if not exists cost_line_tombstones_identity_idx
  on public.cost_line_tombstones (
    run_id,
    sheet,
    coalesce(show_id, '00000000-0000-0000-0000-000000000000'::uuid),
    field_key,
    seed_key
  );

create index if not exists cost_line_tombstones_run_sheet_idx
  on public.cost_line_tombstones (run_id, sheet);

alter table public.cost_line_tombstones enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cost_line_tombstones'
      and policyname = 'Authenticated users can view cost line tombstones'
  ) then
    create policy "Authenticated users can view cost line tombstones"
      on public.cost_line_tombstones
      for select using (auth.role() = 'authenticated');
  end if;
end $$;

-- Optional Factors stub — Comp ticket fees stay Estimate when Finance seeds a rate.
insert into public.run_factors (key, label, category, value, unit, description)
select
  'comp_ticket_fee_per_payer',
  'Comp ticket fee (per payer, optional)',
  'Ticketing / Inside Costs',
  null,
  '$/payer',
  'Optional. When set, Costings/Advancing seed a Comp ticket fees line in the Inside fees bucket (Estimate only). Leave null until applicable — do not invent.'
where not exists (select 1 from public.run_factors where key = 'comp_ticket_fee_per_payer');

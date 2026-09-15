-- Wave A: Unconfirm audit + Factors menu keys (staging).
-- Additive / idempotent. Do NOT apply to prod from this PR.
-- Unconfirm keeps runs.status = confirmed (BOOKED). Costings unlocks via
-- costings_unconfirmed_at. Advancing is not archived.

alter table public.runs
  add column if not exists costings_unconfirmed_at timestamptz,
  add column if not exists costings_unconfirmed_by uuid references public.profiles (id),
  add column if not exists costings_unconfirmed_reason text;

comment on column public.runs.costings_unconfirmed_at is
  'Wave A Unconfirm: when Costings was unlocked while the run stayed BOOKED. Null = frozen (if BOOKED).';
comment on column public.runs.costings_unconfirmed_by is
  'Profile that Unconfirmed Costings (owners/admins).';
comment on column public.runs.costings_unconfirmed_reason is
  'Optional why for the latest Unconfirm.';

create table if not exists public.run_unconfirm_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs (id) on delete cascade,
  action text not null check (action in ('unconfirm', 'rebook')),
  actor_id uuid references public.profiles (id),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists run_unconfirm_events_run_id_created_at_idx
  on public.run_unconfirm_events (run_id, created_at desc);

comment on table public.run_unconfirm_events is
  'Wave A Unconfirm / Re-BOOK audit: who / when / optional why. Additive history.';

alter table public.run_unconfirm_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'run_unconfirm_events'
      and policyname = 'Authenticated users can view unconfirm events'
  ) then
    create policy "Authenticated users can view unconfirm events"
      on public.run_unconfirm_events
      for select using (auth.role() = 'authenticated');
  end if;
end $$;

-- Wave D Band Comps preserve-hook on the Advancing workspace (no UX this wave).
alter table public.run_advancing_workspaces
  add column if not exists band_comps jsonb;

comment on column public.run_advancing_workspaces.band_comps is
  'Wave D Band Comps hook. Re-BOOK preserve must not wipe this JSON.';

-- Factors menu (Wave A slice). Null = not invented / Finance to set.
-- Do not overwrite existing standing values.
insert into public.run_factors (key, label, category, value, unit, description)
select
  'music_rights_pct',
  'Music Rights %',
  'Revenue',
  null,
  '%',
  'One shared % × tickets × ticket_price (modelled gross admission). AU may stay empty (FIGURES NEEDED). NZ 2% is known in the world but is not applied unless stored here — Factors is one field.'
where not exists (select 1 from public.run_factors where key = 'music_rights_pct');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'daniel_champagne_per_ticket',
  'Daniel Champagne $/ticket',
  'Marketing',
  1.10,
  '$/ticket',
  'Show-level AUTO-CALC per modelled ticket. Default $1+GST. Not FB Ads.'
where not exists (select 1 from public.run_factors where key = 'daniel_champagne_per_ticket');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'harbour_agency_pct',
  'Harbour commission %',
  'Revenue',
  10,
  '%',
  'Standing Harbour agency commission. P&L still uses the locked 10% product rule unless Finance changes this standing default later.'
where not exists (select 1 from public.run_factors where key = 'harbour_agency_pct');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'owner_split_gareth_pct',
  'Owner split — Gareth %',
  'Revenue',
  40,
  '%',
  'Standing owner split of Pre-Distribution Margin (Gareth). Documented product default — not a per-run invented figure.'
where not exists (select 1 from public.run_factors where key = 'owner_split_gareth_pct');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'owner_split_brad_pct',
  'Owner split — Brad %',
  'Revenue',
  30,
  '%',
  'Standing owner split of Pre-Distribution Margin (Brad).'
where not exists (select 1 from public.run_factors where key = 'owner_split_brad_pct');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'owner_split_scott_pct',
  'Owner split — Scott %',
  'Revenue',
  30,
  '%',
  'Standing owner split of Pre-Distribution Margin (Scott).'
where not exists (select 1 from public.run_factors where key = 'owner_split_scott_pct');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'reserve_pct',
  'Reserve % (ex-GST)',
  'Revenue',
  20,
  '%',
  'Standing 20% owner reserve on the ex-GST residual. Product default already used in P&L.'
where not exists (select 1 from public.run_factors where key = 'reserve_pct');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'flights_group4_nz',
  'G4 NZ flights ESTIMATE',
  'Travel & Accommodation',
  null,
  '$',
  'Group 4 NZ flight ESTIMATE. Leave null until Finance/Gareth sets a figure — do not invent.'
where not exists (select 1 from public.run_factors where key = 'flights_group4_nz');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'flights_group4_asia',
  'G4 Asia flights ESTIMATE',
  'Travel & Accommodation',
  null,
  '$',
  'Group 4 Asia flight ESTIMATE. Leave null until Finance/Gareth sets a figure — do not invent.'
where not exists (select 1 from public.run_factors where key = 'flights_group4_asia');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'lighting_hire_per_run',
  'Lighting hire (standing $330)',
  'Production',
  330,
  '$/run',
  'Standing $330 lights per run. Group 3 seed path stays $0 (gear travels) — never apply $330 as a G3 standing hire.'
where not exists (select 1 from public.run_factors where key = 'lighting_hire_per_run');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'fuel_per_litre',
  'Fuel $/L',
  'Travel & Accommodation',
  null,
  '$/L',
  'Fuel rate. Not a run total — no km/litres invented. Distinct from fuel_per_100km if that key already exists.'
where not exists (select 1 from public.run_factors where key = 'fuel_per_litre');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'kia_hire_per_day',
  'Kia Carnival hire $/day',
  'Travel & Accommodation',
  null,
  '$/day',
  'Carnival hire standing default. Used on G2/G3 ground estimates when present.'
where not exists (select 1 from public.run_factors where key = 'kia_hire_per_day');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'hitop_hire_per_day',
  'HiTop hire $/day',
  'Travel & Accommodation',
  null,
  '$/day',
  'HiTop hire standing default. Leave null until Finance sets a figure.'
where not exists (select 1 from public.run_factors where key = 'hitop_hire_per_day');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'accom_per_night',
  'Hotel default (7 rooms) $/night',
  'Travel & Accommodation',
  null,
  '$/night',
  'Hotel / accommodation default for 7 rooms per night. Existing seed uses 1400 when this is set.'
where not exists (select 1 from public.run_factors where key = 'accom_per_night');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'per_diem_per_person_per_day',
  'Per Diem $/person/day',
  'Crew & Operations',
  40,
  '$/person/day',
  'Standing per diem. Costings uses Darryn + Danny (2 people) × estimated nights.'
where not exists (select 1 from public.run_factors where key = 'per_diem_per_person_per_day');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'crew_fee_adam_sound',
  'Crew day rate — Adam (sound)',
  'Crew & Operations',
  600,
  '$/show',
  'Standing crew day rate. Already used as the product default when Factors lines are complete.'
where not exists (select 1 from public.run_factors where key = 'crew_fee_adam_sound');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'crew_fee_michael_lighting',
  'Crew day rate — Michael (lighting)',
  'Crew & Operations',
  600,
  '$/show',
  'Standing crew day rate.'
where not exists (select 1 from public.run_factors where key = 'crew_fee_michael_lighting');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'crew_fee_michael_pm',
  'Crew day rate — Michael (PM)',
  'Crew & Operations',
  250,
  '$/show',
  'Standing crew day rate.'
where not exists (select 1 from public.run_factors where key = 'crew_fee_michael_pm');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'crew_fee_darryn',
  'Crew day rate — Darryn',
  'Crew & Operations',
  600,
  '$/show',
  'Standing crew day rate.'
where not exists (select 1 from public.run_factors where key = 'crew_fee_darryn');

insert into public.run_factors (key, label, category, value, unit, description)
select
  'crew_fee_danny',
  'Crew day rate — Danny',
  'Crew & Operations',
  600,
  '$/show',
  'Standing crew day rate.'
where not exists (select 1 from public.run_factors where key = 'crew_fee_danny');

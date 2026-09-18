-- Wave B: first-class Group Type G1–G4 on Costings.
-- Additive / idempotent. Do NOT apply to prod from this PR.
-- Extends runs.region to group4 and records Costings operator overrides
-- so classify/import do not silently wipe Group Type.

do $$
declare
  conname text;
begin
  select c.conname into conname
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'runs'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%region%group1%group2%group3%'
    and pg_get_constraintdef(c.oid) not ilike '%group4%';
  if conname is not null then
    execute format('alter table public.runs drop constraint %I', conname);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'runs_region_check'
      and conrelid = 'public.runs'::regclass
  ) then
    alter table public.runs
      add constraint runs_region_check
      check (region in ('group1', 'group2', 'group3', 'group4'));
  end if;
end $$;

alter table public.runs
  add column if not exists region_operator_set boolean not null default false;

comment on column public.runs.region is
  'Wave B Group Type (G1–G4). Classifier seeds a default; Costings operator can override.';
comment on column public.runs.region_operator_set is
  'True after a Costings Group Type edit. Classify / Import Schedule must not overwrite.';

-- G4 flight ESTIMATEs (Topic 8). Seed standing figures when still null.
insert into public.run_factors (key, label, category, value, unit, description)
select
  'flights_group4_nz',
  'G4 NZ flights ESTIMATE',
  'Travel & Accommodation',
  6000,
  '$',
  'Group 4 NZ whole-party return ESTIMATE $6,000+GST. Factors standing default until real quotes.'
where not exists (select 1 from public.run_factors where key = 'flights_group4_nz');

update public.run_factors
set
  value = 6000,
  description = 'Group 4 NZ whole-party return ESTIMATE $6,000+GST. Factors standing default until real quotes.'
where key = 'flights_group4_nz' and value is null;

insert into public.run_factors (key, label, category, value, unit, description)
select
  'flights_group4_asia',
  'G4 Asia flights ESTIMATE',
  'Travel & Accommodation',
  10000,
  '$',
  'Group 4 Asia whole-party return ESTIMATE $10,000+GST. Factors standing default until real quotes.'
where not exists (select 1 from public.run_factors where key = 'flights_group4_asia');

update public.run_factors
set
  value = 10000,
  description = 'Group 4 Asia whole-party return ESTIMATE $10,000+GST. Factors standing default until real quotes.'
where key = 'flights_group4_asia' and value is null;

insert into public.run_factors (key, label, category, value, unit, description)
select
  'keyboard_stand_hire',
  'Keyboard + stand hire',
  'Production',
  null,
  '$',
  'G4 keyboard + stand hire ESTIMATE. G3 never seeds this (own keyboard travels).'
where not exists (select 1 from public.run_factors where key = 'keyboard_stand_hire');

update public.run_factors
set description = 'Standing $330 lights per run. G1/G2 only — never apply $330 as a G3 or G4 standing hire.'
where key = 'lighting_hire_per_run';

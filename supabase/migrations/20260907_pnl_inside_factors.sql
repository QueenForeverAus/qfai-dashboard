-- P&L → Run Costing merge: Ticketing/Inside Costs Factors + venue override hooks
-- Staging only — nlenbzhwnyigsihcphoz
-- Additive. Do NOT apply to prod (pfbgrukqxegkiaksuatm).
-- Standing $/% may stay null until Finance seeds after Gareth picks defaults.
-- NEVER seed hist 7.3% as known. LPA/EIS/APRA/BO setup are OUT of these keys.

-- Allow unseeded standing values (Finance seeds later).
alter table public.run_factors
  alter column value drop not null;

comment on column public.run_factors.value is
  'Standing $/% factor. Null = not seeded (Finance). Estimated silent default only — never known.';

-- Per-show venue overrides for inside Factors (nullable). App math: remittance/contract known wins.
alter table public.shows
  add column if not exists booking_fee_per_payer numeric(10, 2);

alter table public.shows
  add column if not exists cc_fee_pct numeric(8, 4);

comment on column public.shows.booking_fee_per_payer is
  'Venue override for booking_fee_per_payer ($/payer). Estimated unless remittance/contract known.';

comment on column public.shows.cc_fee_pct is
  'Venue override for inside CC % of ticket gross. Estimated unless remittance/contract known.';

-- Optional later stub. Do not require seed.
insert into public.run_factors (key, label, category, value, unit, description)
select
  'ticketing_inside_pct',
  'Ticketing / inside % of ticket gross (optional)',
  'Ticketing / Inside Costs',
  null,
  '%',
  'Optional stub. % of ticket gross added to inside (pre-commission) costs. Leave null until Finance seeds. Estimated only — never known. LPA/EIS/APRA/BO setup are OUT.'
where not exists (
  select 1 from public.run_factors where key = 'ticketing_inside_pct'
);

-- Wire contract keys if missing. Do not overwrite existing standing values.
insert into public.run_factors (key, label, category, value, unit, description)
select
  'booking_fee_per_payer',
  'Booking fee (per payer)',
  'Ticketing / Inside Costs',
  null,
  '$/payer',
  'Estimated silent default for inside (pre-commission) booking fees. Venue override allowed on shows.booking_fee_per_payer. Remittance/contract known wins. Never seed hist 7.3% as known.'
where not exists (
  select 1 from public.run_factors where key = 'booking_fee_per_payer'
);

-- cc_fee_pct already exists in Revenue on staging (old calculator). Do not duplicate or overwrite.
-- Ticketing-category inside_cc_fee_pct is the preferred inside CC standing default when present.
insert into public.run_factors (key, label, category, value, unit, description)
select
  'cc_fee_pct',
  'CC / merchant fee % of ticket gross',
  'Ticketing / Inside Costs',
  null,
  '%',
  'Estimated silent default for inside CC/merchant % of ticket gross. Venue override allowed. Remittance/contract known wins. Do not use hist 7.3% as known. LPA/EIS/APRA/BO setup are OUT.'
where not exists (
  select 1 from public.run_factors where key = 'cc_fee_pct'
);

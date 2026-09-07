-- Staging-only additive Factors for P&L → Run Costing insides.
-- DO NOT apply to prod.
-- DO NOT overwrite or bump Revenue cc_fee_pct (keep 1.0%). Auto-calc READS it.
-- Idempotent: Finance may also seed booking_fee_per_payer.
-- inside_cc_fee_pct is an optional later stub — do NOT require a seed.

-- booking_fee_per_payer = 4.50 estimated (Ticketing/Inside Costs)
insert into public.run_factors (key, label, category, value, unit, description)
select
  'booking_fee_per_payer',
  'Booking fee (per payer)',
  'Ticketing/Inside Costs',
  4.50,
  '$/payer',
  'Silent estimated default for P&L insides when remittance/contract silent. Dual model with Revenue cc_fee_pct. Venue override OK. Remittance/contract known wins. Never known from this Factor alone.'
where not exists (
  select 1 from public.run_factors where key = 'booking_fee_per_payer'
);

-- Optional later stub (unused until Lead/Gareth set a value). Skip if already present.
insert into public.run_factors (key, label, category, value, unit, description)
select
  'ticketing_inside_pct',
  'Ticketing inside % (optional stub)',
  'Ticketing/Inside Costs',
  0,
  '%',
  'Optional later stub. Unused at 0. Not LPA/EIS/APRA/BO setup.'
where not exists (
  select 1 from public.run_factors where key = 'ticketing_inside_pct'
);

comment on table public.run_factors is
  'Rule inputs. P&L insides silent default reads booking_fee_per_payer + Revenue cc_fee_pct (do not bump cc_fee_pct). inside_cc_fee_pct is an optional unused stub.';

-- Staging-only additive Factors for P&L → Run Costing insides.
-- DO NOT apply to prod. DO NOT overwrite Revenue cc_fee_pct (keep 1.0%).
-- Idempotent: Finance may also seed these rows.

-- booking_fee_per_payer = 4.50 estimated (Gareth standing default)
insert into public.run_factors (key, label, category, value, unit, description)
select
  'booking_fee_per_payer',
  'Booking fee (per payer)',
  'Ticketing/Inside Costs',
  4.50,
  '$/payer',
  'Silent estimated default for P&L insides when remittance/contract silent. Venue override OK. Remittance/contract known wins. Never known from this Factor alone.'
where not exists (
  select 1 from public.run_factors where key = 'booking_fee_per_payer'
);

-- inside_cc_fee_pct = 1.6 estimated — insides-only. Leave Revenue cc_fee_pct alone.
insert into public.run_factors (key, label, category, value, unit, description)
select
  'inside_cc_fee_pct',
  'Inside credit card fee rate',
  'Ticketing/Inside Costs',
  1.6,
  '%',
  'Gareth standing estimated default for P&L insides (1.6%). Separate from Revenue cc_fee_pct (keep 1.0%). Remittance/contract known wins. Never known from Factor alone.'
where not exists (
  select 1 from public.run_factors where key = 'inside_cc_fee_pct'
);

-- Optional later stub (unused until set). Skip if Finance already inserted.
insert into public.run_factors (key, label, category, value, unit, description)
select
  'ticketing_inside_pct',
  'Ticketing inside % (optional stub)',
  'Ticketing/Inside Costs',
  0,
  '%',
  'Optional later stub. Unused at 0. Not LPA/EIS/APRA/BO setup. Not Revenue cc_fee_pct.'
where not exists (
  select 1 from public.run_factors where key = 'ticketing_inside_pct'
);

comment on table public.run_factors is
  'Rule inputs. Ticketing/Inside Costs keys (booking_fee_per_payer, inside_cc_fee_pct) are estimated P&L insides only — do not overwrite Revenue cc_fee_pct.';

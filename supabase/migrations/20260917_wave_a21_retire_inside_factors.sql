-- Wave A2.1: soft-retire Factors keys that no longer seed Inside Fees / APRA.
-- Staging only. Do NOT apply to prod from this PR.
-- Historical values are retained. App hides these keys from Factors UI + seed.

update public.run_factors
set description = case
  when description is null or description = '' then
    'Retired Wave A2.1 — hidden from Factors UI. Historical value retained. Inside fees now come from contract / Harbour Draft / operator lines. Music Rights stays.'
  when description ilike '%Retired Wave A2.1%' then description
  else description || ' Retired Wave A2.1 — hidden from Factors UI; historical value retained.'
end
where key in (
  'apra_pct',
  'cc_fee_pct',
  'booking_fee_per_payer',
  'comp_ticket_fee_per_payer',
  'inside_cc_fee_pct',
  'ticketing_inside_pct'
);

comment on table public.run_factors is
  'Standing defaults for unbooked Costings. Wave A2.1 hides APRA / inside-fee rate keys from UI and seed; values kept.';

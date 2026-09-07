-- Phase 3 Settlements 3-col sheet (staging only — nlenbzhwnyigsihcphoz)
-- Additive: actual tickets sold for Col2 expected P&L (not sell-through).
-- Do NOT apply to prod (pfbgrukqxegkiaksuatm).

alter table public.shows
  add column if not exists tickets_sold integer;

comment on column public.shows.tickets_sold is
  'Phase 3 Settlements: actual tickets sold (entered or known). Used to re-run Run Costing P&L formulas on the Sheet. Not a sell-through slider.';

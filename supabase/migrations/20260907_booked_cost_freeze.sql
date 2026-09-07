-- Phase 2 BOOKED cost freeze (staging only — nlenbzhwnyigsihcphoz)
-- Additive columns on runs: cost-sheet snapshot taken when booking status becomes BOOKED.
-- Do NOT apply to prod (pfbgrukqxegkiaksuatm).
-- Sell-through / revenue sliders are not stored here and stay live-editable.

alter table public.runs
  add column if not exists booked_cost_snapshot jsonb,
  add column if not exists booked_cost_frozen_at timestamptz,
  add column if not exists booked_cost_frozen_by uuid references public.profiles (id);

comment on column public.runs.booked_cost_snapshot is
  'Phase 2: frozen venue + run cost lines at BOOKED (status=confirmed). Not sell-through. Distinct from Settlements Finalise costing_snapshot.';
comment on column public.runs.booked_cost_frozen_at is
  'When the BOOKED cost-sheet snapshot was captured.';
comment on column public.runs.booked_cost_frozen_by is
  'Profile that transitioned the run to BOOKED (or lazy backfill actor).';

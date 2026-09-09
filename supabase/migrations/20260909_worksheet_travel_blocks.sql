-- W1 structured Worksheet travel blocks (staging only — nlenbzhwnyigsihcphoz)
-- Additive JSON on the BOOKED Run Advancing workspace. Do NOT apply to prod
-- (pfbgrukqxegkiaksuatm). Never writes locked Run Costings / cost_fields.
-- Legacy runs.flights_notes / vehicles_notes / hotels_overview_notes stay readable.

alter table public.run_advancing_workspaces
  add column if not exists travel_blocks jsonb not null default
    '{"version":1,"flights":[],"cars":[],"hotels":[],"transfers":[],"ferries":[]}'::jsonb;

comment on column public.run_advancing_workspaces.travel_blocks is
  'W1 structured Worksheet travel cards (flights/cars/hotels/transfers/ferries). Ops edit on BOOKED twin. Hotel PIN is PII — do not write to audit_log. Never writes cost_fields.';

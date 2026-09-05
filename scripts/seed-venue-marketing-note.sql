-- STAGING ONLY nlenbzhwnyigsihcphoz — do NOT run on prod
-- Reproducible copy of supabase/migrations/20260905_seed_venue_marketing.sql
-- Orchestrator applies this on the staging DB; do not run against prod
-- (pfbgrukqxegkiaksuatm).

INSERT INTO cost_fields (
  run_id,
  show_id,
  category,
  field_key,
  label,
  value,
  state,
  entries
)
SELECT
  s.run_id,
  s.id,
  'Venue Costs',
  'venue_marketing',
  'Venue Marketing',
  0,
  'guess',
  jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'description', 'Venue Marketing',
      'notes', '',
      'amount', 0,
      'gst_included', true,
      'confirmed', false
    )
  )
FROM shows s
WHERE NOT EXISTS (
  SELECT 1
  FROM cost_fields cf
  WHERE cf.show_id = s.id
    AND cf.field_key = 'venue_marketing'
);

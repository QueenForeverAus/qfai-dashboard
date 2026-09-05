-- STAGING ONLY nlenbzhwnyigsihcphoz — do NOT run on prod
-- Do NOT apply to prod DB pfbgrukqxegkiaksuatm.
--
-- Idempotent seed: INSERT venue_marketing for every show that lacks it.
-- value 0, state guess, label Venue Marketing, category Venue Costs, ≥1 entry amount 0.

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

-- Venue Marketing show-level cost field seed (STAGING ONLY)
-- Applied by orchestrator on staging Supabase (nlenbzhwnyigsihcphoz).
-- Do NOT run against prod (pfbgrukqxegkiaksuatm).
--
-- Ensures every show has a venue_marketing cost_fields row under Venue Costs.
-- Idempotent: skips shows that already have field_key = 'venue_marketing'.

INSERT INTO cost_fields (
  run_id,
  show_id,
  category,
  field_key,
  label,
  value,
  state,
  source,
  entries,
  line_items
)
SELECT
  s.run_id,
  s.id AS show_id,
  'Venue Costs' AS category,
  'venue_marketing' AS field_key,
  'Venue Marketing' AS label,
  0 AS value,
  'guess' AS state,
  'Seeded venue marketing levy / promo / EDM — classify from Harbour quotes.' AS source,
  jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'description', 'Venue Marketing',
      'notes', '',
      'amount', 0,
      'gst_included', false,
      'confirmed', false
    )
  ) AS entries,
  '[]'::jsonb AS line_items
FROM shows s
WHERE NOT EXISTS (
  SELECT 1
  FROM cost_fields cf
  WHERE cf.show_id = s.id
    AND cf.field_key = 'venue_marketing'
);

-- Optional: after Portal seed, move known marketing parks via
-- lib/venue-line-classifier.ts reclassifyShowVenueLines (admin tooling / import-schedule PUT).

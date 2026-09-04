-- Run Costing: ensure every cost line has ≥1 entry; value follows entries sum.
-- Target: staging project nlenbzhwnyigsihcphoz (additive only — do NOT run on prod).
--
-- Backfill rule (documented for PR):
--   A) entries null/empty + value set  → one entry with amount = value, description = label (or 'Estimate')
--   B) entries null/empty + value null → one entry with amount = 0, description = label (or 'Estimate')
--   C) entries non-empty and value diverges from sum(entries.amount)
--        → KEEP entries, SET value = sum(entries)
--   Exempt: social_ads_var, gross_box_office (auto-calc / revenue; entries optional)
--   venue_staff: still gets ≥1 entry when empty (A/B); value sync (C) skipped when
--     line_items is a non-empty array so planned-roles total is not overwritten.

-- A + B: seed a default entry when missing
UPDATE cost_fields
SET
  entries = jsonb_build_array(
    jsonb_build_object(
      'id', gen_random_uuid()::text,
      'description', COALESCE(NULLIF(btrim(label), ''), 'Estimate'),
      'notes', '',
      'amount', COALESCE(value, 0),
      'gst_included', true,
      'confirmed', false
    )
  ),
  updated_at = now()
WHERE field_key NOT IN ('social_ads_var', 'gross_box_office')
  AND (
    entries IS NULL
    OR entries = 'null'::jsonb
    OR jsonb_typeof(entries) <> 'array'
    OR jsonb_array_length(entries) = 0
  );

-- C: sync value ← sum(entries) when they diverge (keep entries)
UPDATE cost_fields cf
SET
  value = sub.sum_amt,
  updated_at = now()
FROM (
  SELECT
    id,
    COALESCE((
      SELECT SUM(COALESCE((e->>'amount')::numeric, 0))
      FROM jsonb_array_elements(entries) AS e
    ), 0) AS sum_amt
  FROM cost_fields
  WHERE field_key NOT IN ('social_ads_var', 'gross_box_office')
    AND entries IS NOT NULL
    AND jsonb_typeof(entries) = 'array'
    AND jsonb_array_length(entries) > 0
    -- Preserve venue_staff planned-roles value when line_items present
    AND NOT (
      field_key = 'venue_staff'
      AND line_items IS NOT NULL
      AND jsonb_typeof(line_items) = 'array'
      AND jsonb_array_length(line_items) > 0
    )
) AS sub
WHERE cf.id = sub.id
  AND cf.value IS DISTINCT FROM sub.sum_amt;

COMMENT ON TABLE cost_fields IS
  'Run costing lines. For most field_keys, value must equal sum(entries.amount); UI total is read-only. venue_staff may derive value from line_items (planned roles).';

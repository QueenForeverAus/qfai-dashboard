-- NOTE (not a DDL migration): venue_marketing is an application-defined cost_fields.field_key.
-- Seed reproducibility: see scripts/seed-venue-marketing.sql (staging only).
-- UI: DEFINED_SHOW_COST_FIELDS + PRODUCTION_EDITABLE_FIELD_KEYS in lib/cost-fields.ts.
-- Classifier: lib/venue-line-classifier.ts
SELECT 1;

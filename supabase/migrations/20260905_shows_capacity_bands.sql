-- Capacity bands for P&L sell-slider modelling (staging first).
-- Additive only: keeps shows.capacity as physical max / top band.
-- Does NOT overwrite venue_staff (base / currently on-sale staff stays SoT).

ALTER TABLE shows
  ADD COLUMN IF NOT EXISTS capacity_bands jsonb;

COMMENT ON COLUMN shows.capacity IS
  'Physical max / top band seat count. When capacity_bands is set, keep this equal to max(band.seats).';

COMMENT ON COLUMN shows.capacity_bands IS
  'Ordered Harbour capacity options for calculator banding. JSON array of { seats, label?, ushers_cost?, security_cost?, ushers_headcount?, security_headcount? }. Ascending by seats. Null/empty = single-cap behaviour. Per-band staff $ is Harbour senior when present; else scale ushers+security by band_cap/base_cap. Never auto-step FOH manager / fixed tech / stage door. Saved venue_staff remains BASE.';

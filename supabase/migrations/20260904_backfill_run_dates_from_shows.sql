-- Backfill runs.start_date / end_date from min/max shows.show_date (calendar SoT).
-- Additive data fix only — no schema changes.
-- Target: staging project nlenbzhwnyigsihcphoz (do NOT run on prod without explicit approval).
--
-- Context: runs.start_date/end_date are a denormalized cache that was never synced
-- when CostFieldsTab edited shows.show_date via PATCH /api/shows/[id]. This caused
-- R11 header drift. Sync-on-write is now in app code; this migration repairs existing rows.

UPDATE runs r
SET
  start_date = s.min_date,
  end_date   = s.max_date
FROM (
  SELECT
    run_id,
    MIN(show_date)::date AS min_date,
    MAX(show_date)::date AS max_date
  FROM shows
  WHERE show_date IS NOT NULL
  GROUP BY run_id
) s
WHERE r.id = s.run_id
  AND (
    r.start_date IS DISTINCT FROM s.min_date
    OR r.end_date IS DISTINCT FROM s.max_date
  );

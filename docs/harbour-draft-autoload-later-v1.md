# Harbour Draft autoload — later v1 (parked)

**Status: LATER** — not this PR.  
**Repo:** QueenForeverAus/qfai-dashboard

Autoload / ingest of a newer Harbour Draft (without a human choosing the xlsx on Admin) is parked. When it is built, it is still Import Schedule: same match rules, same write set, same preserve rule.

**HARD standing rule (Gareth 2026-09-10)** is locked in [`import-schedule-harbour-fields-v1.md`](./import-schedule-harbour-fields-v1.md):

- Across import — new shows, same-date, **or date moves** — preserve all team-entered Portal data.
- Harbour must not overwrite or wipe QF-entered fields.
- Date moves: UPDATE the same `shows.id` (`show_date` + Harbour-sourced venue fields only) so FKs keep cost_fields / advancing / worksheets / notes.
- Soft-retire orphans only with explicit GO.

Do not implement autoload, date-move UI, or prod migrate in this file's trail. Builder owns the prod date-move migrate separately.

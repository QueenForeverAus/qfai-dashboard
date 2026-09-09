# SAMPLE completed shows (staging only)

Eight invented completed runs (`SAMP01`–`SAMP08`) for the Settlements list and 3-col sheet. Venues and figures are made up. This seed **never** touches `R01`, `TRECV1`, `TCOMP1`, or `R12`.

Hard-refuses production Supabase (`pfbgrukqxegkiaksuatm`). Idempotent — re-run safe.

## Invoke on staging

Signed in as admin/owner (session cookie) **or** `x-settlements-seed-token` when `SETTLEMENTS_SEED_TOKEN` is set on the staging env:

```bash
curl -sS -X POST "$STAGING/api/admin/seed-settlements-samples" \
  -H "Content-Type: application/json" \
  -H "Cookie: $STAGING_SESSION_COOKIE" \
  -d '{"confirm":"SAMPLE_ONLY"}'
```

Inventory (no writes):

```bash
curl -sS "$STAGING/api/admin/seed-settlements-samples"
```

## Accuracy × lifecycle

| Code | Accuracy | Lifecycle | Venue (invented) | Show date |
| --- | --- | --- | --- | --- |
| SAMP01 | Accurate | Completed, not settled | The Marble Room, Port Rowan | 2026-07-18 |
| SAMP02 | Accurate | Settled, not remitted | Willowgate Civic Hall, Kestrel Bay | 2026-06-22 |
| SAMP03 | Accurate | Settled & remitted | Red Lantern Pavilion, Ironbark | 2026-05-09 |
| SAMP04 | A little out | Completed, not settled | Northwharf Studio Theatre, Cape Lumen | 2026-04-03 |
| SAMP05 | A little out | Settled, not remitted | Clocktower Rooms, Millhaven | 2026-03-14 |
| SAMP06 | A little out | Settled & remitted | Saltwind Arts House, Greyhaven | 2026-02-28 |
| SAMP07 | Completely wrong | Completed, not settled | The Copper Attic, Finchley Vale | 2026-01-11 |
| SAMP08 | Completely wrong | Settled & remitted | Harborlight Room, Newbridge-on-Murray | 2025-12-07 |

Canonical figures live in `lib/settlements-sample-fixtures.ts`.

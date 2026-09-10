# SAMPLE completed shows (staging only)

Eight invented completed runs (`SAMP01`–`SAMP08`) for the Settlements list and Settlements v3 (four sections). Venues and figures are made up. This seed **never** touches `R01`, `TRECV1`, `TCOMP1`, or `R12`.

Hard-refuses production Supabase (`pfbgrukqxegkiaksuatm`). Idempotent — re-run safe.

**Booking status:** SAMPLE runs stay `runs.status = confirmed` (Portal BOOKED) so Run Advancing stays open. Settlements completed-only still includes them because `show_date` is in the past. Do **not** re-seed them as `post_show` / `settled` — that regresses Advancing. Real non-SAMPLE shows stay BOOKED-only; this is not a production Advancing exception.

**SAMP04 Northwharf Studio Theatre** is the Advancing + Settlements test vehicle: past show date, BOOKED status, and a realistic Advancing mix (some PAID, some confirmed unpaid, plus `social_ads_var` AUTO CALC — Social Media Marketing Co. / Daniel Champagne). Labels: Venue Production/AV + Production Bought In.

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

## Settlements v3 smoke (staging)

Prod is held. On staging, after SAMPLE seed:

1. **Email scrape (no UI loaders)** — **Load Harbour fixture** and **Load BNZ-shaped venue statement** are gone. Ingest via `POST /api/settlements/:runId/email-scrape/apply` with `settlement-scrape-packet-v1` (or `fixture_id`: `bnz-shaped-settlement`, `samp04-northwharf-settlement`, `samp04-northwharf-remittance`). Confirm Hire / Staff / Marketing / Venue Production/AV / other buckets, insides **known** from the ticket block, hire deposit applied **once**. Never auto-send. PAID never auto without `confirm_money` / `money_confirmed_by` (and scrape still does not mark PAID).
2. **SAMP04 Northwharf (Advancing + Settlements)** — Settlements completed / not settled → open Advancing. Status must be BOOKED (`confirmed`), not `post_show`. Mix: flights / accommodation / Production Bought In **PAID** — those lines must show on Settlements §3 **Advancing Costs** as **locked + PAID** (no Expected|Actual|Δ chrome on §3). Venue hire / staff / Venue Production/AV + crew **confirmed unpaid**; Social Media Marketing Co. **AUTO CALC**. Re-seed must not regress this.
3. **SAMP01 Accurate / not settled** — Expected from Advancing only. No venue actuals. Nigel assessment should stay quiet on venue Δ. Chat + Harbour/Michael drafts are preview only (never auto-send).
4. **SAMP02 Accurate / settled** — Col3 within ~1–2%. Soft flags only if any.
5. **SAMP08 Completely wrong / remitted** — wild tickets, duplicate staff, missing AV → prominent red flags. Draft Harbour challenge from the assessment thread. **Draft Michael fact-check** is from Nigel (tours@) to Michael and lists only Venue Staff / Venue Production/AV / other production charges / Backline Hire. `sent_at` stays null.

Honest residuals: GST quarantines $0 when not on the statement (no NZ 15% / AU 10% invented). If printed Due to Hirer matches neither with- nor without-deposit arithmetic, the page says so and does not double-count.

### Removed

- Load Harbour fixture (Settlements UI button + help)
- Load BNZ-shaped venue statement (Settlements UI button + help)
- Manual paste of Harbour / BNZ fixture lines on Settlements
- `POST /api/settlements/:runId/sheet/fixture` (410 — use email-scrape apply)

# Hotel receipt fixtures (Tour Desk v2 Phase 3)

Synthetic AUD hotel packets for staging smoke. Email scrape is **not** wired.

| Fixture | File | Nights | Catchment |
|---|---|---|---|
| Thornton Executive | `thornton-executive.json` | 17–18 Sep 2026 | Maitland / Thornton → Newcastle (day before first show) |
| Tamworth Hotel | `tamworth-hotel.json` | 18–19 Sep 2026 | Tamworth |
| Port O'Call | `port-ocall.json` | 19–20 Sep 2026 | Port Macquarie |

Canonical typed copies live in `lib/receipts/hotel-fixtures.ts`.

## Per-night model

One run-level `accommodation` row on **Run Advancing** (`advancing_cost_fields`). Each stay night is a `entries[]` line keyed by `night_date` + city. This keeps the Costing twin (one `field_key` per workspace) and the BOOKED freeze / copy index intact. We do **not** add extra `accommodation` field rows or write `cost_fields`.

## Staging smoke

The Portal **Apply receipt extract** paste/fixture panel was removed in W2. Apply is API-only (`POST /api/runs/:runId/advancing-receipts/apply`) for the W3 scraper. Fixtures and unit tests stay.

W2 UI check (owner/admin):

1. **Advancing Shows** → a **BOOKED** run → **Run Advancing** (`/runs/<code>?tab=run_advancing`). Confirm there is no “Apply receipt extract” textarea / fixture chips.
2. **Worksheet** (`/runs/<code>?tab=show_pack`) — structured travel cards still render (`worksheet-travel-blocks`).

Happy-path apply (API / W3, not this UI):

1. Itinerary window covering **17–19 Sep 2026** (first show 18 Sep Newcastle, then Tamworth 19 Sep, Port Macquarie 20 Sep).
2. `POST` each fixture (`fixture_id` or `packet`) with `confirm: true`.
3. Check:
   - Advancing Accommodation has three PAID night lines with `Booking confirm <vendor> conf <id> DD/MM/YY`.
   - Worksheet **Hotel** notes on the attached shows + run **Hotel nights** overview.
   - Advancing Checklist `hotel_confirmed` is done (P2 PAID→tick / explicit booked fact). One paid night is enough; there is no separate “all names” item.
   - **Run Costing** accommodation is unchanged (frozen / never written).
4. **R01** (Broken Hill Feb 2027) is **not** a happy-path target. Preview must error *Low confidence / itinerary window* — that is correct. Do not invent production runs; if staging has no NSW Sep itinerary, BOOK a staging-only demo run with those three show dates, or stop after confirming the R01 reject.

Email scrape, Settlements Col2 bind, Settings toggles, Amex/bank feed, and Uber Eats band-meals are out of scope.

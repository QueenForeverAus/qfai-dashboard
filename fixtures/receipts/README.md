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

1. Sign in as owner/admin. Open **Advancing Shows** → a **BOOKED** run → **Run Advancing**.
2. Happy path needs an itinerary window covering **17–19 Sep 2026** (first show 18 Sep Newcastle, then Tamworth 19 Sep, Port Macquarie 20 Sep). If a staging BOOKED run already has those dates, use it.
3. In **Apply receipt extract**, pick each fixture → **Preview match** (confidence high / medium, nights attached) → **Confirm apply**.
4. Check:
   - Advancing Accommodation has three PAID night lines with `Booking confirm <vendor> conf <id> DD/MM/YY`.
   - Worksheet **Hotel** notes on the attached shows + run **Hotel nights** overview.
   - Advancing Checklist `hotel_confirmed` is done (P2 PAID→tick / explicit booked fact). One paid night is enough; there is no separate “all names” item.
   - **Run Costing** accommodation is unchanged (frozen / never written).
5. **R01** (Broken Hill Feb 2027) is **not** a happy-path target. Preview must error *Low confidence / itinerary window* — that is correct. Do not invent production runs; if staging has no NSW Sep itinerary, BOOK a staging-only demo run with those three show dates, or stop after confirming the R01 reject.

Email scrape, Settlements Col2 bind, Settings toggles, Amex/bank feed, and Uber Eats band-meals are out of scope.

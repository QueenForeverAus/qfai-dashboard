# Travel scrape apply

Accept Comms `travel-scrape-packet-v1` packets and apply them to a **BOOKED** run’s Run Advancing twin.

Live tours@ inbox scrape stays parked. This folder is the apply contract + fixtures so Comms/Lead can POST.

Canonical typed copies: `lib/travel-scrape/fixtures.ts`.

| Fixture | File | `fixture_id` | Card |
|---|---|---|---|
| Thornton Executive | `thornton-executive.json` | `thornton-executive-scrape` | Hotel · one night / Thornton |
| Tamworth Hotel | `tamworth-hotel.json` | `tamworth-hotel-scrape` | Hotel · one night / Tamworth |
| R01 / TRECV1 dep | `r01-dep-flight.json` | `r01-dep-flight` | Flight · Dep QF441 SYD→BHQ 10 Feb 2027 |

Car merge is covered in unit tests (`trecv1-avis-car`). W2 hotel receipt-extract fixtures (`thornton-executive`, `tamworth-hotel`, `port-ocall`) still apply on the same route.

## Month-one policy

| Kind | Action |
|---|---|
| Worksheet `travel_blocks` | Apply when `details_action: auto` **and** confidence **high** **and** no `run_ambiguous` / `run_unknown` |
| Checklist tick + source note | Follows a successful details apply. Source note is stored on the **checklist item** (`advancement_items.notes`) — not Worksheet card chrome |
| Money / PAID on Run Advancing | **Never auto.** `money_action: confirm` needs `confirm_money=true` or body `money_confirmed_by` |
| Run Costings | **Never write** |
| Proposed-only runs | **Never attach** — BOOKED + active advancing workspace required |

## Money field (`money_field_id` is shared)

`accom_night` maps to the single run-level **Accommodation** Advancing field (`field_key: accommodation`). Hotel POSTs reuse the same `money_field_id` — that is expected, not a last-write-wins collision. Stay nights live as JSON `entries[]` on that field. PAID is **per-entry**.

The apply `money` object identifies the night:

- `money_field_id` — shared accommodation row (also aliased as `field_id`)
- `money_entry_id` — this night’s entry uuid
- `city_night_key` — hotel confirmation when present, else `city:night_date` (e.g. `maitland:2026-09-17`)

Re-applying the same night (same `confirmation_id`, or else same city+night) **updates** that entry only. It does not replace `entries[]` with a single night or add a second field. Refunds (`receipt_kind=refund`) stay beside the charge.

Non-accommodation lines (flights, car, ferry, …) upsert **once per `confirmation_id`** on the shared field. A missing / blank confirmation **refuses the money write** (`skipped`) so a second `confirm_money` cannot invent a `confirmation_id=null` duplicate beside an existing PNR total. Hotel / accom night matching is unchanged.

## Apply route

`POST /api/runs/:runId/advancing-receipts/apply`

Auth (either):

- Owner/admin session cookie (humans)
- Machine token: `Authorization: Bearer $TRAVEL_SCRAPE_APPLY_SECRET` **or** `x-qfai-travel-scrape-key: $TRAVEL_SCRAPE_APPLY_SECRET`

If `TRAVEL_SCRAPE_APPLY_SECRET` is unset, Bearer / header attempts are 401. Set the secret on the target Vercel project (staging **and** production). Never commit a real value. `apply_env=production` is accepted on the real prod deploy; `apply_env=staging` still works on staging. Money/PAID still never auto.

`:runId` may be the run UUID or code (`TRECV1`, `R01`).

Body:

```json
{
  "fixture_id": "thornton-executive-scrape"
}
```

or

```json
{ "packet": { "schema_version": "travel-scrape-packet-v1", "...": "..." } }
```

Optional:

- `"preview": true` — plan only, no writes
- `"confirm_money": true` **or** `"money_confirmed_by": "Gareth"` — write Advancing amount/PAID
- query `?confirm_money=true` — same money hook

W2 receipt-extract packets (`version: 1`) are unchanged: they still preview unless `confirm: true`. `confirm: true` does **not** count as a Gareth money confirm for travel-scrape packets. Machine auth is travel-scrape-packet-v1 / scrape fixtures only.

## Staging smoke (BOOKED TRECV1 or R01)

1. Confirm the target is **BOOKED** with an active Run Advancing workspace (Worksheet travel cards from W1).
2. POST a hotel fixture (no money hook) as Comms — Bearer, not a browser session:

```bash
curl -sS -X POST "$STAGING/api/runs/TRECV1/advancing-receipts/apply" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TRAVEL_SCRAPE_APPLY_SECRET" \
  --data '{"fixture_id":"thornton-executive-scrape"}'
```

Owner/admin cookie still works:

```bash
curl -sS -X POST "$STAGING/api/runs/TRECV1/advancing-receipts/apply" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  --data '{"fixture_id":"thornton-executive-scrape"}'
```

3. Expect `applied: true`, `details.action: "applied"`, `money.action: "confirm_needed"`, `writes_cost_fields: false`.
4. On the run: **Worksheet** shows a Thornton Executive hotel card; **Advancing Checklist** `hotel_confirmed` is done with source note `from Thornton Executive email 17/09/26 · conf TE-91718`. Run Advancing accommodation is **not** PAID yet. **Run Costing** is unchanged.
5. Repeat with `r01-dep-flight` on R01 or TRECV1 — Dep flight card + `flights_complete` tick/source note; flights money still pending.
6. Re-POST the same hotel with money confirm:

```bash
curl -sS -X POST "$STAGING/api/runs/TRECV1/advancing-receipts/apply?confirm_money=true" \
  -H "Content-Type: application/json" \
  -H "Cookie: $SESSION_COOKIE" \
  --data '{"fixture_id":"thornton-executive-scrape","money_confirmed_by":"Gareth"}'
```

7. Expect `money.action: "written"` on the Advancing twin only. Costing still frozen/untouched.
8. POST the same packet to a **proposed** run — `409`, no workspace attach.

Out of scope: live tours@ scrape, paid flight APIs, prod migrate/deploy, re-adding the Apply JSON panel.

W4 flight-# Lookup + airport-call auto: `lib/flight-lookup/README.md` (Worksheet cards; does not change this apply route).

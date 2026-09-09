# Travel scrape apply (W3, staging)

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

## Apply route

`POST /api/runs/:runId/advancing-receipts/apply` (owner/admin session).

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

W2 receipt-extract packets (`version: 1`) are unchanged: they still preview unless `confirm: true`. `confirm: true` does **not** count as a Gareth money confirm for travel-scrape packets.

## Staging smoke (BOOKED TRECV1 or R01)

1. Sign in as owner/admin on staging. Confirm the target is **BOOKED** with an active Run Advancing workspace (Worksheet travel cards from W1).
2. POST a hotel fixture (no money hook):

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

Out of scope: live tours@ scrape, W4 flight-# lookup / airport-call, prod migrate/deploy, re-adding the Apply JSON panel.

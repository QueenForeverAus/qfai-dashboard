# Flight # lookup (W4, staging)

Worksheet Flight cards: enter **flight # + date**, tap **Lookup**. A pluggable schedule provider fills airline, from→to, local dep/arr, and terminals **only when known**. Airport call is then auto from dep time + G2/G3.

This PR does **not** sign up for a paid flight API. Staging smoke uses the in-repo mock fixtures.

## Mock (staging default)

When `FLIGHT_LOOKUP_API_KEY` + `FLIGHT_LOOKUP_API_URL` are unset, staging / preview / localhost uses the fixture list in `fixtures.ts`:

| Flight | Date | Route | Dep | Terminals |
|---|---|---|---|---|
| QF441 | 2027-02-10 | SYD→BHQ | 06:30 | dep T3 · arr unknown (blank) |
| QF442 | 2027-02-13 | BHQ→SYD | 16:00 | none (never invent) |
| QF11 | 2027-02-11 | BHQ→ADL | 09:40 | arr T1 only |

A miss (unknown number, or known number on the wrong date) leaves fields blank and shows a soft error.

G2 airport call = dep − 60 min (QF441 → **05:30**). G3 = dep − 110 min (QF441 → **04:40**). Band comes from `runs.region` (`group2` / `group3`); G1 / unknown shows an editable select and does not guess.

## Point at a real provider later (no signup in this PR)

Set both env vars on the Vercel project (staging first). Do not commit keys.

| Env | Purpose |
|---|---|
| `FLIGHT_LOOKUP_API_URL` | HTTPS endpoint that accepts `?flight=QF441&date=2027-02-10` |
| `FLIGHT_LOOKUP_API_KEY` | Bearer token (`Authorization: Bearer …`) |
| `FLIGHT_LOOKUP_PROVIDER` | Optional override: `mock` (force fixtures) or `live` (require URL+key) |

Expected JSON (flat, or wrapped in `{ "schedule": … }` / `{ "data": … }`):

```json
{
  "airline": "Qantas",
  "from": "SYD",
  "to": "BHQ",
  "dep_time": "06:30",
  "arr_time": "08:15",
  "dep_terminal": "T3",
  "arr_terminal": null
}
```

Omit or leave blank any terminal you do not know. Values like `TBC` / `unknown` / `n/a` are treated as unknown.

If the key is present but the URL is missing (or the other way around), Lookup returns **provider not configured** — it will not guess a commercial host.

## Route

`POST /api/runs/:runId/flight-lookup` (owner / admin / production — same as Worksheet edit).

`:runId` may be the UUID or code (`R01`, `TRECV1`).

```json
{ "flight_number": "QF441", "date": "2027-02-10" }
```

The route **only returns a schedule**. It does not write `travel_blocks`, Advancing money, or locked Run Costings. The Worksheet card merges the result and saves through the existing W1 PATCH.

## Staging smoke (R01 / TRECV1)

1. Sign in as owner/admin. Open a **BOOKED** R01 or TRECV1 → **Worksheet**.
2. Add a Dep flight card. Flight # `QF441`, date `2027-02-10`. Lookup.
3. Expect Qantas, SYD→BHQ, 06:30 / 08:15, dep terminal T3, arr terminal blank, airport call **05:30** (R01 is G2). Mid/Ret cards use the same button.
4. Edit airport call — changing dep afterwards must not overwrite the manual time. Clear it to let auto fill again.
5. Lookup `QF999` / any date — soft error, fields stay blank.

Out of scope: paid API signup, checklist-side flight inputs, prod migrate/deploy, writing `cost_fields`.

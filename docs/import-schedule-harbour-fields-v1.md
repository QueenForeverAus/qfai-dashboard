# Import Schedule — Harbour-patchable fields v1

**Status: LOCKED 2026-09-10** (Gareth / Lead — HARD standing rule)  
**Repo:** QueenForeverAus/qfai-dashboard  
**Deploy:** staging + docs · **prod held for code**  
**Route:** `app/api/admin/import-schedule/route.ts`  
**Allowlist:** `lib/import-schedule-harbour-fields.ts`

This file is the canonical source of truth for what Harbour Import Schedule may write. Do not invent a wider write set.

Related later-work note: [`harbour-draft-autoload-later-v1.md`](./harbour-draft-autoload-later-v1.md). Date-move migrate is Builder-owned on prod and is out of scope here.

---

## Import Schedule today

Match by `show_date` only.

Harbour may **PATCH** `shows`:

| Column | Rule |
| --- | --- |
| `venue_name` | TBC or soft match only (`sameVenue`) |
| `capacity` | When the sheet has a capacity |
| `state_territory` | When the sheet has a state |
| `ticket_price` | Nett adult from the Harbour SCHEDULE deal block |

Harbour may **PATCH** `runs.status` to `proposed` or `confirmed` (all Harbour statuses on the run `CONFIRMED` → `confirmed`; otherwise `proposed`). Confirming a run may capture the booked cost freeze snapshot (existing side effect).

Allowed **side effects** after those patches:

- run `region` reclassify from post-patch show locations
- venue `cost_fields` **bucket** reclassify (move mis-filed staff / marketing / Venue Production/AV lines — does **not** create rows or write cost **values**)

Harbour Import Schedule does **not** write:

- Michael notes (`michael_notes`, `travel_access_notes`, and the other worksheet note columns)
- advancing (`advancement_items` and Advancing workspace data)
- worksheets
- cost **values**
- `travel_blocks`
- settlements

**PUT** applies confirmed preview `updates` + `run_status_changes` only. It does **not** create `new_in_sheet` rows and does **not** delete `removed_from_sheet` rows.

A date that exists only in the sheet (or only in the DB) is previewed for manual review. That is not an automatic insert or retire.

---

## HARD standing rule (Gareth 2026-09-10)

Across import — **new shows**, **same-date**, **or date moves** — preserve all team-entered Portal data.

- Harbour must not overwrite or wipe QF-entered fields.
- For date moves: prefer **UPDATE the same `shows.id`** (change `show_date` + Harbour-sourced venue fields only) so FKs keep `cost_fields` / advancing / worksheets / notes.
- Never wipe QF fields.
- Soft-retire orphans only with **explicit GO**.

Today's match-by-`show_date` path does not implement date-move UPDATE. Until that migrate lands, a moved date appears as `new_in_sheet` + `removed_from_sheet` and PUT leaves both untouched. Do not "fix" that by inserting a new show and deleting the old one — that would drop FKs.

`show_date` is reserved for the same-id date-move UPDATE. It is **not** in today's apply allowlist (`HARBOUR_PATCHABLE_SHOW_KEYS`).

---

## Apply allowlist (code lock)

PUT must call `pickHarbourShowPatch` so a crafted body cannot write notes, outlook, city, bands, or any other `shows` column.

Run apply writes `status` only (plus the region / booked-freeze side effects above).

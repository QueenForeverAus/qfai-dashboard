# Tours grouping + Admin Settings v1

**Status: LOCKED 2026-09-10** (Gareth)  
**Repo:** QueenForeverAus/qfai-dashboard  
**Deploy:** staging GO (`qfai-staging`) · **prod held**

This file is the canonical source of truth for tour seasons and Admin Settings. Do not invent a different grouping model. Calendar publish is **out of scope**.

---

## Product story

Run Costings (`/runs`) and Advancing Shows (`/advancing`) group and filter runs by **Tour seasons**. Assignment is computed from active show dates against Admin Settings date ranges. There is **no** `tour_id` on `shows` or `runs`.

Settlements is unchanged — no tour tabs.

---

## Schema (additive)

`public.tours`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `name` | text not null | Unique |
| `date_from` | date | Nullable |
| `date_to` | date | Nullable |
| `sort_order` | int not null default 0 | Tie-break first |
| `created_at` / `updated_at` | timestamptz | Defaults `now()` |

Check: `date_to >= date_from` **only when both dates are set**. Either side may be null.

**RLS**

- `SELECT` — `authenticated`
- `INSERT` / `UPDATE` / `DELETE` — `get_my_role()` in `('admin','owner')` (same as other admin tables; `get_my_role()` reads `profiles.role`)

Preserve team data. Additive migration only.

---

## Date ranges are Settings SoT

Tour date bounds live **only** in the `tours` table, edited in Admin Settings.

- App logic, helpers, and UI **must not** hardcode year bounds (including 2026 / 2027).
- Seed rows may include initial dates. Those are starting values, not constants the Portal re-applies.
- Re-running the migration is idempotent on `name` (`ON CONFLICT DO NOTHING`) so Settings edits are not overwritten.

---

## Seed (staging)

| Name | date_from | date_to | sort_order |
|---|---|---|---|
| Greatest Hits Tour — 20th Anniversary (2026 Tour) | 2026-01-01 | 2026-12-31 | 10 |
| Greatest Hits Tour — Don't Stop Us Now (2027 Tour) | 2027-01-01 | 2027-12-31 | 20 |

Gareth can change these in Settings after apply.

---

## Complete vs incomplete Tours

A Tour is **complete** only when **both** `date_from` and `date_to` are set.

- Tabs and ALL SHOWS headings include **complete** Tours only.
- Incomplete Tours appear in Admin Settings only (until both dates are filled).
- A run with no matching complete Tour is **Unassigned**.

---

## Assignment / bucketing

Used by `/runs` and `/advancing` only.

1. Partition cancelled / rescheduled first (`harbour_status = RETIRED` or `venue_name` starting `RETIRED`). Main-list assignment uses **active** (non-retired) shows only.
2. A run belongs to a Tour when **any active show date** falls in that Tour’s `[date_from, date_to]` (inclusive).
3. **Each show** is assigned to **at most one** Tour: the first complete Tour whose range contains `show_date`, ordered by `sort_order`, then `date_from`, then `name`.
4. **Overlap:** Settings shows a warning. Bucketing does **not** fail — first-match still applies.
5. **Multi-tour span:** if a run’s active shows match different Tours, the run appears under **each** matching Tour heading (honest). The same show is never counted in two Tours.
6. Show dates with no complete-Tour match → that show does not assign the run. If **no** active show matches, the run is Unassigned.

---

## UI

### `/runs` and `/advancing`

Top tabs: **ALL SHOWS** | each complete Tour name (Settings order).

- **ALL SHOWS** groups the current status-tab list under Tour headings; **Unassigned** last when any run has no match.
- A Tour tab filters to runs that have at least one active show assigned to that Tour.
- Existing status tabs (ALL / PROPOSED / BOOKED / …) still filter inside the selected Tour tab.
- **Cancelled / rescheduled** stays a bottom section. A Tour tab also filters that section by the same assignment (using the retired show dates on that copy).
- If no complete Tours exist yet, hide the Tour tab bar and keep the flat list (no Unassigned heading).

### Admin Settings

- `/settings` remains **Profile** for every signed-in role (including crew). `/profile` still aliases there.
- Admin/Owner get a nav item **Settings** → `/admin-settings`.
- Tours CRUD: name, date from, date to, sort order. Incomplete rows allowed.
- Overlapping complete ranges: amber warning listing the pair(s). Save is still allowed.

### Parked (do not build in this release)

- BOOKED Costing lock Settings toggle (existing freeze stays hardcoded ON)
- Lighting hire $330 Settings field
- Advancing SLA weeks
- Owner split 40/30/30
- Harbour commission %
- Settlements tour tabs
- Calendar publish
- Prod apply

---

## APIs

| Method | Path | Who |
|---|---|---|
| `GET` | `/api/tours` | Authenticated (all roles that can open the Portal) |
| `POST` | `/api/tours` | Admin / Owner |
| `PATCH` | `/api/tours/[id]` | Admin / Owner |
| `DELETE` | `/api/tours/[id]` | Admin / Owner |

Same session + `profiles.role` check as other admin routes (`lib/admin-access.ts` / `isAdminOrOwner`).

---

## Role access

Use existing `profiles.role` + `lib/role-access.ts`.

- `canAccessAdminSettings(role)` — `admin` or `owner` only.
- `/settings` and `/profile` stay on every role.
- View-as continues to hide Settings when the effective role is not admin/owner.

---

## Staging apply

Project: `nlenbzhwnyigsihcphoz` (`qfai-staging`).  
Migration: `supabase/migrations/20260910_tours.sql`.

If MCP/CLI apply is unavailable, Builder can run that file in the staging SQL editor. Do not apply on prod.

# Advancing ↔ Settlements two-way sync (v1)

Staging-first. Never invent amounts. Additive only — no wipe of existing Advancing / Settlements data.

## Expected (Col 2) = live Advancing read

For a BOOKED run with an **active** Run Advancing workspace, Settlements Col2 binds to `advancing_cost_fields` (+ Advancing shows chrome). It is not a frozen Costing snapshot.

**Fallback:** if there is no active workspace (not BOOKED, archived, or BOOKED-but-copy-failed), Col2 reads locked `cost_fields`. Figures are not invented. Documented in `resolveSettlementExpectedLive`.

Shared cost lines (`show:venue_hire`, `run:flights`, …) use the same `advancing_cost_fields` store as Run Advancing. Settlements never writes `cost_fields`.

## Actual known / PAID → Advancing write-back

When Scott marks a Settlements Actual **known** (Confirm) or **PAID**:

- Write the Actual amount onto the matching `advancing_cost_fields` row.
- State becomes `known`.
- PAID also sets entry `confirmed` + `paid` flags.
- **Actual wins Actual.** Advancing estimates never overwrite Col3.
- Expected stays the live Advancing read, so after write-back Col2 matches the Actual.

**One PAID truth:** if Advancing is already all-PAID, write-back syncs the Actual amount onto the same entry. It does not create a second PAID. Un-pay on Settlements does not un-pay Advancing.

**Skipped (not invented):** no workspace; no matching advancing field; child keys (`show:venue_marketing::edm`); Due to Hirer; AUTO CALC social ads.

## Tickets lock (SOP ticket-from-sheet)

Advancing sell-through locks when:

1. the show has completed, **and**
2. actual `tickets_sold` is known from the settlement sheet (`manual`) or `email_scrape`.

A **source note is required** on that write. Lock is inferred from `settlement_actual_lines` (`line_key = tickets_sold`), not from a bare `shows.tickets_sold` guess.

Locked Advancing P&L uses the actual ticket count, not the sell-through slider.

## Source notes

Required and visible on:

- Settlements Actual Confirm / Save / Mark PAID
- Settlements tickets-sold save
- Settlement email-scrape apply (auto-formatted from the packet: from / date / filename)

## Roles (do not invent)

- Michael + Gareth: Advancing
- Scott: Settlements finalise (Actual known / PAID)
- Nigel: scrapes

## Existing locks kept

- Per-venue §1
- §3 Advancing Costs once per run
- One PAID truth (no double PAID Advancing + Settlements)

## Out of scope

Wave 2 Payables; §3 payment-method chrome; owner split Admin Settings; prod promote; inventing Due to Hirer.

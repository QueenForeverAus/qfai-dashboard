# Settlements v3 — Due to Hirer / Remittance / Margin / Owners

**Status: LOCKED 2026-09-10** (Gareth / Lead)  
**Repo:** QueenForeverAus/qfai-dashboard  
**Deploy:** staging GO · **prod held**

This file is the canonical source of truth for Settlements v3. Do not invent a different layout. Screen shape below is binding for UX intent.

### Multi-show HARD lock (Gareth 2026-09-10)

One settlement **route** per run (`/settlements/26r01`). Venue tabs live **inside** that page. Do not go back to `/settlements/{run}/{showId}` as a second sheet.

| Section | Grain | UI |
| --- | --- | --- |
| **§1 Due to Hirer** | **Per venue** | Tab per venue. Full line list repeated. **Separate Due to Hirer total per venue** — never one combined total. |
| **§2 Remittance** | **Per venue** | Same venue tabs. Harbour remits each venue settlement. |
| **§3 Advancing Costs** | **Once per run** | Below the venue tabs as a single block. Run-level band costs. No ± twins. |
| **§4 Owners** | **Once per run** | After venue remittances. Gareth 40 / Brad 30 / Scott 30 of the run margin. |

26R01 (Gosford+Richmond) and 26R02 (Auckland+Hamilton) are smoke only — the model is systemic for every multi-show run.

Foundations already on main (keep):

- Venue Production/AV and Production Bought In labels — SHA `81993b7a`
- GST quarantine before ex-GST 20% reserve — SHA `995fdadc`

Completed-only Settlements list stays. Wave-1 Agent Settlement and Remittance remain secondary routes.

---

## Product story

Four distinct sections, in this order, on the Settlements front door.

### §1 Settlement (Due to Hirer)

Venue proposes to pay the Hirer. **NO Harbour 10%.**

Formula:

```
+ ticket sales
− insides
− hire
− staff
− marketing
− Venue Production/AV
− other
+ hire deposit   (avoid deposit double-count per Finance GREEN)
= Due to Hirer
```

### §2 Remittance (Due to QF)

```
agreed Due to Hirer
− Harbour 10% of (ticket sales − classic insides)
− rare deductibles
= Due to QF (remittance)
```

Harbour 10% is **not** taken in §1. LPA / EIS / APRA are **not** classic insides.

### §3 Pre-Distribution Margin

```
remittance
− band costs          (QF payables / crew / travel / Production Bought In — not §1 venue lines)
− GST quarantine      (stored / known only; not QF money)
− 20% reserve         (ex-GST; no invented GST rates)
= Pre-Distribution Margin
```

### §4 Owner Distribution

Gareth 40 / Brad 30 / Scott 30 of Pre-Distribution Margin + the existing distribute gate (operator confirm-tick / section Confirmed / PAID — figure-accuracy `known` is not enough).

---

## Screen shape (binding)

```
┌─────────────────────────────────────────────────────────────────┐
│  Run chrome · email-scrape ingest                               │
├─────────────────────────────────────────────────────────────────┤
│  NIGEL ASSESSMENT (paragraph)                                   │
│  PROMINENT RED FLAGS                                            │
│  ASSESSMENT CHAT (Gareth comments — Portal store, not Lead)     │
│  [Draft Harbour accept/challenge]  [Draft Michael fact-check]   │
│  preview only — never auto-send                                 │
├─────────────────────────────────────────────────────────────────┤
│  Venue tabs (multi-show): [Gosford Due $X] [Richmond Due $Y]    │
│  tickets sold (this venue)                                      │
│  §1 Settlement — Due to Hirer   (this venue’s full lines)       │
│  §2 Remittance — Due to QF      (this venue)                    │
├─────────────────────────────────────────────────────────────────┤
│  §3 Advancing Costs / Pre-Distribution Margin   (once per run)  │
│  §4 Owner Distribution                          (once per run)  │
└─────────────────────────────────────────────────────────────────┘
```

Each section is a **distinct card**. Rows are **rolled up**:

| Line | Expected | Actual | Δ |
| --- | ---: | ---: | ---: |
| ▶ constituent bucket | Advancing | statement / confirmed | Actual − Expected |

▶ expands to constituent lines. Data model may keep expected/actual under those roll-ups.

Per-line Challenge is **optional secondary only**. Primary Harbour / Michael path is the assessment-thread draft.

No revenue sliders. Pre-show stays a hard block (stakeholders stay on Advancing).

---

## Finance GREEN defaults

- **Inside:** PDF ticket block = known when present; Factors only estimated when omitted. Never invent known insides.
- **Deposit:** if the PDF already nets deposit into Due to Hirer, do not also `+ deposit`.
- **§2 Harbour 10%:** on sales − classic insides (booking / CC / named ticketing). Not LPA / EIS / APRA.
- **§3 band costs:** QF payables / crew / travel / Production Bought In — not §1 venue hire/staff/marketing/AV/other.
- **GST:** stored / known amount only. Missing GST quarantines `$0` with an honest residual that may still include GST. No NZ 15%, AU 10%, or 1/11 invented.

---

## Phases (all in this effort — staging)

| Phase | What |
| --- | --- |
| **P1** | Settlements page shell: replace primary 3-col UX with 4 distinct sections + roll-up rows + expand. |
| **P2** | PDF/line classifier → venue buckets (Hire / Staff / Marketing / Venue Production/AV / other). Expected from Advancing. Insides known from PDF else Factors estimated. Deposit no double-count. |
| **P3** | Assessment panel + red-flag schema + Portal assessment chat store (not Lead mirror). |
| **P4** | Draft Harbour accept/challenge and/or Michael fact-check from the assessment thread. Preview; Comms + safety gate patterns already in-repo. Never auto-send. |
| **P5** | Wire remittance / margin / owners end-to-end. Unit tests. Smoke notes for BNZ-shaped sample + SAMP01 accurate + SAMP08 wrong. |

---

## Out of scope

- Prod deploy
- Wave 2 Payables / bank feed
- Changing Harbour 10% in Run Costing owners chrome formula beyond Settlements v3
- Auto-send email
- Inventing GST rates or cost figures

---

## Done means

PR(s) with clear phase coverage; unit tests for bucket maths + Harbour commission + margin order; smoke checklist for BNZ-shaped + SAMP01/accurate+wrong. Honest residuals.

---

## Implementation map (this repo)

| Concern | Module |
| --- | --- |
| §1–§4 maths + roll-ups | `lib/settlements-v3.ts` |
| PDF / statement classifier + deposit netting | `lib/settlements-v3-buckets.ts` |
| Red flags + Nigel paragraph | `lib/settlements-v3-flags.ts` |
| Assessment chat + Harbour/Michael drafts | `lib/settlements-v3-assessment.ts` |
| BNZ-shaped invented fixture (unit/classifier only) | `lib/settlements-v3-bnz.ts` |
| Email scrape packet + apply | `lib/settlement-scrape/` + `app/api/settlements/[runId]/email-scrape/apply` |
| Front door UI | `app/settlements/SettlementV3Client.tsx` |
| Portal chat store (staging) | `supabase/migrations/20260910_settlement_assessment_chat.sql` |
| Smoke notes | `fixtures/settlements-sample-shows/README.md` |

---

## UNPARK 2026-09-10 (Gareth / Lead — staging)

- **Email scrape:** settlement and remittance attachments ingest via `settlement-scrape-packet-v1` (same Comms POST / machine-auth pattern as travel-scrape). No manual paste. **Removed** Load Harbour fixture and Load BNZ-shaped venue statement (UI + fixture POST → 410).
- **§3:** Settlements label is **Advancing Costs**. Expected | Actual | Δ chrome is dropped on §3 only. Figures are the live Advancing mix (PAID / confirmed / AUTO CALC).
- **PAID transfer:** lines PAID on Run Advancing appear on Settlements as locked + marked PAID (SAMP04 flights / accommodation / Production Bought In).
- **Michael fact-check:** draft email **from Nigel (tours@) to Michael**. Venue Staff, Venue Production/AV, other venue production charges, Backline Hire only. Preview; never auto-send.

Prod remains held.

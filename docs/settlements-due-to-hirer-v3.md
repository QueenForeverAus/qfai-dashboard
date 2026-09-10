# Settlements v3 — Due to Hirer / Remittance / Margin / Owners

**Status: LOCKED 2026-09-10** (Gareth / Lead)  
**Repo:** QueenForeverAus/qfai-dashboard  
**Deploy:** staging GO · **prod held**

This file is the canonical source of truth for Settlements v3. Do not invent a different layout. Screen shape below is binding for UX intent.

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
│  Run chrome · tickets sold (actual count) · fixture ingest      │
├─────────────────────────────────────────────────────────────────┤
│  NIGEL ASSESSMENT (paragraph)                                   │
│  PROMINENT RED FLAGS                                            │
│  ASSESSMENT CHAT (Gareth comments — Portal store, not Lead)     │
│  [Draft Harbour accept/challenge]  [Draft Michael fact-check]   │
│  preview only — never auto-send                                 │
├─────────────────────────────────────────────────────────────────┤
│  §1 Settlement — Due to Hirer          (own card)               │
│  §2 Remittance — Due to QF             (own card)               │
│  §3 Pre-Distribution Margin            (own card)               │
│  §4 Owner Distribution                 (own card)               │
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
| BNZ-shaped invented fixture | `lib/settlements-v3-bnz.ts` |
| Front door UI | `app/settlements/SettlementV3Client.tsx` |
| Portal chat store (staging) | `supabase/migrations/20260910_settlement_assessment_chat.sql` |
| Smoke notes | `fixtures/settlements-sample-shows/README.md` |

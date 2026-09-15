/**
 * Portal canon certainty ladder (Wave A).
 *
 * Display / labels, worst → best:
 *   FIGURES_NEEDED → GUESS → ESTIMATE → CONFIRMED → INVOICED → PAID
 *
 * DB figure-source states stay additive aliases of this ladder:
 *   figures_needed | pending  → FIGURES_NEEDED
 *   guess                     → GUESS
 *   estimated                 → ESTIMATE
 *   known | confirmed         → CONFIRMED
 *   invoiced                  → INVOICED
 *   auto_calc                 → AUTO CALC (computed chrome, not a ladder rung)
 *
 * PAID is entries[].paid / paid_at chrome — never a cost_fields.state string.
 * Confirmed ≠ Paid. ESTIMATE may exist without Gareth/Michael eyes.
 */

import {
  CONFIRMED_FIELD_STATE,
  INVOICED_FIELD_STATE,
  type CostFieldState,
} from './cost-fields.ts'

export const LADDER_FIGURES_NEEDED = 'FIGURES_NEEDED' as const
export const LADDER_GUESS = 'GUESS' as const
export const LADDER_ESTIMATE = 'ESTIMATE' as const
export const LADDER_CONFIRMED = 'CONFIRMED' as const
export const LADDER_INVOICED = 'INVOICED' as const
export const LADDER_PAID = 'PAID' as const
export const LADDER_AUTO_CALC = 'AUTO CALC' as const

export type CertaintyLadderRung =
  | typeof LADDER_FIGURES_NEEDED
  | typeof LADDER_GUESS
  | typeof LADDER_ESTIMATE
  | typeof LADDER_CONFIRMED
  | typeof LADDER_INVOICED
  | typeof LADDER_PAID
  | typeof LADDER_AUTO_CALC

/** Worst → best (PAID is chrome, listed last). AUTO CALC is not a rung. */
export const CERTAINTY_LADDER_DISPLAY_ORDER: CertaintyLadderRung[] = [
  LADDER_FIGURES_NEEDED,
  LADDER_GUESS,
  LADDER_ESTIMATE,
  LADDER_CONFIRMED,
  LADDER_INVOICED,
  LADDER_PAID,
]

/** Stored figure-source aliases that mean FIGURES_NEEDED. */
export const FIGURES_NEEDED_DB_STATES = ['figures_needed', 'pending'] as const

/** Stored figure-source aliases that mean CONFIRMED. */
export const CONFIRMED_DB_STATES = ['known', 'confirmed'] as const

export const ESTIMATE_DB_STATES = ['estimated'] as const

const LADDER_RANK: Record<CertaintyLadderRung, number> = {
  [LADDER_FIGURES_NEEDED]: 0,
  [LADDER_GUESS]: 1,
  [LADDER_ESTIMATE]: 2,
  [LADDER_CONFIRMED]: 3,
  [LADDER_INVOICED]: 4,
  [LADDER_PAID]: 5,
  [LADDER_AUTO_CALC]: 2,
}

/**
 * Canonical stored state for a write. `confirmed` → `known`.
 * `figures_needed` stays `figures_needed` (additive alias of pending).
 * `paid` is rejected — PAID is entry chrome.
 */
export function normalizeStoredCostFieldState(
  raw: string | null | undefined,
): CostFieldState | null {
  const key = String(raw ?? '').trim().toLowerCase()
  if (!key) return null
  if (key === 'paid' || key === 'bulk_paid') return null
  if (key === 'confirmed' || key === 'known') return CONFIRMED_FIELD_STATE
  if (key === 'invoiced') return INVOICED_FIELD_STATE
  if (key === 'figures_needed') return 'figures_needed'
  if (key === 'pending') return 'pending'
  if (key === 'guess') return 'guess'
  if (key === 'estimated' || key === 'estimate') return 'estimated'
  if (key === 'auto_calc') return 'auto_calc'
  return null
}

export function ladderRungFromStoredState(
  raw: string | null | undefined,
): CertaintyLadderRung {
  const key = String(raw ?? '').trim().toLowerCase()
  if (key === 'invoiced') return LADDER_INVOICED
  if ((CONFIRMED_DB_STATES as readonly string[]).includes(key)) return LADDER_CONFIRMED
  if ((ESTIMATE_DB_STATES as readonly string[]).includes(key) || key === 'estimate') {
    return LADDER_ESTIMATE
  }
  if (key === 'guess') return LADDER_GUESS
  if (key === 'auto_calc') return LADDER_AUTO_CALC
  if ((FIGURES_NEEDED_DB_STATES as readonly string[]).includes(key)) {
    return LADDER_FIGURES_NEEDED
  }
  return LADDER_FIGURES_NEEDED
}

export function ladderLabelFromStoredState(
  raw: string | null | undefined,
): string {
  return ladderRungFromStoredState(raw)
}

export function ladderRank(rung: CertaintyLadderRung): number {
  return LADDER_RANK[rung]
}

/**
 * Section chrome: PAID overlay is entry flags, not a stored state.
 * All-paid lines still keep CONFIRMED/INVOICED figure-source distinct.
 */
export function ladderRungForSection(opts: {
  storedState: string | null | undefined
  allPaid?: boolean
  somePaid?: boolean
}): CertaintyLadderRung {
  const figure = ladderRungFromStoredState(opts.storedState)
  if (figure === LADDER_INVOICED) return LADDER_INVOICED
  if (opts.allPaid) return LADDER_PAID
  return figure
}

export function isFiguresNeededStoredState(raw: string | null | undefined): boolean {
  return ladderRungFromStoredState(raw) === LADDER_FIGURES_NEEDED
}

export function isConfirmedStoredState(raw: string | null | undefined): boolean {
  return (CONFIRMED_DB_STATES as readonly string[]).includes(
    String(raw ?? '').trim().toLowerCase(),
  )
}

/** ESTIMATE is a valid figure-source without Gareth/Michael attestation. */
export function estimateAllowedWithoutOwnerEyes(): boolean {
  return true
}

export const CERTAINTY_LADDER_LEGEND: ReadonlyArray<{
  rung: CertaintyLadderRung
  stored: string
  desc: string
}> = [
  {
    rung: LADDER_FIGURES_NEEDED,
    stored: 'pending',
    desc: 'FIGURES NEEDED — no usable figure yet (pending / figures_needed).',
  },
  {
    rung: LADDER_GUESS,
    stored: 'guess',
    desc: 'GUESS — external data still needed before go/no-go.',
  },
  {
    rung: LADDER_ESTIMATE,
    stored: 'estimated',
    desc: 'ESTIMATE — rough figure; may exist without Gareth/Michael eyes.',
  },
  {
    rung: LADDER_CONFIRMED,
    stored: 'known',
    desc: 'CONFIRMED — figure accuracy / lines attested. Not payment.',
  },
  {
    rung: LADDER_INVOICED,
    stored: 'invoiced',
    desc: 'INVOICED — invoice received on the line. Not PAID.',
  },
  {
    rung: LADDER_PAID,
    stored: 'entries[].paid',
    desc: 'PAID — receipt chrome on entries / roles. Confirmed ≠ Paid.',
  },
]

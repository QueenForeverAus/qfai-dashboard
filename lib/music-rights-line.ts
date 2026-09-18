/**
 * Wave B2 — show-local Music Rights line %.
 *
 * Factors `music_rights_pct` is the standing default for unbooked seed/refresh
 * only. The operator % lives on the Costings / Advancing cost field (`line_pct`)
 * and must never write back to Factors. Never invent AU OneMusic %. Never copy
 * retired `apra_pct`.
 */

import { isRetiredFactorKey } from './retired-factors.ts'
import {
  computeMusicRights,
  MUSIC_RIGHTS_FACTOR_KEY,
  parseOptionalFactor,
  type AutoCalcShow,
} from './show-auto-calc.ts'

export const MUSIC_RIGHTS_LINE_PCT_COLUMN = 'line_pct' as const

export const MUSIC_RIGHTS_LINE_SOURCE =
  'AUTO-CALC · show-local Music Rights % × tickets × ticket_price (modelled gross admission). Factors music_rights_pct seeds unbooked lines only. Line % does not write back to Factors. AU % is never invented; retired apra_pct is never copied.'

export const MUSIC_RIGHTS_FACTORS_WRITEBACK_KEYS = [
  MUSIC_RIGHTS_FACTOR_KEY,
  'apra_pct',
  'run_factors',
] as const

/** Parse a stored / drafted line %. Empty / invalid → null. 0 is a real %. */
export function parseMusicRightsLinePct(raw: unknown): number | null {
  const n = parseOptionalFactor(raw)
  if (n == null) return null
  return n
}

/**
 * Standing Factors % for seed/refresh. Reads `music_rights_pct` only.
 * Ignores retired `apra_pct` even if a caller stuffed it on the map.
 */
export function seedMusicRightsLinePctFromFactors(
  factors: Record<string, unknown> | null | undefined,
): number | null {
  if (!factors) return null
  const fromRights = parseMusicRightsLinePct(factors[MUSIC_RIGHTS_FACTOR_KEY])
  if (fromRights != null) return fromRights
  // Explicit guard — never fall through to retired APRA Royalty Rate.
  if (isRetiredFactorKey('apra_pct') && factors.apra_pct != null && factors.apra_pct !== '') {
    return null
  }
  return null
}

/**
 * Factors refresh: keep the operator line % when set; seed from Factors only
 * when the line % is still empty. Never invent. Never copy apra_pct.
 */
export function refreshMusicRightsLinePct(opts: {
  existingLinePct?: unknown
  factors?: Record<string, unknown> | null
}): number | null {
  const existing = parseMusicRightsLinePct(opts.existingLinePct)
  if (existing != null) return existing
  return seedMusicRightsLinePctFromFactors(opts.factors)
}

export function computeMusicRightsFromLinePct(opts: {
  show: AutoCalcShow
  linePct: unknown
  sellThroughPct?: number | null
}): ReturnType<typeof computeMusicRights> {
  return computeMusicRights({
    show: opts.show,
    musicRightsPct: parseMusicRightsLinePct(opts.linePct),
    sellThroughPct: opts.sellThroughPct,
  })
}

export type MusicRightsLinePatch = {
  line_pct: number | null
  value: number | null
  state: 'auto_calc' | 'pending'
  source: string
}

/**
 * Cost-field patch for a line-% edit. Contains no Factors keys.
 * Callers persist this on cost_fields / advancing_cost_fields only.
 */
export function musicRightsLineEditPatch(opts: {
  show: AutoCalcShow
  linePct: unknown
  sellThroughPct?: number | null
}): MusicRightsLinePatch {
  const linePct = parseMusicRightsLinePct(opts.linePct)
  const calc = computeMusicRights({
    show: opts.show,
    musicRightsPct: linePct,
    sellThroughPct: opts.sellThroughPct,
  })
  return {
    line_pct: linePct,
    value: calc.amount,
    state: calc.state,
    source: MUSIC_RIGHTS_LINE_SOURCE,
  }
}

export function musicRightsSeedLine(opts: {
  show: AutoCalcShow
  factors?: Record<string, unknown> | null
  sellThroughPct?: number | null
}): MusicRightsLinePatch {
  return musicRightsLineEditPatch({
    show: opts.show,
    linePct: seedMusicRightsLinePctFromFactors(opts.factors),
    sellThroughPct: opts.sellThroughPct,
  })
}

export function musicRightsRefreshLine(opts: {
  show: AutoCalcShow
  existingLinePct?: unknown
  factors?: Record<string, unknown> | null
  sellThroughPct?: number | null
}): MusicRightsLinePatch {
  return musicRightsLineEditPatch({
    show: opts.show,
    linePct: refreshMusicRightsLinePct({
      existingLinePct: opts.existingLinePct,
      factors: opts.factors,
    }),
    sellThroughPct: opts.sellThroughPct,
  })
}

/** True when the patch would never write Factors / retired APRA. */
export function musicRightsLinePatchWritesFactors(patch: Record<string, unknown>): boolean {
  return MUSIC_RIGHTS_FACTORS_WRITEBACK_KEYS.some(key => Object.prototype.hasOwnProperty.call(patch, key))
}

/**
 * BOOKED Advancing may set/edit line % even when Factors is empty.
 * Costings follows the existing booked freeze (Advancing stays editable).
 */
export function canEditMusicRightsLinePct(opts: {
  sheet: 'costings' | 'advancing'
  costSheetFrozen?: boolean
  factorsPct?: unknown
}): boolean {
  if (opts.sheet === 'advancing') return true
  return opts.costSheetFrozen !== true
}

export function parseLinePctFromBody(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined
  if (raw === null || raw === '') return null
  return parseMusicRightsLinePct(raw)
}

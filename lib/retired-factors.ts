/**
 * Wave A2.1 — Factors keys retired from UI + Costings/Advancing seed.
 *
 * Historical `run_factors` rows are kept (soft-hide). Inside fee rates now
 * come from contract / Harbour Draft / operator lines, not standing Factors.
 * Music Rights (`music_rights_pct`) stays — APRA Royalty Rate is the duplicate.
 */

export const RETIRED_FACTOR_KEYS = [
  'apra_pct',
  'cc_fee_pct',
  'booking_fee_per_payer',
  'comp_ticket_fee_per_payer',
  'inside_cc_fee_pct',
  'ticketing_inside_pct',
] as const

export type RetiredFactorKey = (typeof RETIRED_FACTOR_KEYS)[number]

const RETIRED_SET = new Set<string>(RETIRED_FACTOR_KEYS)

export function isRetiredFactorKey(key: string | null | undefined): boolean {
  return RETIRED_SET.has(String(key ?? ''))
}

export function filterVisibleFactors<T extends { key: string }>(factors: T[] | null | undefined): T[] {
  return (factors ?? []).filter(f => !isRetiredFactorKey(f.key))
}

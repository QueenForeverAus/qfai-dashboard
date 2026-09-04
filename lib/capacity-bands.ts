/**
 * Capacity bands — P&L calculator sell-slider modelling.
 * shows.capacity = physical max / top band.
 * shows.capacity_bands = ordered Harbour options (additive JSONB).
 * cost_fields.venue_staff stays BASE / currently on-sale staff — never overwrite from max band.
 */

export type CapacityBand = {
  /** Seat count for this band (required). */
  seats: number
  /** Optional Harbour label, e.g. "Stalls", "Dress circle open", "Full house". */
  label?: string | null
  /** Harbour senior ushers $ for this band (optional). */
  ushers_cost?: number | null
  /** Harbour senior security $ for this band (optional). */
  security_cost?: number | null
  /** Optional headcount when quoting by rate×hrs×HC rather than lump $. */
  ushers_headcount?: number | null
  security_headcount?: number | null
}

/** Roles whose $ may step with modelled tickets when crossing a band. */
export const BAND_SCALABLE_ROLE_HINTS = ['usher', 'ushers', 'security', 'crowd control', 'crowd controller'] as const

/** Roles that must NOT auto-step with capacity bands. */
export const BAND_FIXED_ROLE_HINTS = [
  'foh manager',
  'foh duty manager',
  'front of house manager',
  'stage door',
  'technician',
  'technical',
  'tech labour',
  'technical labour',
  'fixed tech',
] as const

/** Distinct track colours for band segments (obvious colour coding). */
export const BAND_TRACK_COLOURS = [
  '#34d399', // emerald
  '#fbbf24', // amber
  '#60a5fa', // blue
  '#c084fc', // purple
  '#fb923c', // orange
  '#f472b6', // pink
] as const

export function isBandScalableRole(role: string): boolean {
  const r = role.trim().toLowerCase()
  return BAND_SCALABLE_ROLE_HINTS.some(h => r === h || r.includes(h))
}

export function isBandFixedRole(role: string): boolean {
  const r = role.trim().toLowerCase()
  return BAND_FIXED_ROLE_HINTS.some(h => r === h || r.includes(h))
}

/** Normalize/validate raw JSON from DB; drop invalid rows; sort ascending by seats. */
export function normalizeCapacityBands(raw: unknown): CapacityBand[] {
  if (!Array.isArray(raw)) return []
  const out: CapacityBand[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const seats = Number(r.seats)
    if (!Number.isFinite(seats) || seats <= 0) continue
    out.push({
      seats: Math.round(seats),
      label: r.label == null || r.label === '' ? null : String(r.label),
      ushers_cost: numOrNull(r.ushers_cost),
      security_cost: numOrNull(r.security_cost),
      ushers_headcount: numOrNull(r.ushers_headcount),
      security_headcount: numOrNull(r.security_headcount),
    })
  }
  out.sort((a, b) => a.seats - b.seats)
  return out
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Top / physical max from bands, or fallback capacity. */
export function topBandSeats(bands: CapacityBand[], fallbackCapacity: number | null | undefined): number | null {
  if (bands.length > 0) return bands[bands.length - 1]!.seats
  if (fallbackCapacity != null && Number.isFinite(fallbackCapacity) && fallbackCapacity > 0) {
    return Math.round(fallbackCapacity)
  }
  return null
}

/** Base band = lowest seats (currently on-sale / Draft known staff anchor). */
export function baseBand(bands: CapacityBand[]): CapacityBand | null {
  return bands[0] ?? null
}

/**
 * Active band for modelled ticket count: highest band whose seats >= tickets,
 * else the top band if tickets exceed all (sold-out modelling).
 * Empty bands → null (caller uses flat capacity / base venue_staff).
 */
export function activeBandForTickets(bands: CapacityBand[], tickets: number): CapacityBand | null {
  if (!bands.length) return null
  const t = Math.max(0, tickets)
  for (const b of bands) {
    if (t <= b.seats) return b
  }
  return bands[bands.length - 1]!
}

/**
 * Ushers+security $ for a band.
 * Senior Harbour values win when either ushers_cost or security_cost is set on that band.
 * Silent band → scale base ushers+security by band_cap/base_cap (estimated).
 * Returns null when no band modelling applies.
 */
export function bandUshersSecurityCost(
  bands: CapacityBand[],
  band: CapacityBand,
  opts?: {
    /** Sum of ushers+security from base venue_staff line_items (or known lumps). */
    baseUshersSecurity?: number | null
  },
): { amount: number; mode: 'harbour' | 'scaled' | 'zero' } | null {
  if (!bands.length) return null
  const hasSenior =
    band.ushers_cost != null || band.security_cost != null
  if (hasSenior) {
    const amount = (Number(band.ushers_cost) || 0) + (Number(band.security_cost) || 0)
    return { amount, mode: 'harbour' }
  }
  const base = baseBand(bands)
  if (!base || base.seats <= 0) return { amount: 0, mode: 'zero' }
  const baseAmt = opts?.baseUshersSecurity
  if (baseAmt == null || !Number.isFinite(baseAmt)) {
    return { amount: 0, mode: 'zero' }
  }
  const scaled = (Number(baseAmt) || 0) * (band.seats / base.seats)
  return { amount: Math.round(scaled * 100) / 100, mode: 'scaled' }
}

/**
 * Split base venue_staff into (ushers+security) vs fixed remainder using line_items roles.
 * Used so calculator can step only scalable lines when crossing bands.
 */
export function splitVenueStaffByRole(
  lineItems: Array<{ role: string; rate: number; hours: number; headcount: number }> | null | undefined,
  fallbackTotal: number | null | undefined,
): { scalable: number; fixed: number; usedRoles: boolean } {
  if (Array.isArray(lineItems) && lineItems.length > 0) {
    let scalable = 0
    let fixed = 0
    let sawScalable = false
    for (const item of lineItems) {
      const amt = (Number(item.rate) || 0) * (Number(item.hours) || 0) * (Number(item.headcount) || 0)
      if (isBandScalableRole(item.role) && !isBandFixedRole(item.role)) {
        scalable += amt
        sawScalable = true
      } else {
        fixed += amt
      }
    }
    // If no role matched ushers/security, treat entire planned total as fixed
    // (do not invent a split) — band step then only applies when Harbour band $ present.
    if (!sawScalable) return { scalable: 0, fixed: scalable + fixed, usedRoles: true }
    return { scalable, fixed, usedRoles: true }
  }
  const total = fallbackTotal != null && Number.isFinite(fallbackTotal) ? Number(fallbackTotal) : 0
  return { scalable: 0, fixed: total, usedRoles: false }
}

/**
 * Calculator-step venue staff $ for modelled tickets.
 * - No bands → baseTotal unchanged.
 * - With bands → fixed roles stay; ushers+security become band's Harbour $ or scaled estimate.
 * Never mutates saved venue_staff.
 */
export function modelledVenueStaffForTickets(args: {
  bands: CapacityBand[]
  tickets: number
  baseTotal: number | null | undefined
  lineItems?: Array<{ role: string; rate: number; hours: number; headcount: number }> | null
}): number {
  const baseTotal = args.baseTotal != null && Number.isFinite(args.baseTotal) ? Number(args.baseTotal) : 0
  const bands = args.bands
  if (!bands.length) return baseTotal

  const band = activeBandForTickets(bands, args.tickets)
  if (!band) return baseTotal

  const split = splitVenueStaffByRole(args.lineItems, baseTotal)
  const usSec = bandUshersSecurityCost(bands, band, { baseUshersSecurity: split.scalable })

  if (!usSec) return baseTotal
  // Harbour senior on band, or scaled scalable portion; fixed always retained.
  if (usSec.mode === 'harbour' || (usSec.mode === 'scaled' && split.scalable > 0)) {
    return Math.round((split.fixed + usSec.amount) * 100) / 100
  }
  // No scalable roles and no senior band $ → keep base total (do not invent)
  return baseTotal
}

/** Boundary markers for colour-banded slider (fraction of top capacity 0..1). */
export function bandBoundaryFractions(bands: CapacityBand[], topCap: number): Array<{ frac: number; seats: number; label: string | null }> {
  if (!bands.length || topCap <= 0) return []
  return bands.map(b => ({
    frac: Math.min(1, b.seats / topCap),
    seats: b.seats,
    label: b.label ?? null,
  }))
}

/** Colour for the active band index (0-based). */
export function bandColour(index: number): string {
  return BAND_TRACK_COLOURS[index % BAND_TRACK_COLOURS.length]!
}

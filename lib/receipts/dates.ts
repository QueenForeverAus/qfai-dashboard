/** Calendar-day helpers for receipt nights — Sydney date-only, no UTC off-by-one. */

export function isIsoDateOnly(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function addDaysIso(iso: string, days: number): string {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Inclusive check-in → exclusive check-out stay nights. */
export function stayNights(checkIn: string, checkOut: string): string[] {
  if (!isIsoDateOnly(checkIn) || !isIsoDateOnly(checkOut) || checkOut <= checkIn) return []
  const nights: string[] = []
  let cursor = checkIn
  while (cursor < checkOut) {
    nights.push(cursor)
    cursor = addDaysIso(cursor, 1)
    if (nights.length > 60) break
  }
  return nights
}

/** DD/MM/YY for the locked source pattern. */
export function formatDdMmYy(iso: string): string {
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return iso
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`
}

export function formatAud(amount: number): string {
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return amount < 0 ? `-$${formatted}` : `$${formatted}`
}

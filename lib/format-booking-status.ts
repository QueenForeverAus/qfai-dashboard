/**
 * User-facing labels for booking / harbour / run booking status.
 * DB values stay unchanged (e.g. `confirmed`); only display maps Confirmed → BOOKED
 * so it does not clash with cost-figure "Confirmed".
 */
export function formatBookingStatus(status: string | null | undefined): string {
  if (status == null || status === '') return ''
  const raw = String(status).trim()
  if (raw.toLowerCase() === 'confirmed') return 'BOOKED'
  // Preserve known display labels; otherwise title-case-ish uppercase with underscores → spaces
  const known: Record<string, string> = {
    placeholder: 'Harbour Placeholder',
    declined: 'Declined',
  }
  const lower = raw.toLowerCase()
  if (known[lower]) return known[lower]
  return raw.replace(/_/g, ' ').toUpperCase()
}

/** Alias for harbour_status / schedule import copy. */
export function formatHarbourStatus(status: string | null | undefined): string {
  return formatBookingStatus(status)
}

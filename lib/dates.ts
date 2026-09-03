/** Australia/Sydney calendar helpers — avoid UTC vs local off-by-one on date-only strings. */

const SYDNEY = 'Australia/Sydney'

/** Calendar "today" in Australia/Sydney as YYYY-MM-DD. */
export function todayAU(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: SYDNEY })
}

/**
 * Format a DB date (YYYY-MM-DD or ISO timestamp) as an en-AU calendar date.
 * Uses the date portion only so SSR (UTC) and clients (Sydney) always agree.
 */
export function formatDateAU(
  date: string | null | undefined,
  opts: { weekday?: 'short' | 'long'; year?: boolean } = {},
): string {
  if (!date) return '—'
  const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) {
    return new Date(date).toLocaleDateString('en-AU', {
      timeZone: SYDNEY,
      day: 'numeric',
      month: 'short',
      ...(opts.year !== false ? { year: 'numeric' as const } : {}),
      ...(opts.weekday ? { weekday: opts.weekday } : {}),
    })
  }
  // Anchor at UTC noon on the calendar day so locale formatting never rolls the day.
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  return d.toLocaleDateString('en-AU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    ...(opts.year !== false ? { year: 'numeric' as const } : {}),
    ...(opts.weekday ? { weekday: opts.weekday } : {}),
  })
}

/** Short show-row style: "Wed 11 Feb" (no year). */
export function formatDateShortAU(date: string | null | undefined): string {
  return formatDateAU(date, { weekday: 'short', year: false })
}

/** Timestamp → en-AU local string in Sydney. */
export function formatDateTimeAU(ts: string | null | undefined): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-AU', {
    timeZone: SYDNEY,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Locked source pattern: `Booking confirm <vendor> conf <id> DD/MM/YY`. */

import { formatDdMmYy } from './dates.ts'

export const BOOKING_CONFIRM_SOURCE_PREFIX = 'Booking confirm'

export function formatBookingConfirmSource(opts: {
  vendor: string
  confirmationId: string
  dateIso: string
}): string {
  const vendor = opts.vendor.trim() || 'vendor'
  const conf = opts.confirmationId.trim() || 'unknown'
  return `${BOOKING_CONFIRM_SOURCE_PREFIX} ${vendor} conf ${conf} ${formatDdMmYy(opts.dateIso)}`
}

export function formatHotelWorksheetLine(opts: {
  vendor: string
  confirmationId: string
  locality: string
  address?: string | null
  checkIn: string
  checkOut: string
  amount: number
  guestNames?: string[]
  source: string
}): string {
  const stay = `${formatDdMmYy(opts.checkIn)}–${formatDdMmYy(opts.checkOut)}`
  const where = opts.address?.trim()
    ? `${opts.vendor} (${opts.locality}) — ${opts.address.trim()}`
    : `${opts.vendor} (${opts.locality})`
  const guests = opts.guestNames?.length ? `Guests: ${opts.guestNames.join(', ')}` : null
  const amount = `$${Math.abs(opts.amount).toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} AUD`
  return [where, `conf ${opts.confirmationId}`, stay, amount, guests, opts.source]
    .filter(Boolean)
    .join(' — ')
}

export function appendUniqueNote(
  existing: string | null | undefined,
  addition: string,
): string {
  const prev = (existing ?? '').trim()
  const next = addition.trim()
  if (!next) return prev
  if (prev.includes(next)) return prev
  return prev ? `${prev}\n${next}` : next
}

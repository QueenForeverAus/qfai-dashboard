/**
 * BNZ-shaped venue settlement sample (staging smoke).
 * Invented figures — not a real QF 2026 statement. Exercises the P2 classifier,
 * known insides from the PDF ticket block, and deposit no-double-count.
 */

import type { V3RawLine } from './settlements-v3-buckets.ts'

export const BNZ_FIXTURE_LABEL = 'BNZ-shaped venue statement'
export const BNZ_FIXTURE_HELP =
  'Invented BNZ-shaped settlement lines for classifier smoke. Ticket block = known insides. Printed Due to Hirer already nets the hire deposit. Not OCR; not a real venue.'

/** Printed Due to Hirer already includes the $930 deposit credit. */
export const BNZ_NETTED_DEPOSIT_LINES: V3RawLine[] = [
  { description: 'Gross Ticket Sales', amount: 32_000 },
  { description: 'Booking Fees', amount: 1_800 },
  { description: 'Credit Card Fees', amount: 512 },
  { description: 'Venue Hire', amount: 3_100 },
  { description: 'Hire Deposit (credit — already paid)', amount: 930 },
  { description: 'Ushers', amount: 2_000 },
  { description: 'Security', amount: 1_500 },
  { description: 'FOH Manager', amount: 650 },
  { description: 'Solo EDM', amount: 80 },
  { description: 'Banner', amount: 100 },
  { description: 'FB campaign', amount: 70 },
  { description: 'Sound & Lighting package', amount: 0 },
  { description: 'LPA Fee', amount: 80 },
  { description: 'Electricity', amount: 120 },
  { description: 'Due to Hirer', amount: 22_918 },
]

/**
 * Hire already shown net of deposit; deposit is informational only.
 * Printed Due to Hirer does not include a second +deposit.
 */
export const BNZ_HIRE_NET_OF_DEPOSIT_LINES: V3RawLine[] = [
  { description: 'Gross Ticket Sales', amount: 18_000 },
  { description: 'Booking Fees', amount: 900 },
  { description: 'Venue Hire (net of deposit)', amount: 2_170 },
  { description: 'Hire deposit (info only — already paid against hire)', amount: 930 },
  { description: 'Venue Staff', amount: 2_400 },
  { description: 'Due to Hirer', amount: 12_530 },
]

/** Ticket sales present; insides omitted → Factors estimated. */
export const BNZ_INSIDES_OMITTED_LINES: V3RawLine[] = [
  { description: 'Gross Ticket Sales', amount: 18_000 },
  { description: 'Venue Hire', amount: 2_800 },
  { description: 'Ushers', amount: 1_200 },
  { description: 'Due to Hirer', amount: 14_000 },
]

export const BNZ_SMOKE_NOTES = [
  'BNZ-shaped (netted deposit): classify Hire / Staff / Marketing / Venue Production/AV / other; insides known from ticket block; Due to Hirer 22918 already nets $930 deposit — do not +deposit again.',
  'BNZ-shaped (hire net of deposit): printed Due to Hirer 12530 matches ex-deposit arithmetic; deposit listed as info — still do not double-count when printed matches without adding.',
  'BNZ-shaped (insides omitted): ticket block present without booking/CC lines → insides estimated from Factors, never invented as known.',
  'SAMP01 Accurate / not settled: Expected from Advancing only; no Col3 actuals; assessment should stay quiet on venue variances.',
  'SAMP02 Accurate / settled: Col3 within ~1–2%; soft flags only if any.',
  'SAMP08 Completely wrong / remitted: wild tickets + duplicate staff + missing AV → prominent red flags; Harbour/Michael drafts from the thread, never auto-send.',
] as const

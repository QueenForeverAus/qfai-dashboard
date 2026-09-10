/**
 * Settlements v3 P2 — venue-statement / PDF line classifier.
 *
 * Buckets: Hire / Staff / Marketing / Venue Production/AV / other
 * plus tickets, classic insides, hire deposit, Due to Hirer total, GST.
 *
 * Finance GREEN:
 *   Inside: PDF ticket block = known when present; Factors only when omitted.
 *   LPA / EIS / APRA are never classic insides.
 *   Deposit: detect when the printed Due to Hirer already nets the deposit.
 * Never invents GST rates or missing money.
 */

import { classifyInsidePlacement, roundMoney } from './pnl-run-costing.ts'
import { VENUE_PRODUCTION_AV_LABEL } from './cost-fields.ts'

const MARKETING_RE =
  /\b(marketing|levy|promo|promotional|advertising|advert|campaign|brochure|poster|posters|signage|edm|email\s*blast|foyer\s*poster|selling|banner|facebook|\bfb\b|flyer)\b/i
const GEAR_RE =
  /\b(package|packages|a\/?v|audio.?visual|mic|mics|microphone|projector|screen|smoke|lighting\s*hire|light(?:ing)?\s*(?:hire|package|equip)|house\s*pa|\bpa\b|backline|equipment|equip\b|small\s*equip|tech\s*package|production\s*package|vision|staging|sound\s*(?:hire|package|system)|speaker|speakers|monitor(?:s)?|rigging|hazer|fog)\b/i
const PEOPLE_RE =
  /\b(usher|ushers|security|foh|front\s*of\s*house|technician|tech(?:s)?\b|labour|labor|warden|rider\s*staff|stage\s*door|event\s*duty\s*manager|duty\s*manager|crew|staff(?:ing)?|operator|stagehand|runner|host|hosts|manager)\b/i

/** Local copy of venue-line-classifier kinds — avoids @/ alias in unit tests. */
function classifyVenueBucket(description?: string | null, notes?: string | null): V3VenueBucket | null {
  const text = `${description ?? ''} ${notes ?? ''}`.trim()
  if (!text) return null
  if (/\bedm\b/i.test(text)) {
    if (/\b(email|campaign|poster|marketing|promo|advert|levy|solo\s*edm|dedicated\s*edm)\b/i.test(text)) {
      return 'marketing'
    }
    if (/\b(event\s*duty|duty\s*manager|manager|staff|people|usher)\b/i.test(text)) return 'staff'
    if (/\b(solo|dedicated)\s+edm\b/i.test(text)) return 'marketing'
  }
  const hasMarketing = MARKETING_RE.test(text)
  const hasGear = GEAR_RE.test(text)
  const hasPeople = PEOPLE_RE.test(text)
  if (hasMarketing && !hasPeople) return 'marketing'
  if (hasMarketing && hasPeople && !hasGear && /\b(marketing|levy|promo|advert|campaign|poster)\b/i.test(text)) {
    return 'marketing'
  }
  if (hasMarketing && !hasGear) return 'marketing'
  if (hasGear && !hasPeople) return 'production'
  if (hasPeople && !hasGear && !hasMarketing) return 'staff'
  if (hasGear && hasPeople) {
    if (/\b(package|hire|equipment|a\/?v|pa|projector|lighting)\b/i.test(text)) return 'production'
    return 'staff'
  }
  if (hasGear) return 'production'
  if (hasPeople) return 'staff'
  if (hasMarketing) return 'marketing'
  return null
}

export const V3_BUCKETS = [
  'tickets',
  'inside',
  'hire',
  'staff',
  'marketing',
  'production',
  'other',
  'deposit',
] as const

export type V3VenueBucket = (typeof V3_BUCKETS)[number]

export type V3LineKind =
  | V3VenueBucket
  | 'ticket_count'
  | 'due_to_hirer'
  | 'harbour'
  | 'deductible'
  | 'gst'
  | 'unknown'

export type V3StatementContext = 'venue_statement' | 'remittance'

export type V3RawLine = {
  id?: string
  description: string
  amount: number
  notes?: string | null
  lineKey?: string | null
  lineType?: 'payment' | 'deduction' | 'adjustment' | null
}

export type V3ClassifiedLine = V3RawLine & {
  kind: V3LineKind
  bucket: V3VenueBucket | null
}

export type V3BucketTotals = Record<V3VenueBucket, number>

export type V3InsideSource = 'known' | 'estimated' | 'missing'

export type DepositNetting = {
  deposit: number
  printedDueToHirer: number | null
  computedWithoutDeposit: number
  computedWithDeposit: number
  /** True when adding deposit again would double-count Finance GREEN. */
  alreadyNetted: boolean
  appliedDeposit: number
  residual: string | null
}

const DUE_TO_HIRER_RE =
  /\b(due\s+to\s+hirer|amount\s+due\s+to\s+hirer|hirer\s+settlement|settlement\s+due(?:\s+to\s+hirer)?|balance\s+due\s+to\s+hirer)\b/i

const DEPOSIT_RE =
  /\b(hire\s*deposit|venue\s*deposit|deposit\s*(?:paid|held|credit|already)|bond\b|holding\s*deposit)\b/i

/** Attendance / tickets-sold qty — a count, never money. */
const TICKET_COUNT_RE =
  /\b(tickets?[\s_]*sold|attendance|paid[\s_]*attendance|ticket[\s_]*count|tickets?[\s_]*(qty|quantity)|(?:no\.?|number)[\s_]*of[\s_]*tickets|pax|heads)\b/i

/** Gross $ / box office — money ticket sales. */
const TICKET_GROSS_RE =
  /\b(gross[\s_]*(ticket|box)|ticket[\s_]*sales|box[\s_]*office|nbo|nett?[\s_]*box[\s_]*office|gross[\s_]*tickets|box[\s_]*office[\s_]*gross)\b/i

const TICKET_MONEY_HINT_RE =
  /\b(sales|gross|box[\s_]*office|revenue|nbo|nett?[\s_]*box)\b/i

const TICKETS_RE = TICKET_GROSS_RE

const HARBOUR_RE =
  /\b(harbour\s*(agency|commission|fee)|agency\s*(commission|fee)|10\s*%\s*(commission|agency))\b/i

const DEDUCTIBLE_RE =
  /\b(lpa|eis|apra|one\s*music|performing\s*rights|ppca|rights\s*(fee|deduction)|withheld|clawback)\b/i

const CREDIT_RE = /\b(credit|already\s*paid|less\s*:|refunded|prepaid)\b/i

const FIELD_KEY_BUCKET: Record<string, V3VenueBucket> = {
  gross_ticket_sales: 'tickets',
  gross_box_office: 'tickets',
  inside_pre_commission: 'inside',
  'show:venue_hire': 'hire',
  venue_hire: 'hire',
  'show:venue_staff': 'staff',
  venue_staff: 'staff',
  'show:venue_marketing': 'marketing',
  venue_marketing: 'marketing',
  'show:production_costs': 'production',
  production_costs: 'production',
}

export function looksLikeDueToHirerTotal(description: string | null | undefined): boolean {
  return DUE_TO_HIRER_RE.test(String(description ?? ''))
}

export function looksLikeHireDeposit(description: string | null | undefined): boolean {
  const text = String(description ?? '')
  if (!DEPOSIT_RE.test(text)) return false
  if (/\b(not\s+a\s+deposit|confirmed,\s*not\s+a\s+deposit)\b/i.test(text)) return false
  return true
}

export function looksLikeTicketGross(description: string | null | undefined): boolean {
  return TICKET_GROSS_RE.test(String(description ?? ''))
}

/** Tickets sold / attendance qty. Money language wins (do not treat “gross tickets sold $” as a count). */
export function looksLikeTicketCount(description: string | null | undefined): boolean {
  const text = String(description ?? '')
  if (!TICKET_COUNT_RE.test(text)) return false
  if (looksLikeTicketGross(text) || TICKET_MONEY_HINT_RE.test(text)) return false
  return true
}

export function looksLikeTicketBlock(description: string | null | undefined): boolean {
  return TICKETS_RE.test(String(description ?? ''))
}

export function looksLikeHarbourCommission(description: string | null | undefined): boolean {
  return HARBOUR_RE.test(String(description ?? ''))
}

export function looksLikeRareDeductible(description: string | null | undefined): boolean {
  return DEDUCTIBLE_RE.test(String(description ?? ''))
}

export function parentFieldKey(lineKey: string | null | undefined): string {
  const raw = String(lineKey ?? '')
  return raw.includes('::') ? raw.slice(0, raw.indexOf('::')) : raw
}

/**
 * Classify one venue-statement or remittance line into a v3 bucket.
 * Classic insides only (booking / CC / named ticketing). LPA/EIS/APRA → other or deductible.
 */
export function classifySettlementLine(
  line: V3RawLine,
  context: V3StatementContext = 'venue_statement',
): V3ClassifiedLine {
  const text = `${line.description ?? ''} ${line.notes ?? ''}`.trim()
  const key = parentFieldKey(line.lineKey)

  if (looksLikeDueToHirerTotal(text)) {
    return { ...line, kind: 'due_to_hirer', bucket: null }
  }
  if (looksLikeHarbourCommission(text) || key === 'harbour_commission') {
    return { ...line, kind: 'harbour', bucket: null }
  }
  if (looksLikeHireDeposit(text) || /deposit/.test(key)) {
    return { ...line, kind: 'deposit', bucket: 'deposit' }
  }

  if (key === 'tickets_sold' || looksLikeTicketCount(text)) {
    return { ...line, kind: 'ticket_count', bucket: null }
  }

  const mapped = FIELD_KEY_BUCKET[key]
  if (mapped) {
    return { ...line, kind: mapped, bucket: mapped }
  }

  if (looksLikeTicketGross(text) || looksLikeTicketBlock(text)) {
    return { ...line, kind: 'tickets', bucket: 'tickets' }
  }

  if (looksLikeRareDeductible(text)) {
    if (context === 'remittance' || line.lineType === 'deduction') {
      return { ...line, kind: 'deductible', bucket: null }
    }
    return { ...line, kind: 'other', bucket: 'other' }
  }

  const inside = classifyInsidePlacement(text)
  if (inside === 'inside') {
    return { ...line, kind: 'inside', bucket: 'inside' }
  }

  const venue = classifyVenueBucket(line.description, line.notes)
  if (venue === 'staff' || venue === 'marketing' || venue === 'production') {
    return { ...line, kind: venue, bucket: venue }
  }

  if (/\b(venue\s*)?hire\b/i.test(text) && !/\b(equipment|lighting|backline)\s*hire\b/i.test(text)) {
    return { ...line, kind: 'hire', bucket: 'hire' }
  }

  if (context === 'remittance' && line.lineType === 'deduction') {
    return { ...line, kind: 'deductible', bucket: null }
  }

  if (/\bgst\b/i.test(text) && !/\b(?:inc(?:luded|l)?|including|ex(?:cl(?:uded)?)?|excluding)\b/i.test(text)) {
    return { ...line, kind: 'gst', bucket: null }
  }

  if (inside === 'outside' || !venue) {
    if (text) return { ...line, kind: 'other', bucket: 'other' }
  }

  return { ...line, kind: 'unknown', bucket: null }
}

export function classifySettlementLines(
  lines: V3RawLine[],
  context: V3StatementContext = 'venue_statement',
): V3ClassifiedLine[] {
  return lines.map(line => classifySettlementLine(line, context))
}

export function emptyBucketTotals(): V3BucketTotals {
  return {
    tickets: 0,
    inside: 0,
    hire: 0,
    staff: 0,
    marketing: 0,
    production: 0,
    other: 0,
    deposit: 0,
  }
}

export function sumBuckets(lines: V3ClassifiedLine[]): V3BucketTotals {
  const totals = emptyBucketTotals()
  for (const line of lines) {
    if (!line.bucket) continue
    totals[line.bucket] = roundMoney(totals[line.bucket] + Math.abs(Number(line.amount) || 0))
  }
  return totals
}

/** PDF ticket block is present when the statement has ticket sales and/or classic insides. */
export function pdfTicketBlockPresent(lines: V3ClassifiedLine[]): boolean {
  return lines.some(l => l.kind === 'tickets' || l.kind === 'inside')
}

export function pdfInsideKnown(lines: V3ClassifiedLine[]): boolean {
  return lines.some(l => l.kind === 'inside')
}

export function resolveStatementInside(opts: {
  lines: V3ClassifiedLine[]
  estimatedInside: number | null
}): { amount: number | null; source: V3InsideSource; sourceLabel: string } {
  if (pdfInsideKnown(opts.lines)) {
    const amount = roundMoney(
      opts.lines.filter(l => l.kind === 'inside').reduce((n, l) => n + Math.abs(Number(l.amount) || 0), 0),
    )
    return {
      amount,
      source: 'known',
      sourceLabel: 'known — venue statement / PDF ticket block',
    }
  }
  if (opts.estimatedInside != null && Number.isFinite(opts.estimatedInside)) {
    return {
      amount: roundMoney(opts.estimatedInside),
      source: 'estimated',
      sourceLabel: pdfTicketBlockPresent(opts.lines)
        ? 'estimated — Factors (PDF ticket block omitted insides)'
        : 'estimated — Factors (no PDF ticket block)',
    }
  }
  return {
    amount: null,
    source: 'missing',
    sourceLabel: 'Inside omitted — Factors silent; not invented',
  }
}

export function printedDueToHirer(lines: V3ClassifiedLine[]): number | null {
  const printed = lines.filter(l => l.kind === 'due_to_hirer')
  if (!printed.length) return null
  return roundMoney(printed.reduce((n, l) => n + (Number(l.amount) || 0), 0))
}

export function depositLooksLikeCredit(lines: V3ClassifiedLine[]): boolean {
  return lines.some(l => {
    if (l.kind !== 'deposit') return false
    const text = `${l.description} ${l.notes ?? ''}`
    return Number(l.amount) < 0 || CREDIT_RE.test(text)
  })
}

/**
 * Finance GREEN deposit rule: if the printed Due to Hirer already nets the
 * deposit, do not also + deposit. Prefer no double-count when ambiguous.
 */
export function resolveDepositNetting(opts: {
  tickets: number
  insides: number
  hire: number
  staff: number
  marketing: number
  production: number
  other: number
  deposit: number
  printedDueToHirer?: number | null
  depositLooksLikeCredit?: boolean
}): DepositNetting {
  const without = roundMoney(
    opts.tickets - opts.insides - opts.hire - opts.staff - opts.marketing - opts.production - opts.other,
  )
  const withDeposit = roundMoney(without + opts.deposit)
  const printed = opts.printedDueToHirer ?? null
  const creditShaped = Boolean(opts.depositLooksLikeCredit)

  if (opts.deposit === 0) {
    return {
      deposit: 0,
      printedDueToHirer: printed,
      computedWithoutDeposit: without,
      computedWithDeposit: withDeposit,
      alreadyNetted: true,
      appliedDeposit: 0,
      residual: null,
    }
  }

  if (printed != null) {
    const dWith = Math.abs(roundMoney(printed - withDeposit))
    const dWithout = Math.abs(roundMoney(printed - without))
    // Printed already includes +deposit. Apply deposit once in the formula;
    // never do printedDueToHirer + deposit (that is the double-count).
    if (dWith <= 1 && dWithout > 1) {
      return {
        deposit: opts.deposit,
        printedDueToHirer: printed,
        computedWithoutDeposit: without,
        computedWithDeposit: withDeposit,
        alreadyNetted: true,
        appliedDeposit: opts.deposit,
        residual: 'PDF Due to Hirer already nets hire deposit — applied once in §1, not added on top of the printed total.',
      }
    }
    // Printed matches without adding deposit (hire already net / deposit is info).
    if (dWithout <= 1 && dWith > 1) {
      return {
        deposit: opts.deposit,
        printedDueToHirer: printed,
        computedWithoutDeposit: without,
        computedWithDeposit: withDeposit,
        alreadyNetted: true,
        appliedDeposit: 0,
        residual: 'PDF Due to Hirer already nets deposit via hire (or omits the credit) — deposit not added again.',
      }
    }
    if (dWith <= 1 && dWithout <= 1) {
      return {
        deposit: opts.deposit,
        printedDueToHirer: printed,
        computedWithoutDeposit: without,
        computedWithDeposit: withDeposit,
        alreadyNetted: true,
        appliedDeposit: 0,
        residual: 'Printed Due to Hirer matches both with and without deposit — deposit not added (avoid double-count).',
      }
    }
    return {
      deposit: opts.deposit,
      printedDueToHirer: printed,
      computedWithoutDeposit: without,
      computedWithDeposit: withDeposit,
      alreadyNetted: true,
      appliedDeposit: creditShaped ? opts.deposit : 0,
      residual: `Printed Due to Hirer ${printed} matches neither ${without} (ex-deposit) nor ${withDeposit} (incl. deposit). ${
        creditShaped
          ? 'Deposit looks like a credit — applied once; printed total is an honest residual.'
          : 'Deposit not added on top of the printed total (avoid double-count).'
      }`,
    }
  }

  // No printed total: a credit/already-paid deposit line is part of the venue
  // waterfall once (+deposit). Do not invent a second add.
  if (creditShaped) {
    return {
      deposit: opts.deposit,
      printedDueToHirer: printed,
      computedWithoutDeposit: without,
      computedWithDeposit: withDeposit,
      alreadyNetted: true,
      appliedDeposit: opts.deposit,
      residual: 'Hire deposit is a credit / already-paid line — applied once in §1.',
    }
  }

  return {
    deposit: opts.deposit,
    printedDueToHirer: printed,
    computedWithoutDeposit: without,
    computedWithDeposit: withDeposit,
    alreadyNetted: false,
    appliedDeposit: opts.deposit,
    residual: null,
  }
}

const DEPOSIT_AMOUNT_RE =
  /\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})|[0-9]+(?:\.[0-9]{1,2})?)\s*(?:deposit|bond)/i

const DEPOSIT_AFTER_RE =
  /(?:deposit|bond)[^0-9$]{0,12}\$?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i

/** Extract a hire-deposit figure from Advancing hire source / entry notes. Never invents. */
export function extractHireDepositFromText(text: string | null | undefined): number | null {
  const raw = String(text ?? '')
  if (!looksLikeHireDeposit(raw) && !/\bdeposit\b/i.test(raw)) return null
  const match = raw.match(DEPOSIT_AMOUNT_RE) ?? raw.match(DEPOSIT_AFTER_RE)
  if (!match) return null
  const amount = Number(String(match[1]).replace(/,/g, ''))
  if (!Number.isFinite(amount) || amount <= 0) return null
  return roundMoney(amount)
}

export function bucketLabel(bucket: V3VenueBucket): string {
  switch (bucket) {
    case 'tickets': return 'Ticket sales'
    case 'inside': return 'Inside (pre-commission)'
    case 'hire': return 'Venue Hire'
    case 'staff': return 'Venue Staff'
    case 'marketing': return 'Venue Marketing'
    case 'production': return VENUE_PRODUCTION_AV_LABEL
    case 'other': return 'Other venue charges'
    case 'deposit': return 'Hire deposit'
    default: return bucket
  }
}

/**
 * W1.4 remittance variance — retunable finance defaults.
 *
 * Staging bake-in (retune after real remittances). Flags only.
 * Never auto-send. Challenge still needs a reason + evidence.
 */

export const REMITTANCE_VARIANCE_THRESHOLDS = {
  /** Hire / named packages / fixed levies: flag |Δ| ≥ $1. */
  exactAbsDollars: 1,
  /** Labour / rolled people — soft if |Δ| ≥ max($25, 2% of our line). */
  labourSoftAbsDollars: 25,
  labourSoftPctOfOurs: 0.02,
  /** Labour hours — soft if |Δ| ≥ 0.5h. */
  labourSoftHours: 0.5,
  /** Labour / rolled people — hard if |Δ| ≥ max($100, 5% of our line). */
  labourHardAbsDollars: 100,
  labourHardPctOfOurs: 0.05,
  /** Labour hours — hard if |Δ| ≥ 2h. */
  labourHardHours: 2,
  /** Rates ($/hr): ignore float noise at/under 1¢. */
  rateFloatAbsDollars: 0.01,
} as const

export type RemittanceVarianceThresholds = typeof REMITTANCE_VARIANCE_THRESHOLDS

export type VarianceKind = 'exact' | 'labour' | 'rate' | 'apra' | 'unmatched'
export type VarianceSeverity = 'soft' | 'hard' | 'info'

export type ProposedLine = {
  id: string
  show_id: string | null
  source: 'snapshot' | 'agent_settlement'
  field_key: string | null
  label: string
  amount: number
  hours: number | null
  rate: number | null
  headcount: number | null
  kind: VarianceKind
}

export type PaidLine = {
  id: string
  show_id: string | null
  line_type: 'payment' | 'deduction' | 'adjustment'
  description: string
  amount: number
  hours: number | null
  rate: number | null
  headcount: number | null
}

export type VarianceFlag = {
  code: string
  severity: VarianceSeverity
  kind: VarianceKind
  message: string
}

export type ComparisonRow = {
  id: string
  show_id: string | null
  label: string
  proposed: number | null
  paid: number | null
  variance: number | null
  proposedHours: number | null
  paidHours: number | null
  proposedRate: number | null
  paidRate: number | null
  confidence: number
  match: 'one' | 'rollup' | 'unmatched-paid' | 'unmatched-proposed'
  fedBy: Array<{ id: string; label: string; amount: number; source: ProposedLine['source'] }>
  remittanceLineIds: string[]
  flags: VarianceFlag[]
  lineType: PaidLine['line_type'] | null
}

export function roundCents(value: number | null | undefined): number {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function moneyAbs(a: number | null | undefined, b: number | null | undefined): number {
  return roundCents(Math.abs(roundCents(a) - roundCents(b)))
}

export function labourSoftDollarFloor(ourAmount: number, t = REMITTANCE_VARIANCE_THRESHOLDS): number {
  return Math.max(t.labourSoftAbsDollars, roundCents(Math.abs(ourAmount) * t.labourSoftPctOfOurs))
}

export function labourHardDollarFloor(ourAmount: number, t = REMITTANCE_VARIANCE_THRESHOLDS): number {
  return Math.max(t.labourHardAbsDollars, roundCents(Math.abs(ourAmount) * t.labourHardPctOfOurs))
}

const EXACT_RE = /\b(hire|package|levy|lpa|electricity|cleaning|edm|rider|utilities|consumable|fire warden|marketing levy|industry|isolation|hazer|projector|riser|hospitality)\b/i
const LABOUR_RE = /\b(usher|ushers|staff|technician|techs?\b|security|guard|foh|manager|warden|scanner|followspot|box office|crew|labour|labor)\b/i
const APRA_RE = /\b(apra|one\s*music|performing\s*rights|ppca|music\s*licen[cs]e|rights\s*fee|copyright)\b/i
const USHER_RE = /\b(usher|ushers|foh staff|foh usher|front of house)\b/i
const SECURITY_RE = /\b(security|guard)\b/i
const TECH_RE = /\b(technician|tech staff|lx\b|audio tech|lighting tech|duty technician)\b/i
const MARKETING_RE = /\b(edm|banner|facebook|\bfb\b|flyer|poster|brochure|promo|advert|campaign|venue marketing|marketing levy)\b/i

export type LabelBucket = 'usher' | 'security' | 'tech' | 'marketing' | null

export function looksLikeApra(text: string | null | undefined): boolean {
  return APRA_RE.test(String(text ?? ''))
}

export function classifyProposedKind(opts: {
  fieldKey?: string | null
  label: string
  hours?: number | null
}): VarianceKind {
  const label = opts.label ?? ''
  if (looksLikeApra(label) || opts.fieldKey === 'apra' || opts.fieldKey === 'rights') return 'apra'
  if (opts.fieldKey === 'venue_hire' || /\bhire\b/i.test(label)) return 'exact'
  const hours = Number(opts.hours)
  if (Number.isFinite(hours) && hours > 1 && LABOUR_RE.test(label)) return 'labour'
  if (EXACT_RE.test(label) && !(Number.isFinite(hours) && hours > 1 && LABOUR_RE.test(label))) return 'exact'
  if (LABOUR_RE.test(label)) return 'labour'
  return 'exact'
}

export function classifyPaidKind(line: Pick<PaidLine, 'description' | 'hours' | 'rate' | 'line_type'>): VarianceKind {
  if (looksLikeApra(line.description)) return 'apra'
  if (Number(line.hours) > 1 || (line.rate != null && Number(line.rate) > 0 && LABOUR_RE.test(line.description))) {
    return LABOUR_RE.test(line.description) ? 'labour' : classifyProposedKind({ label: line.description, hours: line.hours })
  }
  return classifyProposedKind({ label: line.description, hours: line.hours })
}

export type RightsPayer = 'tbd' | 'venue' | 'qf'

export function apraDoubleUpFlag(opts: {
  paidLooksLikeApra: boolean
  lineType: PaidLine['line_type'] | null
  rightsPayer: RightsPayer | null | undefined
  showHasQfRightsCost: boolean
}): VarianceFlag | null {
  if (!opts.paidLooksLikeApra) return null
  if (opts.lineType !== 'deduction' && opts.lineType !== 'adjustment') return null
  const payer = opts.rightsPayer ?? 'tbd'
  if (payer === 'venue') return null
  if (payer === 'qf' || opts.showHasQfRightsCost) {
    return {
      code: 'apra-double-up',
      severity: 'hard',
      kind: 'apra',
      message:
        'HARD — remittance deducts APRA / performing rights / OneMusic while Payer=QF (or this show already has a QF rights cost). Do not pay twice. Challenge if the venue/agent also withheld it.',
    }
  }
  return {
    code: 'apra-payer-tbd',
    severity: 'soft',
    kind: 'apra',
    message: 'APRA / rights deduction on remittance — set Rights payer (Venue vs QF) before accepting. Double-up if Payer=QF.',
  }
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function tokens(text: string): string[] {
  return normalize(text).split(/\s+/).filter(t => t.length > 1)
}

const TOKEN_SYNONYMS: Record<string, string> = {
  usher: 'usher',
  ushers: 'usher',
}

function canonToken(token: string): string {
  return TOKEN_SYNONYMS[token] ?? token
}

function tokenScore(a: string, b: string): number {
  const aa = new Set(tokens(a).map(canonToken))
  const bb = new Set(tokens(b).map(canonToken))
  if (aa.size === 0 || bb.size === 0) return 0
  let hit = 0
  for (const t of aa) if (bb.has(t)) hit++
  const jaccard = hit / new Set([...aa, ...bb]).size
  const coverage = hit / Math.min(aa.size, bb.size)
  return Math.max(jaccard, coverage * 0.9)
}

/** Public Wave 1 token score — reused by Settlements Sheet smart match. */
export function labelMatchScore(a: string, b: string): number {
  return tokenScore(a, b)
}

export function sameShow(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return !a && !b
  return a === b
}

function bucketOf(label: string): LabelBucket {
  if (USHER_RE.test(label)) return 'usher'
  if (SECURITY_RE.test(label)) return 'security'
  if (TECH_RE.test(label)) return 'tech'
  if (MARKETING_RE.test(label)) return 'marketing'
  return null
}

/** Public Wave 1 labour / marketing bucket — reused by Settlements Sheet roll-up. */
export function labelBucket(label: string): LabelBucket {
  return bucketOf(label)
}

function labourDollarFlags(our: number, theirs: number, t = REMITTANCE_VARIANCE_THRESHOLDS): VarianceFlag | null {
  const delta = moneyAbs(our, theirs)
  const hardFloor = labourHardDollarFloor(our, t)
  const softFloor = labourSoftDollarFloor(our, t)
  if (delta >= hardFloor) {
    return {
      code: 'labour-dollar-hard',
      severity: 'hard',
      kind: 'labour',
      message: `Labour $ drift ${formatDelta(theirs - our)} — hard (≥ ${formatMoney(hardFloor)}).`,
    }
  }
  if (delta >= softFloor) {
    return {
      code: 'labour-dollar-soft',
      severity: 'soft',
      kind: 'labour',
      message: `Labour $ near-miss ${formatDelta(theirs - our)} — soft (≥ ${formatMoney(softFloor)}).`,
    }
  }
  return null
}

function labourHourFlags(ourH: number | null, theirH: number | null, t = REMITTANCE_VARIANCE_THRESHOLDS): VarianceFlag | null {
  if (ourH == null || theirH == null) return null
  const delta = Math.abs(ourH - theirH)
  if (delta >= t.labourHardHours) {
    return {
      code: 'labour-hours-hard',
      severity: 'hard',
      kind: 'labour',
      message: `Hours drifted ${delta.toFixed(1)}h — hard (≥ ${t.labourHardHours}h).`,
    }
  }
  if (delta >= t.labourSoftHours) {
    return {
      code: 'labour-hours-soft',
      severity: 'soft',
      kind: 'labour',
      message: `Hours near-miss ${delta.toFixed(1)}h — soft (≥ ${t.labourSoftHours}h).`,
    }
  }
  return null
}

function exactDollarFlag(our: number, theirs: number, t = REMITTANCE_VARIANCE_THRESHOLDS): VarianceFlag | null {
  const delta = moneyAbs(our, theirs)
  if (delta >= t.exactAbsDollars) {
    return {
      code: 'exact-dollar',
      severity: 'hard',
      kind: 'exact',
      message: `Exact $ field off by ${formatDelta(theirs - our)} (flag ≥ ${formatMoney(t.exactAbsDollars)}).`,
    }
  }
  return null
}

function rateFlag(our: number | null, theirs: number | null, t = REMITTANCE_VARIANCE_THRESHOLDS): VarianceFlag | null {
  if (our == null || theirs == null) return null
  const delta = moneyAbs(our, theirs)
  if (delta > t.rateFloatAbsDollars) {
    return {
      code: 'rate-mismatch',
      severity: 'hard',
      kind: 'rate',
      message: `Rate mismatch ${formatMoney(our)}/hr vs ${formatMoney(theirs)}/hr (1¢ float OK).`,
    }
  }
  return null
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(roundCents(n))
}

function formatDelta(n: number): string {
  const v = roundCents(n)
  const sign = v > 0 ? '+' : ''
  return `${sign}${formatMoney(v)}`
}

function uniqueFlags(flags: VarianceFlag[]): VarianceFlag[] {
  const seen = new Set<string>()
  const out: VarianceFlag[] = []
  for (const f of flags) {
    if (seen.has(f.code)) continue
    seen.add(f.code)
    out.push(f)
  }
  return out
}

function pickBestProposed(paid: PaidLine, remaining: ProposedLine[]): { line: ProposedLine; score: number } | null {
  let best: { line: ProposedLine; score: number } | null = null
  for (const line of remaining) {
    if (paid.show_id && line.show_id && paid.show_id !== line.show_id) continue
    if (!paid.show_id && line.show_id) continue
    const score = tokenScore(paid.description, line.label)
    if (score < 0.3) continue
    if (!best || score > best.score) best = { line, score }
  }
  return best
}

function rollupCandidates(paid: PaidLine, remaining: ProposedLine[]): ProposedLine[] {
  const bucket = bucketOf(paid.description)
  if (!bucket) return []
  return remaining.filter(line => {
    if (paid.show_id && line.show_id && paid.show_id !== line.show_id) return false
    if (!paid.show_id && line.show_id) return false
    return bucketOf(line.label) === bucket
  })
}

export function compareRemittance(opts: {
  proposed: ProposedLine[]
  paid: PaidLine[]
  rightsPayerByShow?: Record<string, RightsPayer>
  qfRightsCostShowIds?: string[]
  thresholds?: RemittanceVarianceThresholds
}): ComparisonRow[] {
  const t = opts.thresholds ?? REMITTANCE_VARIANCE_THRESHOLDS
  const remaining = [...opts.proposed]
  const rows: ComparisonRow[] = []
  const qfRights = new Set(opts.qfRightsCostShowIds ?? [])

  for (const paid of opts.paid) {
    const paidKind = classifyPaidKind(paid)
    const payer = paid.show_id ? opts.rightsPayerByShow?.[paid.show_id] ?? 'tbd' : 'tbd'
    const apraFlag = apraDoubleUpFlag({
      paidLooksLikeApra: paidKind === 'apra' || looksLikeApra(paid.description),
      lineType: paid.line_type,
      rightsPayer: payer,
      showHasQfRightsCost: paid.show_id ? qfRights.has(paid.show_id) : false,
    })

    const group = rollupCandidates(paid, remaining)
    if (group.length >= 2 && (bucketOf(paid.description) || paidKind === 'labour')) {
      const proposedAmt = roundCents(group.reduce((s, l) => s + l.amount, 0))
      const proposedHours = group.every(l => l.hours != null)
        ? roundCents(group.reduce((s, l) => s + (Number(l.hours) || 0), 0))
        : null
      const proposedRate = group.length === 1 ? group[0].rate : null
      const flags: VarianceFlag[] = []
      const dollar = labourDollarFlags(proposedAmt, paid.amount, t)
      if (dollar) flags.push(dollar)
      const hours = labourHourFlags(proposedHours, paid.hours, t)
      if (hours) flags.push(hours)
      const rate = rateFlag(proposedRate, paid.rate, t)
      if (rate) flags.push(rate)
      if (apraFlag) flags.push(apraFlag)
      for (const line of group) {
        const i = remaining.findIndex(r => r.id === line.id)
        if (i >= 0) remaining.splice(i, 1)
      }
      rows.push({
        id: `paid:${paid.id}`,
        show_id: paid.show_id,
        label: paid.description,
        proposed: proposedAmt,
        paid: paid.amount,
        variance: roundCents(paid.amount - proposedAmt),
        proposedHours,
        paidHours: paid.hours,
        proposedRate,
        paidRate: paid.rate,
        confidence: 0.78,
        match: 'rollup',
        fedBy: group.map(l => ({ id: l.id, label: l.label, amount: l.amount, source: l.source })),
        remittanceLineIds: [paid.id],
        flags: uniqueFlags(flags),
        lineType: paid.line_type,
      })
      continue
    }

    const best = pickBestProposed(paid, remaining)
    if (best) {
      const i = remaining.findIndex(r => r.id === best.line.id)
      if (i >= 0) remaining.splice(i, 1)
      const kind = best.line.kind === 'exact' || paidKind === 'exact' ? 'exact' : paidKind === 'labour' || best.line.kind === 'labour' ? 'labour' : best.line.kind
      const flags: VarianceFlag[] = []
      if (kind === 'exact' || kind === 'apra') {
        const exact = exactDollarFlag(best.line.amount, paid.amount, t)
        if (exact) flags.push(exact)
      } else {
        const dollar = labourDollarFlags(best.line.amount, paid.amount, t)
        if (dollar) flags.push(dollar)
        const hours = labourHourFlags(best.line.hours, paid.hours, t)
        if (hours) flags.push(hours)
      }
      const rate = rateFlag(best.line.rate, paid.rate, t)
      if (rate) flags.push(rate)
      if (apraFlag) flags.push(apraFlag)
      rows.push({
        id: `paid:${paid.id}`,
        show_id: paid.show_id,
        label: paid.description,
        proposed: best.line.amount,
        paid: paid.amount,
        variance: roundCents(paid.amount - best.line.amount),
        proposedHours: best.line.hours,
        paidHours: paid.hours,
        proposedRate: best.line.rate,
        paidRate: paid.rate,
        confidence: Math.min(0.97, 0.55 + best.score * 0.45),
        match: 'one',
        fedBy: [{ id: best.line.id, label: best.line.label, amount: best.line.amount, source: best.line.source }],
        remittanceLineIds: [paid.id],
        flags: uniqueFlags(flags),
        lineType: paid.line_type,
      })
      continue
    }

    const flags: VarianceFlag[] = []
    if (apraFlag) flags.push(apraFlag)
    else {
      flags.push({
        code: 'unmatched-paid',
        severity: 'info',
        kind: 'unmatched',
        message: 'No Settlement / snapshot line matched this remittance — check description or show.',
      })
    }
    rows.push({
      id: `paid:${paid.id}`,
      show_id: paid.show_id,
      label: paid.description,
      proposed: null,
      paid: paid.amount,
      variance: null,
      proposedHours: null,
      paidHours: paid.hours,
      proposedRate: null,
      paidRate: paid.rate,
      confidence: 0.2,
      match: 'unmatched-paid',
      fedBy: [],
      remittanceLineIds: [paid.id],
      flags,
      lineType: paid.line_type,
    })
  }

  const showsWithPaid = new Set(opts.paid.map(p => p.show_id).filter((id): id is string => Boolean(id)))
  for (const leftover of remaining) {
    if (leftover.kind !== 'exact' && leftover.kind !== 'apra') continue
    if (leftover.show_id && !showsWithPaid.has(leftover.show_id)) continue
    if (!leftover.show_id) continue
    rows.push({
      id: `proposed:${leftover.id}`,
      show_id: leftover.show_id,
      label: leftover.label,
      proposed: leftover.amount,
      paid: null,
      variance: null,
      proposedHours: leftover.hours,
      paidHours: null,
      proposedRate: leftover.rate,
      paidRate: null,
      confidence: 0.4,
      match: 'unmatched-proposed',
      fedBy: [{ id: leftover.id, label: leftover.label, amount: leftover.amount, source: leftover.source }],
      remittanceLineIds: [],
      flags: [{
        code: 'missing-remittance',
        severity: 'soft',
        kind: leftover.kind,
        message: `No remittance line for exact field ${leftover.label} on this show.`,
      }],
      lineType: null,
    })
  }

  return rows
}

export function flaggedRows(rows: ComparisonRow[]): ComparisonRow[] {
  return rows.filter(r => r.flags.some(f => f.severity === 'soft' || f.severity === 'hard'))
}

export function rowHasHardFlag(row: ComparisonRow): boolean {
  return row.flags.some(f => f.severity === 'hard')
}

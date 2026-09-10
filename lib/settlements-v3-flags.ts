/**
 * Settlements v3 P3 — red-flag schema (Portal).
 * Variances reuse remittance thresholds. Never invents figures.
 */

import {
  REMITTANCE_VARIANCE_THRESHOLDS,
  labourHardDollarFloor,
  labourSoftDollarFloor,
  type VarianceSeverity,
} from './remittance-variance.ts'
import { roundMoney } from './pnl-run-costing.ts'
import type { V3RollupRow, V3ShowModel } from './settlements-v3.ts'

export const V3_FLAG_CODES = [
  'tickets-variance',
  'hire-variance',
  'staff-variance',
  'marketing-variance',
  'production-variance',
  'inside-estimated',
  'deposit-residual',
  'gst-missing',
  'other-venue-charges',
  'harbour-variance',
  'wild-variance',
] as const

export type V3FlagCode = (typeof V3_FLAG_CODES)[number]

export type V3RedFlag = {
  code: V3FlagCode
  severity: VarianceSeverity
  title: string
  detail: string
  rowKey?: string
}

function absDelta(row: V3RollupRow | undefined): number {
  if (!row || row.delta == null) return 0
  return Math.abs(row.delta)
}

function moneyFlag(opts: {
  row: V3RollupRow | undefined
  code: V3FlagCode
  title: string
  labour?: boolean
}): V3RedFlag | null {
  const row = opts.row
  if (!row || row.expected == null || row.actual == null || row.delta == null) return null
  const delta = absDelta(row)
  if (delta < 0.005) return null
  if (opts.labour) {
    const hard = labourHardDollarFloor(row.expected)
    const soft = labourSoftDollarFloor(row.expected)
    if (delta >= hard) {
      return {
        code: opts.code,
        severity: 'hard',
        title: opts.title,
        detail: `${row.label} Δ ${fmt(row.delta)} vs Advancing ${fmt(row.expected)}.`,
        rowKey: row.key,
      }
    }
    if (delta >= soft) {
      return {
        code: opts.code,
        severity: 'soft',
        title: opts.title,
        detail: `${row.label} Δ ${fmt(row.delta)} vs Advancing ${fmt(row.expected)}.`,
        rowKey: row.key,
      }
    }
    return null
  }
  if (delta >= REMITTANCE_VARIANCE_THRESHOLDS.exactAbsDollars) {
    const wild = row.expected !== 0 && delta >= Math.max(500, Math.abs(row.expected) * 0.4)
    return {
      code: wild ? 'wild-variance' : opts.code,
      severity: wild ? 'hard' : 'soft',
      title: wild ? `Wild ${opts.title.toLowerCase()}` : opts.title,
      detail: `${row.label} Δ ${fmt(row.delta)} vs Advancing ${fmt(row.expected)}.`,
      rowKey: row.key,
    }
  }
  return null
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(roundMoney(n))
}

export function buildV3RedFlags(model: V3ShowModel): V3RedFlag[] {
  const flags: V3RedFlag[] = []
  const byKey = (key: string) => model.section1.find(r => r.key === key)
    ?? model.section2.find(r => r.key === key)
    ?? model.section3.find(r => r.key === key)

  const tickets = moneyFlag({
    row: byKey('tickets'),
    code: 'tickets-variance',
    title: 'Ticket sales variance',
  })
  if (tickets) flags.push(tickets)

  const hire = moneyFlag({ row: byKey('hire'), code: 'hire-variance', title: 'Venue hire variance' })
  if (hire) flags.push(hire)

  const staff = moneyFlag({
    row: byKey('staff'),
    code: 'staff-variance',
    title: 'Venue staff variance',
    labour: true,
  })
  if (staff) flags.push(staff)

  const marketing = moneyFlag({
    row: byKey('marketing'),
    code: 'marketing-variance',
    title: 'Venue marketing variance',
  })
  if (marketing) flags.push(marketing)

  const production = moneyFlag({
    row: byKey('production'),
    code: 'production-variance',
    title: 'Venue Production/AV variance',
  })
  if (production) flags.push(production)

  if (model.actual.insideSource === 'estimated') {
    flags.push({
      code: 'inside-estimated',
      severity: 'info',
      title: 'Insides estimated',
      detail: model.actual.insideLabel,
      rowKey: 'inside',
    })
  }

  if (model.actual.depositResidual) {
    flags.push({
      code: 'deposit-residual',
      severity: model.depositNetting?.alreadyNetted ? 'info' : 'soft',
      title: 'Hire deposit residual',
      detail: model.actual.depositResidual,
      rowKey: 'deposit',
    })
  }

  if (!model.actual.gstKnown) {
    flags.push({
      code: 'gst-missing',
      severity: 'info',
      title: 'GST quarantine missing',
      detail: model.actual.gstSourceLabel,
      rowKey: 'gst_quarantine',
    })
  }

  if ((model.actual.other ?? 0) > 0) {
    flags.push({
      code: 'other-venue-charges',
      severity: 'info',
      title: 'Other venue charges',
      detail: `Unclassified / LPA-style venue lines ${fmt(model.actual.other ?? 0)} sit in §1 other — not insides and not Harbour 10%.`,
      rowKey: 'other',
    })
  }

  const harbour = moneyFlag({
    row: byKey('harbour_commission'),
    code: 'harbour-variance',
    title: 'Harbour 10% variance',
  })
  if (harbour) flags.push(harbour)

  flags.sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
  return flags
}

function severityRank(s: VarianceSeverity): number {
  if (s === 'hard') return 0
  if (s === 'soft') return 1
  return 2
}

export function prominentFlags(flags: V3RedFlag[]): V3RedFlag[] {
  return flags.filter(f => f.severity === 'hard' || f.severity === 'soft')
}

export function formatV3NigelAssessment(opts: {
  runCode: string
  venueName: string
  model: V3ShowModel
  flags: V3RedFlag[]
}): string {
  const { model, flags } = opts
  const dueE = model.dueToHirerExpected
  const dueA = model.dueToHirerActual
  const remitA = model.dueToQfActual
  const marginA = model.preDistActual
  const hard = flags.filter(f => f.severity === 'hard')
  const soft = flags.filter(f => f.severity === 'soft')
  const parts = [
    `Nigel assessment for ${opts.runCode} · ${opts.venueName}: venue proposes Due to Hirer ${fmtOrDash(dueA)} against Advancing ${fmtOrDash(dueE)} (Δ ${fmtOrDash(deltaOf(dueE, dueA))}).`,
    `Harbour 10% is taken in §2 on ticket sales minus classic insides only — Due to QF ${fmtOrDash(remitA)}. Pre-Distribution Margin ${fmtOrDash(marginA)} after band costs, GST quarantine (${model.actual.gstKnown ? 'known' : 'missing — residual may still include GST'}), and the 20% ex-GST reserve.`,
  ]
  if (hard.length) {
    parts.push(`Prominent red flags: ${hard.map(f => f.title).join('; ')}.`)
  } else if (soft.length) {
    parts.push(`Soft flags only: ${soft.map(f => f.title).join('; ')}.`)
  } else {
    parts.push('No material Expected vs Actual red flags on the venue buckets.')
  }
  if (model.actual.depositNetted && (model.actual.deposit ?? 0) > 0) {
    parts.push('Hire deposit is already netted in the venue Due to Hirer — not added again.')
  }
  const recommend = hard.length
    ? 'Recommend a Harbour challenge draft from this thread (never auto-sent), and a Michael fact-check if the variance is a venue-rate question.'
    : soft.length
      ? 'Recommend reviewing the flagged buckets; draft Harbour accept or challenge from the assessment chat — preview only.'
      : 'Figures are close enough to draft a Harbour accept from the assessment chat — preview only, never auto-send.'
  parts.push(recommend)
  return parts.join(' ')
}

function fmtOrDash(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return fmt(n)
}

function deltaOf(expected: number | null, actual: number | null): number | null {
  if (expected == null || actual == null) return null
  return roundMoney(actual - expected)
}

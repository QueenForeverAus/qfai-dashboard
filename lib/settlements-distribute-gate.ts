/**
 * Settlements Phase 5 — HARD funds-distribute gate.
 *
 * Block distribution until every band cost has an operator confirm-tick,
 * section Confirmed (all ticks), or PAID.
 *
 * Finance GREEN 2026-09-08:
 *   Confirmed ≠ PAID ≠ draft-known
 *   Never treat figure-accuracy `known` / Edit→Confirmed alone as enough.
 *
 * Additive to Wave 1 close-gate (PAID or waived on surprise band_cost_lines).
 * This gate lives where distribute would be triggered.
 */

import {
  DEFINED_RUN_COST_FIELDS,
  ENTRY_EXEMPT_FIELD_KEYS,
  allEntriesConfirmed,
  allEntriesPaid,
  displayCostFieldLabel,
  sectionPayableLines,
  type PayableLine,
} from './cost-fields.ts'
import { CONFIRMED_FIELD_STATE } from './cost-fields.ts'
import type { BandCostLine, CostingSnapshotField } from './settlements.ts'

export const DISTRIBUTE_CONTROL_LABEL = 'Distribute funds'
export const DISTRIBUTE_GATE_LABEL = 'Distribute gate (HARD)'
export const DISTRIBUTE_GATE_RULE =
  'All band costs need an operator confirm-tick, section Confirmed, or PAID. Figure-accuracy Confirmed (known) is not enough.'
export const DISTRIBUTE_BLOCKED_NOTE =
  'Distribution is blocked until every band cost is operator-confirmed or PAID.'
export const DISTRIBUTE_READY_NOTE =
  'All band costs have an operator confirm-tick, section Confirmed, or PAID. Staging stub — no funds moved.'
export const DISTRIBUTE_STUB_NOTE = 'Staging stub — no funds moved.'
export const FIGURE_ACCURACY_NOT_ENOUGH =
  'Figure-accuracy Confirmed (known) is not a confirm-tick and does not unlock distribute.'

export const AUDIT_FIELD_DISTRIBUTE = 'Distribute funds'

export type DistributeBandSource = 'run_costing' | 'wave1_band' | 'sheet_band'

export type DistributeBandLine = {
  id: string
  label: string
  source: DistributeBandSource
  fieldKey?: string
  confirmTick: boolean
  sectionConfirmed: boolean
  paid: boolean
  waived: boolean
  /** cost_fields.state === known — NEVER sufficient alone. */
  figureAccuracyKnown: boolean
}

export type DistributeGateStatus = {
  ready: boolean
  total: number
  attested: number
  blocked: number
  blockers: Array<{ id: string; label: string; reason: string }>
  summary: string
  rule: string
}

function lineIsOperatorReady(line: DistributeBandLine): boolean {
  if (line.paid) return true
  if (line.waived) return true
  if (line.confirmTick) return true
  if (line.sectionConfirmed) return true
  return false
}

export function bandLineReadyForDistribute(line: DistributeBandLine): boolean {
  return lineIsOperatorReady(line)
}

export function figureAccuracyAloneIsNotEnough(line: Pick<DistributeBandLine, 'figureAccuracyKnown' | 'confirmTick' | 'sectionConfirmed' | 'paid' | 'waived'>): boolean {
  if (!line.figureAccuracyKnown) return false
  return !line.confirmTick && !line.sectionConfirmed && !line.paid && !line.waived
}

export function collectRunCostingBandLines(fields: CostingSnapshotField[]): DistributeBandLine[] {
  const out: DistributeBandLine[] = []
  for (const def of DEFINED_RUN_COST_FIELDS) {
    if (ENTRY_EXEMPT_FIELD_KEYS.has(def.key)) continue
    const field = fields.find(f => f.field_key === def.key && f.show_id == null)
    if (!field) continue
    const payables = sectionPayableLines(field.field_key, field.entries, field.line_items)
    if (payables.length === 0) continue
    const sectionConfirmed = allEntriesConfirmed(payables)
    const sectionPaid = allEntriesPaid(payables)
    const figureKnown = field.state === CONFIRMED_FIELD_STATE
    for (const row of payables) {
      out.push({
        id: `${field.id}:${row.id}`,
        label: `${displayCostFieldLabel(def.key, field.label)}: ${payableLabel(row)}`,
        source: 'run_costing',
        fieldKey: def.key,
        confirmTick: row.confirmed === true,
        sectionConfirmed,
        paid: row.paid === true || sectionPaid,
        waived: false,
        figureAccuracyKnown: figureKnown,
      })
    }
  }
  return out
}

function payableLabel(row: PayableLine): string {
  const rec = row as PayableLine & { description?: string; role?: string }
  return (rec.description || rec.role || rec.id || 'line').toString()
}

export function collectWave1BandLines(lines: Array<Pick<BandCostLine, 'id' | 'description' | 'paid' | 'waived'>>): DistributeBandLine[] {
  return lines.map(line => ({
    id: line.id,
    label: line.description || 'Band cost',
    source: 'wave1_band',
    confirmTick: false,
    sectionConfirmed: false,
    paid: Boolean(line.paid),
    waived: Boolean(line.waived),
    figureAccuracyKnown: false,
  }))
}

export function collectSheetBandLines(rows: Array<{
  id: string
  line_key: string
  paid: boolean
  notes?: string | null
}>): DistributeBandLine[] {
  return rows
    .filter(row => row.line_key.startsWith('run:'))
    .map(row => ({
      id: row.id,
      label: row.notes?.trim() || row.line_key,
      source: 'sheet_band' as const,
      fieldKey: row.line_key.replace(/^run:/, ''),
      confirmTick: false,
      sectionConfirmed: false,
      paid: Boolean(row.paid),
      waived: false,
      figureAccuracyKnown: false,
    }))
}

/**
 * Sheet Col3 band PAID covers the matching Run Costing field so operators
 * are not asked to attest the same accommodation/flights line twice.
 */
export function mergeDistributeBandLines(opts: {
  runCosting: DistributeBandLine[]
  wave1: DistributeBandLine[]
  sheetBand?: DistributeBandLine[]
}): DistributeBandLine[] {
  const sheetPaidKeys = new Set(
    (opts.sheetBand ?? []).filter(l => l.paid && l.fieldKey).map(l => l.fieldKey as string),
  )
  const run = opts.runCosting.map(line => (
    line.fieldKey && sheetPaidKeys.has(line.fieldKey)
      ? { ...line, paid: true }
      : line
  ))
  return [...run, ...opts.wave1]
}

export function evaluateDistributeGate(lines: DistributeBandLine[]): DistributeGateStatus {
  const total = lines.length
  const blockers: DistributeGateStatus['blockers'] = []
  let attested = 0
  for (const line of lines) {
    if (lineIsOperatorReady(line)) {
      attested += 1
      continue
    }
    const reason = figureAccuracyAloneIsNotEnough(line)
      ? FIGURE_ACCURACY_NOT_ENOUGH
      : 'Needs operator confirm-tick, section Confirmed, or PAID'
    blockers.push({ id: line.id, label: line.label, reason })
  }
  const ready = blockers.length === 0
  let summary: string
  if (total === 0) {
    summary = 'No band-cost lines to attest — distribute gate is clear.'
  } else if (ready) {
    summary = `All ${total} band-cost line${total === 1 ? '' : 's'} operator-confirmed or PAID.`
  } else {
    summary = `${blockers.length} of ${total} band-cost line${total === 1 ? '' : 's'} still need a confirm-tick, section Confirmed, or PAID.`
  }
  return {
    ready,
    total,
    attested,
    blocked: blockers.length,
    blockers,
    summary,
    rule: DISTRIBUTE_GATE_RULE,
  }
}

export function distributeGateFromSources(opts: {
  fields: CostingSnapshotField[]
  wave1BandCosts: Array<Pick<BandCostLine, 'id' | 'description' | 'paid' | 'waived'>>
  sheetBandActuals?: Array<{ id: string; line_key: string; paid: boolean; notes?: string | null }>
}): DistributeGateStatus {
  const lines = mergeDistributeBandLines({
    runCosting: collectRunCostingBandLines(opts.fields),
    wave1: collectWave1BandLines(opts.wave1BandCosts),
    sheetBand: collectSheetBandLines(opts.sheetBandActuals ?? []),
  })
  return evaluateDistributeGate(lines)
}

export function formatDistributeAuditCopy(opts: {
  actorName: string
  runCode: string
  ready: boolean
}): { fieldName: string; oldValue: string; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  if (!opts.ready) {
    return {
      fieldName: AUDIT_FIELD_DISTRIBUTE,
      oldValue: 'blocked',
      newValue: `${actor} tried to distribute funds for ${opts.runCode} — blocked (band costs need confirm-tick / section Confirmed / PAID).`,
    }
  }
  return {
    fieldName: AUDIT_FIELD_DISTRIBUTE,
    oldValue: 'ready',
    newValue: `${actor} cleared the distribute gate for ${opts.runCode}. Staging stub — no funds moved.`,
  }
}

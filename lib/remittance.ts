/**
 * Settlements W1.4 — Remittance (cash received).
 *
 * HARD: Settlement = proposed (agent statement). Remittance = actual cash.
 * Challenge drafts are never auto-sent.
 */

import {
  classifyProposedKind,
  looksLikeApra,
  type ComparisonRow,
  type PaidLine,
  type ProposedLine,
  type RightsPayer,
} from './remittance-variance.ts'
import {
  snapshotFieldTotal,
  type CostingSnapshotField,
} from './settlements.ts'
import type { StaffLineItem } from './cost-fields.ts'

export const REMITTANCE_TAB_LABEL = 'Remittance'
export const REMITTANCE_CASH_NOTE =
  'Remittance is cash received — not the proposed Settlement on the agent statement.'
export const REMITTANCE_UPLOAD_STUB_NOTE =
  'Upload / OCR is later. Enter remittance lines by hand (amount, description, show, date, reference).'
export const CHALLENGE_NEVER_SEND_NOTE =
  'Draft only. The operator sends this email. The portal never auto-sends to Harbour or anyone else.'
export const ACCEPT_NO_OVERWRITE_NOTE =
  'Accept keeps Agent Settlement as-is. It does not rewrite figure-source or the locked snapshot.'
export const RECTIFY_NOTE =
  'Rectify waits for a corrected agent statement. Do not silently overwrite Settlement.'
export const HARBOUR_CHALLENGE_TO = 'Harbour (agent)'
export const RIGHTS_PAYER_LABEL = 'Rights payer'
export const RIGHTS_PAYER_HELP =
  'Who pays APRA / OneMusic / performing rights for this show. QF + a remittance rights deduction is a HARD double-up.'

export const AUDIT_FIELD_REMITTANCE_ADDED = 'Remittance line added'
export const AUDIT_FIELD_REMITTANCE_ACCEPTED = 'Remittance accepted'
export const AUDIT_FIELD_REMITTANCE_RECTIFY = 'Remittance rectify'
export const AUDIT_FIELD_CHALLENGE_DRAFT = 'Challenge draft created'
export const AUDIT_FIELD_RIGHTS_PAYER = 'Rights payer'

export const REMITTANCE_LINE_TYPES = ['payment', 'deduction', 'adjustment'] as const
export type RemittanceLineType = (typeof REMITTANCE_LINE_TYPES)[number]

export const RIGHTS_PAYERS = ['tbd', 'venue', 'qf'] as const

export const REMITTANCE_STATUSES = ['open', 'accepted', 'rectify_awaiting'] as const
export type RemittanceStatus = (typeof REMITTANCE_STATUSES)[number]

export type RemittanceLine = {
  id: string
  run_id: string
  show_id: string | null
  line_type: RemittanceLineType
  description: string
  amount: number
  occurred_on: string | null
  reference: string | null
  hours: number | null
  rate: number | null
  headcount: number | null
  notes: string | null
  created_by: string | null
  created_at: string
}

export type AgentSettlementLine = {
  id: string
  run_id: string
  show_id: string | null
  description: string
  amount: number
  occurred_on: string | null
  reference: string | null
  hours: number | null
  rate: number | null
  notes: string | null
  created_at: string
}

export type RemittanceChallenge = {
  id: string
  run_id: string
  show_id: string | null
  status: 'draft' | 'accepted' | 'rectify'
  reason: string
  subject: string
  body: string
  to_label: string
  evidence: Record<string, boolean>
  sent_at: string | null
  created_by: string | null
  created_at: string
  items?: RemittanceChallengeItem[]
}

export type RemittanceChallengeItem = {
  id: string
  challenge_id: string
  remittance_line_id: string | null
  comparison_id: string
  flag_codes: string[]
  proposed_amount: number | null
  paid_amount: number | null
  variance: number | null
  snapshot: ComparisonRow
}

export function isRightsPayer(value: unknown): value is RightsPayer {
  return value === 'tbd' || value === 'venue' || value === 'qf'
}

export function isRemittanceLineType(value: unknown): value is RemittanceLineType {
  return value === 'payment' || value === 'deduction' || value === 'adjustment'
}

export function proposedFromSnapshot(fields: CostingSnapshotField[]): ProposedLine[] {
  const out: ProposedLine[] = []
  for (const field of fields) {
    if (field.field_key === 'venue_staff' && field.line_items.length > 0) {
      for (const item of field.line_items) {
        const hours = item.hours == null ? null : Number(item.hours)
        const rate = item.rate == null ? null : Number(item.rate)
        const headcount = item.headcount == null ? null : Number(item.headcount)
        const amount = (Number(item.rate) || 0) * (Number(item.hours) || 0) * (Number(item.headcount) || 0)
        out.push({
          id: `snap-role:${field.id}:${item.id}`,
          show_id: field.show_id,
          source: 'snapshot',
          field_key: field.field_key,
          label: item.role || field.label,
          amount,
          hours,
          rate,
          headcount,
          kind: classifyProposedKind({ fieldKey: field.field_key, label: item.role || field.label, hours }),
        })
      }
      continue
    }
    if (field.entries.length > 0) {
      for (const entry of field.entries) {
        out.push({
          id: `snap-entry:${field.id}:${entry.id}`,
          show_id: field.show_id,
          source: 'snapshot',
          field_key: field.field_key,
          label: entry.description || field.label,
          amount: Number(entry.amount) || 0,
          hours: null,
          rate: null,
          headcount: null,
          kind: classifyProposedKind({ fieldKey: field.field_key, label: entry.description || field.label }),
        })
      }
      continue
    }
    const total = snapshotFieldTotal(field)
    if (!total && field.field_key !== 'venue_hire') continue
    out.push({
      id: `snap-field:${field.id}`,
      show_id: field.show_id,
      source: 'snapshot',
      field_key: field.field_key,
      label: field.label,
      amount: total,
      hours: null,
      rate: null,
      headcount: null,
      kind: classifyProposedKind({ fieldKey: field.field_key, label: field.label }),
    })
  }
  return out
}

export function proposedFromAgentLines(lines: AgentSettlementLine[]): ProposedLine[] {
  return lines.map(line => ({
    id: `agent:${line.id}`,
    show_id: line.show_id,
    source: 'agent_settlement' as const,
    field_key: null,
    label: line.description,
    amount: Number(line.amount) || 0,
    hours: line.hours == null ? null : Number(line.hours),
    rate: line.rate == null ? null : Number(line.rate),
    headcount: null,
    kind: classifyProposedKind({ label: line.description, hours: line.hours }),
  }))
}

export function paidFromRemittance(lines: RemittanceLine[]): PaidLine[] {
  return lines.map(line => ({
    id: line.id,
    show_id: line.show_id,
    line_type: line.line_type,
    description: line.description,
    amount: Number(line.amount) || 0,
    hours: line.hours == null ? null : Number(line.hours),
    rate: line.rate == null ? null : Number(line.rate),
    headcount: line.headcount == null ? null : Number(line.headcount),
  }))
}

export function showsWithQfRightsCost(fields: CostingSnapshotField[]): string[] {
  const ids = new Set<string>()
  for (const field of fields) {
    if (!field.show_id) continue
    const blob = [
      field.label,
      field.field_key,
      ...field.entries.map(e => e.description),
      ...field.line_items.map((i: StaffLineItem) => i.role),
    ].join(' ')
    if (looksLikeApra(blob) || field.field_key === 'apra' || field.field_key === 'rights') {
      ids.add(field.show_id)
    }
  }
  return [...ids]
}

export function buildChallengeDraft(opts: {
  runCode: string
  reason: string
  rows: ComparisonRow[]
  actorName: string
  evidence: Record<string, boolean>
}): { subject: string; body: string; to_label: string } {
  const reason = opts.reason.trim()
  const lines = opts.rows.map((row, i) => {
    const flags = row.flags.map(f => `[${f.severity.toUpperCase()} ${f.code}] ${f.message}`).join(' ')
    const fed = row.fedBy.length
      ? ` (from our ${row.fedBy.map(f => `${f.label} ${formatAud(f.amount)}`).join('; ')}; confidence ${Math.round(row.confidence * 100)}%)`
      : ''
    return `${i + 1}. ${row.label} — proposed ${fmtOrDash(row.proposed)} / paid ${fmtOrDash(row.paid)} / Δ ${fmtOrDash(row.variance)}${fed}\n   ${flags || 'flagged'}`
  })
  const evidenceBits = Object.entries(opts.evidence)
    .filter(([, on]) => on)
    .map(([k]) => `- ${k}`)
  const evidenceBlock = evidenceBits.length
    ? evidenceBits.join('\n')
    : '- [ ] Remittance / bank receipt\n- [ ] Agent settlement statement\n- [ ] Locked Run Costing snapshot'
  const body = [
    `Harbour — remittance challenge draft for ${opts.runCode}.`,
    '',
    `Operator reason: ${reason}`,
    '',
    'Challenged lines:',
    lines.join('\n') || '(none selected)',
    '',
    'Evidence placeholders (operator attaches before sending):',
    evidenceBlock,
    '',
    CHALLENGE_NEVER_SEND_NOTE,
    `Drafted by ${opts.actorName.trim() || 'operator'}. Not sent.`,
  ].join('\n')
  return {
    to_label: HARBOUR_CHALLENGE_TO,
    subject: `${opts.runCode} remittance challenge — draft (not sent)`,
    body,
  }
}

function fmtOrDash(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return formatAud(Number(n))
}

function formatAud(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
}

export function formatRemittanceAddedAuditCopy(opts: {
  actorName: string
  runCode: string
  description: string
  amount: number
  lineType: RemittanceLineType
  showLabel?: string | null
}): { fieldName: string; oldValue: string | null; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  const show = (opts.showLabel ?? '').trim()
  const where = show ? ` on ${show}` : ''
  const typeBit = opts.lineType === 'payment' ? '' : ` (${opts.lineType})`
  return {
    fieldName: AUDIT_FIELD_REMITTANCE_ADDED,
    oldValue: null,
    newValue: `${actor} entered remittance line ${opts.description.trim() || 'a line'}${typeBit} ${formatAud(opts.amount)}${where} (run ${opts.runCode}).`,
  }
}

export function formatRemittanceAcceptedAuditCopy(opts: {
  actorName: string
  runCode: string
}): { fieldName: string; oldValue: string; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  return {
    fieldName: AUDIT_FIELD_REMITTANCE_ACCEPTED,
    oldValue: 'open',
    newValue: `${actor} accepted remittance as-is for ${opts.runCode}. Agent Settlement was not overwritten.`,
  }
}

export function formatRemittanceRectifyAuditCopy(opts: {
  actorName: string
  runCode: string
}): { fieldName: string; oldValue: string; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  return {
    fieldName: AUDIT_FIELD_REMITTANCE_RECTIFY,
    oldValue: 'open',
    newValue: `${actor} marked remittance as rectify — waiting for a corrected agent statement on ${opts.runCode}. Agent Settlement was not overwritten.`,
  }
}

export function formatChallengeDraftAuditCopy(opts: {
  actorName: string
  runCode: string
  lineCount: number
  reason: string
}): { fieldName: string; oldValue: string | null; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  const reason = opts.reason.trim() || 'no reason'
  return {
    fieldName: AUDIT_FIELD_CHALLENGE_DRAFT,
    oldValue: null,
    newValue: `${actor} created a challenge draft to Harbour for ${opts.runCode} (not sent) — ${opts.lineCount} line${opts.lineCount === 1 ? '' : 's'}. Reason: ${reason}.`,
  }
}

export function formatRightsPayerAuditCopy(opts: {
  actorName: string
  runCode: string
  showLabel: string
  from: string
  to: string
}): { fieldName: string; oldValue: string; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  return {
    fieldName: AUDIT_FIELD_RIGHTS_PAYER,
    oldValue: opts.from,
    newValue: `${actor} set Rights payer on ${opts.showLabel} (${opts.runCode}) from ${opts.from} to ${opts.to}.`,
  }
}

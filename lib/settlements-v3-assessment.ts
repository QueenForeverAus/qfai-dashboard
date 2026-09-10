/**
 * Settlements v3 P3/P4 — Portal assessment chat + draft emails.
 *
 * Chat lives in settlement_assessment_messages (Portal store — not a Lead mirror).
 * Harbour accept/challenge and Michael fact-check are draft/preview only.
 * Per-line challenge stays optional secondary (existing remittance path).
 */

import { CHALLENGE_NEVER_SEND_NOTE } from './remittance.ts'
import type { V3RedFlag } from './settlements-v3-flags.ts'
import { formatV3NigelAssessment } from './settlements-v3-flags.ts'
import { isV3RunModel, type V3RunModel, type V3ShowModel } from './settlements-v3.ts'

export const ASSESSMENT_CHAT_NOTE =
  'Gareth comments on this Portal assessment thread. This is not a Lead mirror.'

export const ASSESSMENT_DRAFT_NEVER_SEND = CHALLENGE_NEVER_SEND_NOTE

export const MICHAEL_FACTCHECK_FROM = 'Nigel (tours@)'
export const MICHAEL_FACTCHECK_TO = 'Michael'
export const HARBOUR_ASSESSMENT_TO = 'Harbour (agent)'
export const HARBOUR_ASSESSMENT_FROM = 'Settlements (preview)'

/** Michael owns venue production — not travel, marketing, owners, or Harbour. */
export const MICHAEL_FACTCHECK_SCOPE_NOTE =
  'Venue Staff, Venue Production/AV, other venue production charges, and Backline Hire only.'

const MICHAEL_OTHER_PRODUCTION_RE =
  /\b(backline|a\/?v|audio.?visual|production|lighting|sound\s*(?:hire|package|system)|stage|rigging|vision|tech\s*package|mic|monitor|speaker|hazer|fog)\b/i
const MICHAEL_OUT_OF_SCOPE_RE =
  /\b(travel|flight|accom|hotel|uber|marketing|edm|banner|facebook|\bfb\b|harbour|commission|owner|gareth|brad|scott|gst|reserve|margin|deal|hirer|remittance)\b/i

export const AUDIT_FIELD_ASSESSMENT_COMMENT = 'Settlement assessment comment'
export const AUDIT_FIELD_ASSESSMENT_DRAFT = 'Settlement assessment email draft'

export const ASSESSMENT_DRAFT_KINDS = [
  'harbour_accept',
  'harbour_challenge',
  'michael_factcheck',
] as const

export type AssessmentDraftKind = (typeof ASSESSMENT_DRAFT_KINDS)[number]

export type SettlementAssessmentMessage = {
  id: string
  run_id: string
  show_id: string | null
  author_id: string | null
  author_name: string
  body: string
  created_at: string
}

export function isAssessmentDraftKind(value: unknown): value is AssessmentDraftKind {
  return ASSESSMENT_DRAFT_KINDS.includes(value as AssessmentDraftKind)
}

export function formatAssessmentCommentAuditCopy(opts: {
  actorName: string
  runCode: string
}): { fieldName: string; oldValue: string | null; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  return {
    fieldName: AUDIT_FIELD_ASSESSMENT_COMMENT,
    oldValue: null,
    newValue: `${actor} added a Settlements assessment comment on ${opts.runCode} (Portal thread — not a Lead mirror).`,
  }
}

export function formatAssessmentDraftAuditCopy(opts: {
  actorName: string
  runCode: string
  kind: AssessmentDraftKind
}): { fieldName: string; oldValue: string | null; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  const label = opts.kind === 'michael_factcheck'
    ? 'Michael fact-check'
    : opts.kind === 'harbour_accept'
      ? 'Harbour accept'
      : 'Harbour challenge'
  return {
    fieldName: AUDIT_FIELD_ASSESSMENT_DRAFT,
    oldValue: null,
    newValue: `${actor} drafted a ${label} email from the ${opts.runCode} assessment thread (not sent).`,
  }
}

export type MichaelFactCheckLine = {
  key: string
  label: string
  expected: number | null
  actual: number | null
  note?: string
}

export function isMichaelOtherProductionCharge(label: string): boolean {
  const text = String(label ?? '')
  if (!text.trim()) return false
  if (MICHAEL_OUT_OF_SCOPE_RE.test(text) && !MICHAEL_OTHER_PRODUCTION_RE.test(text)) return false
  if (/\b(lpa|eis|apra|one\s*music|electricity|power|rights)\b/i.test(text)) return false
  return MICHAEL_OTHER_PRODUCTION_RE.test(text)
}

export function collectMichaelFactCheckLines(model: V3ShowModel | V3RunModel): MichaelFactCheckLine[] {
  if (isV3RunModel(model)) {
    const fromVenues = model.venues.flatMap(venue => {
      const prefix = model.venues.length > 1 ? `${venue.show.venue_name}: ` : ''
      return collectShowMichaelLines(venue.model)
        .filter(line => !line.key.startsWith('run:'))
        .map(line => ({ ...line, label: `${prefix}${line.label}` }))
    })
    return [...fromVenues, ...collectBacklineLines(model.section3)]
  }
  return collectShowMichaelLines(model)
}

function collectShowMichaelLines(model: V3ShowModel): MichaelFactCheckLine[] {
  const out: MichaelFactCheckLine[] = []
  const staff = model.section1.find(r => r.key === 'staff')
  if (staff) {
    const kids = staff.children.length ? staff.children : [{
      key: staff.key,
      label: staff.label.replace(/^−\s*/, ''),
      expected: staff.expected,
      actual: staff.actual,
      note: staff.note,
    }]
    for (const child of kids) {
      out.push({
        key: child.key,
        label: child.label,
        expected: child.expected,
        actual: child.actual,
        note: child.note,
      })
    }
  }
  const production = model.section1.find(r => r.key === 'production')
  if (production) {
    const kids = production.children.length ? production.children : [{
      key: production.key,
      label: production.label.replace(/^−\s*/, ''),
      expected: production.expected,
      actual: production.actual,
      note: production.note,
    }]
    for (const child of kids) {
      out.push({
        key: child.key,
        label: child.label,
        expected: child.expected,
        actual: child.actual,
        note: child.note,
      })
    }
  }
  const other = model.section1.find(r => r.key === 'other')
  for (const child of other?.children ?? []) {
    if (isMichaelOtherProductionCharge(child.label)) {
      out.push({
        key: child.key,
        label: child.label,
        expected: child.expected,
        actual: child.actual,
        note: child.note,
      })
    }
  }
  out.push(...collectBacklineLines(model.section3))
  return out
}

function collectBacklineLines(section3: V3ShowModel['section3']): MichaelFactCheckLine[] {
  const advancing = section3.find(r => r.key === 'band_costs')
  return (advancing?.children ?? [])
    .filter(child => /backline/i.test(`${child.key} ${child.label}`))
    .map(child => ({
      key: child.key,
      label: child.label,
      expected: child.expected,
      actual: child.actual,
      note: child.note,
    }))
}

export function buildAssessmentEmailDraft(opts: {
  kind: AssessmentDraftKind
  runCode: string
  venueName: string
  actorName: string
  model: V3ShowModel | V3RunModel
  flags: V3RedFlag[]
  messages: Array<Pick<SettlementAssessmentMessage, 'author_name' | 'body' | 'created_at'>>
  nigelParagraph?: string
}): { subject: string; body: string; to_label: string; from_label: string; reason: string } {
  const nigel = opts.nigelParagraph ?? formatV3NigelAssessment({
    runCode: opts.runCode,
    venueName: opts.venueName,
    model: opts.model,
    flags: opts.flags,
  })
  const thread = opts.messages.length
    ? opts.messages.map(m => `- ${m.author_name || 'Operator'}: ${m.body.trim()}`).join('\n')
    : '- (no assessment comments yet)'
  const flags = opts.flags.length
    ? opts.flags.map(f => `- [${f.severity.toUpperCase()} ${f.code}] ${f.title} — ${f.detail}`).join('\n')
    : '- none'
  const figures = isV3RunModel(opts.model) && opts.model.venues.length > 0
    ? [
      ...opts.model.venues.map(v =>
        `${v.show.venue_name} Due to Hirer: Expected ${fmt(v.model.dueToHirerExpected)} / Actual ${fmt(v.model.dueToHirerActual)} · remittance ${fmt(v.model.dueToQfExpected)} / ${fmt(v.model.dueToQfActual)}`,
      ),
      `Due to QF (sum of venue remittances): Expected ${fmt(opts.model.dueToQfExpected)} / Actual ${fmt(opts.model.dueToQfActual)}`,
      `Pre-Distribution Margin: Expected ${fmt(opts.model.preDistExpected)} / Actual ${fmt(opts.model.preDistActual)}`,
    ].join('\n')
    : [
      `Due to Hirer (venue proposal): Expected ${fmt((opts.model as V3ShowModel).dueToHirerExpected)} / Actual ${fmt((opts.model as V3ShowModel).dueToHirerActual)}`,
      `Due to QF (remittance): Expected ${fmt(opts.model.dueToQfExpected)} / Actual ${fmt(opts.model.dueToQfActual)}`,
      `Pre-Distribution Margin: Expected ${fmt(opts.model.preDistExpected)} / Actual ${fmt(opts.model.preDistActual)}`,
      `Harbour 10% (sales − classic insides): ${fmt(opts.model.actual.harbourCommission)}`,
    ].join('\n')

  if (opts.kind === 'michael_factcheck') {
    const reason = 'Michael fact-check from Nigel (tours@) — venue production lines only'
    const scoped = collectMichaelFactCheckLines(opts.model)
    const scopedBlock = scoped.length
      ? scoped.map(line => {
        const bits = [
          line.label,
          line.expected != null ? `Advancing ${fmt(line.expected)}` : null,
          line.actual != null ? `statement ${fmt(line.actual)}` : 'statement not on file yet',
          line.note,
        ].filter(Boolean)
        return `- ${bits.join(' · ')}`
      }).join('\n')
      : '- No Venue Staff / Venue Production/AV / production-other / Backline Hire figures on file yet. Please confirm if anything in your scope was missed.'
    const body = [
      `From: ${MICHAEL_FACTCHECK_FROM}`,
      `To: ${MICHAEL_FACTCHECK_TO}`,
      '',
      `Michael — please fact-check the venue production costs for ${opts.runCode} (${opts.venueName}).`,
      '',
      `In your scope only: ${MICHAEL_FACTCHECK_SCOPE_NOTE}`,
      'I am not asking about travel, marketing, owner costs, or Harbour commission.',
      '',
      scopedBlock,
      '',
      ASSESSMENT_DRAFT_NEVER_SEND,
      `Drafted by ${opts.actorName.trim() || 'operator'} on behalf of Nigel (tours@). Not sent.`,
    ].join('\n')
    return {
      from_label: MICHAEL_FACTCHECK_FROM,
      to_label: MICHAEL_FACTCHECK_TO,
      subject: `${opts.runCode} venue production fact-check — draft (not sent)`,
      body,
      reason,
    }
  }

  if (opts.kind === 'harbour_accept') {
    const reason = 'Harbour accept draft from Settlements assessment thread'
    const body = [
      `Harbour — settlement accept draft for ${opts.runCode} (${opts.venueName}).`,
      '',
      nigel,
      '',
      'We are minded to accept Due to Hirer as proposed, then take Harbour 10% on ticket sales minus classic insides in remittance.',
      figures,
      '',
      'Assessment thread:',
      thread,
      '',
      ASSESSMENT_DRAFT_NEVER_SEND,
      `Drafted by ${opts.actorName.trim() || 'operator'}. Not sent.`,
    ].join('\n')
    return {
      from_label: HARBOUR_ASSESSMENT_FROM,
      to_label: HARBOUR_ASSESSMENT_TO,
      subject: `${opts.runCode} settlement accept — draft (not sent)`,
      body,
      reason,
    }
  }

  const reason = 'Harbour challenge draft from Settlements assessment thread'
  const body = [
    `Harbour — settlement challenge draft for ${opts.runCode} (${opts.venueName}).`,
    '',
    nigel,
    '',
    'Flagged buckets (primary challenge is the assessment, not per-line):',
    flags,
    '',
    figures,
    '',
    'Assessment thread:',
    thread,
    '',
    ASSESSMENT_DRAFT_NEVER_SEND,
    `Drafted by ${opts.actorName.trim() || 'operator'}. Not sent.`,
  ].join('\n')
  return {
    from_label: HARBOUR_ASSESSMENT_FROM,
    to_label: HARBOUR_ASSESSMENT_TO,
    subject: `${opts.runCode} settlement challenge — draft (not sent)`,
    body,
    reason,
  }
}

function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
}

export function defaultDraftKindFromFlags(flags: V3RedFlag[]): AssessmentDraftKind {
  return flags.some(f => f.severity === 'hard' || f.severity === 'soft')
    ? 'harbour_challenge'
    : 'harbour_accept'
}

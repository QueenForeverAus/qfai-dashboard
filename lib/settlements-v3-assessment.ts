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
import type { V3ShowModel } from './settlements-v3.ts'

export const ASSESSMENT_CHAT_NOTE =
  'Gareth comments on this Portal assessment thread. This is not a Lead mirror.'

export const ASSESSMENT_DRAFT_NEVER_SEND = CHALLENGE_NEVER_SEND_NOTE

export const MICHAEL_FACTCHECK_TO = 'Michael (fact-check)'
export const HARBOUR_ASSESSMENT_TO = 'Harbour (agent)'

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

export function buildAssessmentEmailDraft(opts: {
  kind: AssessmentDraftKind
  runCode: string
  venueName: string
  actorName: string
  model: V3ShowModel
  flags: V3RedFlag[]
  messages: Array<Pick<SettlementAssessmentMessage, 'author_name' | 'body' | 'created_at'>>
  nigelParagraph?: string
}): { subject: string; body: string; to_label: string; reason: string } {
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
  const figures = [
    `Due to Hirer (venue proposal): Expected ${fmt(opts.model.dueToHirerExpected)} / Actual ${fmt(opts.model.dueToHirerActual)}`,
    `Due to QF (remittance): Expected ${fmt(opts.model.dueToQfExpected)} / Actual ${fmt(opts.model.dueToQfActual)}`,
    `Pre-Distribution Margin: Expected ${fmt(opts.model.preDistExpected)} / Actual ${fmt(opts.model.preDistActual)}`,
    `Harbour 10% (sales − classic insides): ${fmt(opts.model.actual.harbourCommission)}`,
  ].join('\n')

  if (opts.kind === 'michael_factcheck') {
    const reason = 'Michael fact-check from Settlements assessment thread'
    const body = [
      `Michael — fact-check draft for ${opts.runCode} (${opts.venueName}).`,
      '',
      nigel,
      '',
      'Figures (Portal Settlements v3):',
      figures,
      '',
      'Flags:',
      flags,
      '',
      'Assessment thread (Gareth / operators):',
      thread,
      '',
      'Please confirm venue rates / omitted insides / deposit treatment. This is a draft — not sent.',
      '',
      ASSESSMENT_DRAFT_NEVER_SEND,
      `Drafted by ${opts.actorName.trim() || 'operator'}. Not sent.`,
    ].join('\n')
    return {
      to_label: MICHAEL_FACTCHECK_TO,
      subject: `${opts.runCode} Michael fact-check — draft (not sent)`,
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

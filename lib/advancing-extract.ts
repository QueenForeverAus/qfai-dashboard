/**
 * Michael advancing-email extract → Run Costing apply (Portal staging slice A).
 *
 * Inbound contract: advancing-packet-v1 (see lib/advancing-packet-v1.ts).
 * Untrusted inbound: only known figure fields are read. Packet prose, evidence
 * snippets, and any instruction-like keys are never executed.
 *
 * Figure accuracy `known` (CONFIRMED badge) is not a confirm-tick and not PAID.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { writeAuditLog, auditStringify } from './audit-log.ts'
import {
  CONFIRMED_FIELD_STATE,
  DEFINED_RUN_COST_FIELDS,
  DEFINED_SHOW_COST_FIELDS,
  entriesSum,
  entryIsPaidLocked,
  lineItemsSum,
  normalizeEntries,
  normalizeLineItems,
  productionCanEditFieldKey,
  type CostEntry,
  type CostFieldState,
  type StaffLineItem,
} from './cost-fields.ts'
import { hasPreservedSource, isAdvancingSourceNote } from './cost-entry-source.ts'
import { classifyVenueLine } from './venue-line-classifier.ts'
import { LIGHTING_HIRE_PER_RUN } from './defaults/run-defaults.ts'

export const ADVANCING_SOURCE_KIND = 'michael_advancing_email' as const
export const ADVANCING_PACKET_VERSION = 'michael-advancing-email-costings-v1'

export const ADVANCING_CONFIDENCE = ['high', 'medium', 'low'] as const
export type AdvancingConfidence = (typeof ADVANCING_CONFIDENCE)[number]

/** Soft-flag codes. No new dollar thresholds — Staff/AV/Marketing canon stays. */
export const ADVANCING_SOFT_FLAG = {
  loneFoh: 'lone_foh',
  cateringRiderVsFb: 'catering_rider_vs_fb',
  g3BacklineBandVsVenue: 'g3_backline_band_vs_venue',
  crewHeadcountOverTarget: 'crew_headcount_over_target',
  /** advancing-packet-v1 allowlisted alias — still writes actual headcount. */
  crewOverTarget: 'crew_over_target',
  hireNotRenegotiated: 'hire_not_renegotiated',
  lightingDefaultKept: 'lighting_default_kept',
  /** advancing-packet-v1 allowlisted alias — keep $330 unless replace. */
  lighting330KeepSeparate: 'lighting_330_keep_separate',
} as const

export type AdvancingSoftFlagCode = (typeof ADVANCING_SOFT_FLAG)[keyof typeof ADVANCING_SOFT_FLAG]

/** Crew headcount *target* only — write the agreed count; flag if above. */
export const ADVANCING_CREW_HEADCOUNT_TARGET = 3

export { ADVANCING_SOURCE_NOTE_RE, isAdvancingSourceNote } from './cost-entry-source.ts'

export const AUDIT_FIELD_ADVANCING_APPLY = 'Michael advancing email'
export const AUDIT_FIELD_ADVANCING_SUPERSEDE = 'advancing figure superseded'

const APPLYABLE_FIELD_KEYS = new Set([
  'production_costs',
  'venue_staff',
  'lighting_hire',
  'backline_hire',
  'venue_hire',
])

const AMBIGUOUS_SOFT_FLAGS = new Set<string>([
  ADVANCING_SOFT_FLAG.loneFoh,
  ADVANCING_SOFT_FLAG.cateringRiderVsFb,
  ADVANCING_SOFT_FLAG.g3BacklineBandVsVenue,
])

const KIND_TO_FIELD: Record<string, string> = {
  production_av: 'production_costs',
  production: 'production_costs',
  production_costs: 'production_costs',
  venue_staff: 'venue_staff',
  staff: 'venue_staff',
  catering: 'venue_staff',
  hospitality: 'venue_staff',
  backline: 'production_costs',
  lighting: 'lighting_hire',
  lighting_hire: 'lighting_hire',
  venue_hire: 'venue_hire',
  hire: 'venue_hire',
}

export type AdvancingExtractLine = {
  id?: string
  kind?: string | null
  field_key?: string | null
  description?: string | null
  notes?: string | null
  amount?: number | null
  gst_included?: boolean
  role?: string | null
  rate?: number | null
  hours?: number | null
  headcount?: number | null
  confidence?: AdvancingConfidence | null
  soft_flags?: string[] | null
  evidence_snippet?: string | null
  rider_as_staff?: boolean
  band_side?: boolean | null
  lighting_replaced_by_venue_package?: boolean
  hire_renegotiated?: boolean
}

export type AdvancingExtractPacket = {
  version?: string | null
  run_id?: string | null
  show_id?: string | null
  venue_short_name: string
  email_date: string
  message_id?: string | null
  thread_ref?: string | null
  confidence?: AdvancingConfidence | null
  evidence_snippet?: string | null
  soft_flags?: string[] | null
  hire_renegotiated?: boolean
  lighting_replaced_by_venue_package?: boolean
  run_group?: string | null
  lines: AdvancingExtractLine[]
}

export type ParsedAdvancingPacket = {
  venueShortName: string
  emailDate: string
  sourceNote: string
  messageId: string | null
  threadRef: string | null
  confidence: AdvancingConfidence | null
  evidenceSnippet: string | null
  softFlags: string[]
  hireRenegotiated: boolean
  lightingReplacedByVenuePackage: boolean
  runGroup: string | null
  showId: string | null
  runId: string | null
  lines: ParsedAdvancingLine[]
}

export type ParsedAdvancingLine = {
  id: string
  kind: string | null
  fieldKeyHint: string | null
  description: string
  notes: string
  amount: number
  gstIncluded: boolean
  role: string
  rate: number
  hours: number
  headcount: number
  confidence: AdvancingConfidence | null
  softFlags: string[]
  evidenceSnippet: string | null
  riderAsStaff: boolean
  bandSide: boolean | null
  lightingReplacedByVenuePackage: boolean
  hireRenegotiated: boolean
}

export type PlannedAdvancingWrite = {
  lineId: string
  fieldKey: string
  mode: 'entry' | 'role'
  description: string
  sourceNote: string
  amount: number
  gstIncluded: boolean
  role: string
  rate: number
  hours: number
  headcount: number
  confidence: AdvancingConfidence | null
  evidenceSnippet: string | null
  softFlags: string[]
  messageId: string | null
  threadRef: string | null
}

export type PlannedAdvancingSkip = {
  lineId: string
  reason: string
  softFlags: string[]
  fieldKey?: string
  description: string
}

export type AdvancingApplyPlan = {
  status: 'apply' | 'queued'
  sourceNote: string
  packetConfidence: AdvancingConfidence | null
  messageId: string | null
  threadRef: string | null
  evidenceSnippet: string | null
  venueShortName: string
  writes: PlannedAdvancingWrite[]
  skipped: PlannedAdvancingSkip[]
  softFlags: string[]
  queueReason?: string
}

export type AdvancingApplyResult = {
  status: 'applied' | 'queued' | 'partial'
  source_note: string
  apply_id: string | null
  applied: Array<{ field_key: string; description: string; amount: number; mode: string }>
  skipped: PlannedAdvancingSkip[]
  superseded: Array<{ field_key: string; description: string; old_amount: number; new_amount: number }>
  /** Audit Trail sentences (apply + each supersede). */
  audit: string[]
  soft_flags: string[]
  queue_reason?: string
  fields: Array<Record<string, unknown>>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function sanitizePlainText(value: unknown, max = 240): string {
  if (value == null) return ''
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function sanitizeVenueShortName(value: unknown): string {
  return sanitizePlainText(value, 40)
}

function asConfidence(value: unknown): AdvancingConfidence | null {
  const raw = String(value ?? '').trim().toLowerCase()
  return (ADVANCING_CONFIDENCE as readonly string[]).includes(raw)
    ? (raw as AdvancingConfidence)
    : null
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => sanitizePlainText(item, 64))
    .filter(Boolean)
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function asBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1
}

function asOptionalBool(value: unknown): boolean | null {
  if (value === true || value === 'true' || value === 1) return true
  if (value === false || value === 'false' || value === 0) return false
  return null
}

/** HARD Notes/Source: `Michael email w/<venue short name> DD/MM/YY` */
export function formatAdvancingEmailDate(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim()
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/)
  if (dmy) {
    const dd = dmy[1].padStart(2, '0')
    const mm = dmy[2].padStart(2, '0')
    const yy = dmy[3].length === 4 ? dmy[3].slice(-2) : dmy[3]
    return `${dd}/${mm}/${yy}`
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1].slice(-2)}`
  return null
}

export function formatAdvancingSourceNote(venueShortName: string, emailDate: string): string {
  const venue = sanitizeVenueShortName(venueShortName)
  const date = formatAdvancingEmailDate(emailDate)
  if (!venue) throw new Error('venue_short_name is required')
  if (!date) throw new Error('email_date must be DD/MM/YY or YYYY-MM-DD')
  return `Michael email w/${venue} ${date}`
}

export function isAdvancingLine(
  row: { notes?: string | null; source?: string | null; advancing_source?: string | null },
): boolean {
  if (row.advancing_source === ADVANCING_SOURCE_KIND) return true
  return isAdvancingSourceNote(row.notes) || isAdvancingSourceNote(row.source)
}

export function confidenceAllowsAutoWrite(
  confidence: AdvancingConfidence | null | undefined,
  forceApply: boolean,
): boolean {
  if (forceApply) return true
  return confidence === 'high'
}

export function isLoneFoh(text: string): boolean {
  return /^(foh|f\.o\.h\.?|front of house)$/i.test(text.trim())
}

function isCateringLike(text: string): boolean {
  return /\b(catering|rider|hospitality|f\s*&\s*b|f\s+and\s+b|food\s*and\s*beverage|meals?|green\s*room\s*(?:food|cater))\b/i.test(text)
}

function isBacklineLike(text: string): boolean {
  return /\bbackline\b/i.test(text)
}

function isLightingLike(text: string): boolean {
  return /\b(lighting\s*hire|light(?:ing)?\s*(?:hire|package|equip)|lx\s*hire)\b/i.test(text)
}

function isHireLike(text: string): boolean {
  return /\b(venue\s*hire|harbour\s*deal|room\s*hire|hall\s*hire)\b/i.test(text)
}

function lineText(line: ParsedAdvancingLine): string {
  return `${line.role} ${line.description} ${line.notes}`.trim()
}

export function parseAdvancingPacket(raw: unknown): ParsedAdvancingPacket {
  const body = asRecord(raw)
  if (!body) throw new Error('packet must be an object')

  // Known keys only — ignore instructions / prompt / system / tools / etc.
  const venueShortName = sanitizeVenueShortName(body.venue_short_name)
  const emailDate = formatAdvancingEmailDate(body.email_date)
  if (!venueShortName) throw new Error('venue_short_name is required')
  if (!emailDate) throw new Error('email_date must be DD/MM/YY or YYYY-MM-DD')
  if (!Array.isArray(body.lines)) throw new Error('packet.lines must be an array')

  const sourceNote = formatAdvancingSourceNote(venueShortName, emailDate)
  const lines = body.lines.map((item, index) => parseAdvancingLine(item, index))

  return {
    venueShortName,
    emailDate,
    sourceNote,
    messageId: sanitizePlainText(body.message_id, 200) || null,
    threadRef: sanitizePlainText(body.thread_ref, 200) || null,
    confidence: asConfidence(body.confidence),
    evidenceSnippet: sanitizePlainText(body.evidence_snippet, 500) || null,
    softFlags: asStringList(body.soft_flags),
    hireRenegotiated: asBool(body.hire_renegotiated),
    lightingReplacedByVenuePackage: asBool(body.lighting_replaced_by_venue_package),
    runGroup: sanitizePlainText(body.run_group, 32).toLowerCase() || null,
    showId: sanitizePlainText(body.show_id, 64) || null,
    runId: sanitizePlainText(body.run_id, 64) || null,
    lines,
  }
}

function parseAdvancingLine(raw: unknown, index: number): ParsedAdvancingLine {
  const row = asRecord(raw) ?? {}
  const description = sanitizePlainText(row.description ?? row.role, 160)
  const role = sanitizePlainText(row.role ?? row.description, 120)
  const hours = asFiniteNumber(row.hours, 1) || 1
  const headcount = asFiniteNumber(row.headcount, 1) || 1
  const rate = row.rate != null ? asFiniteNumber(row.rate, 0) : 0
  const amount = row.amount != null
    ? asFiniteNumber(row.amount, 0)
    : rate * hours * headcount

  return {
    id: sanitizePlainText(row.id, 64) || `adv-line-${index + 1}`,
    kind: sanitizePlainText(row.kind, 40).toLowerCase() || null,
    fieldKeyHint: sanitizePlainText(row.field_key, 40).toLowerCase() || null,
    description: description || role || `Advancing line ${index + 1}`,
    notes: sanitizePlainText(row.notes, 240),
    amount,
    gstIncluded: row.gst_included !== false,
    role: role || description || `Role ${index + 1}`,
    rate: rate || amount,
    hours,
    headcount,
    confidence: asConfidence(row.confidence),
    softFlags: asStringList(row.soft_flags),
    evidenceSnippet: sanitizePlainText(row.evidence_snippet, 500) || null,
    riderAsStaff: asBool(row.rider_as_staff),
    bandSide: asOptionalBool(row.band_side),
    lightingReplacedByVenuePackage: asBool(row.lighting_replaced_by_venue_package),
    hireRenegotiated: asBool(row.hire_renegotiated),
  }
}

function resolveFieldKey(line: ParsedAdvancingLine, packet: ParsedAdvancingPacket): {
  fieldKey: string | null
  flags: string[]
  skipReason?: string
} {
  const flags = [...line.softFlags]
  const text = lineText(line)

  if (isLoneFoh(text) || isLoneFoh(line.description) || isLoneFoh(line.role)) {
    flags.push(ADVANCING_SOFT_FLAG.loneFoh)
  }

  const hinted = line.fieldKeyHint && APPLYABLE_FIELD_KEYS.has(line.fieldKeyHint)
    ? line.fieldKeyHint
    : line.kind && KIND_TO_FIELD[line.kind]
      ? KIND_TO_FIELD[line.kind]
      : null

  const classified = classifyVenueLine(line.description, line.notes || line.role)
  let fieldKey = hinted

  if (!fieldKey) {
    if (isHireLike(text)) fieldKey = 'venue_hire'
    else if (isLightingLike(text)) fieldKey = 'lighting_hire'
    else if (isBacklineLike(text)) fieldKey = line.kind === 'backline' || !line.kind ? 'production_costs' : hinted
    else if (classified === 'production_costs') fieldKey = 'production_costs'
    else if (classified === 'venue_staff') fieldKey = 'venue_staff'
    else if (isCateringLike(text)) fieldKey = 'venue_staff'
  }

  if (line.kind === 'backline' || isBacklineLike(text)) {
    if (line.bandSide === true) {
      return {
        fieldKey: null,
        flags: [...flags, ADVANCING_SOFT_FLAG.g3BacklineBandVsVenue],
        skipReason: 'Band-side backline is Band Cost — not auto-applied to Production/AV',
      }
    }
    const group3 = (packet.runGroup ?? '').includes('3') || packet.runGroup === 'group3'
    if (group3 && line.bandSide == null) {
      flags.push(ADVANCING_SOFT_FLAG.g3BacklineBandVsVenue)
    }
    fieldKey = fieldKey ?? 'production_costs'
  }

  if (line.kind === 'catering' || line.kind === 'hospitality' || isCateringLike(text)) {
    if (line.riderAsStaff) {
      fieldKey = 'venue_staff'
    } else if (line.kind === 'catering' || line.kind === 'hospitality' || !fieldKey) {
      flags.push(ADVANCING_SOFT_FLAG.cateringRiderVsFb)
      fieldKey = fieldKey ?? 'venue_staff'
    }
  }

  if (line.kind === 'lighting' || fieldKey === 'lighting_hire') {
    fieldKey = 'lighting_hire'
  }
  if (line.kind === 'venue_hire' || fieldKey === 'venue_hire') {
    fieldKey = 'venue_hire'
  }

  if (fieldKey === 'venue_staff' && line.headcount > ADVANCING_CREW_HEADCOUNT_TARGET) {
    flags.push(ADVANCING_SOFT_FLAG.crewHeadcountOverTarget)
    flags.push(ADVANCING_SOFT_FLAG.crewOverTarget)
  }

  if (!fieldKey) {
    return { fieldKey: null, flags, skipReason: 'Could not classify line onto Staff / AV / lighting / hire' }
  }

  return { fieldKey, flags: [...new Set(flags)] }
}

export function planAdvancingApply(
  packet: ParsedAdvancingPacket,
  opts: { forceApply?: boolean; runGroup?: string | null } = {},
): AdvancingApplyPlan {
  const forceApply = Boolean(opts.forceApply)
  const runGroup = opts.runGroup ?? packet.runGroup
  const resolved: ParsedAdvancingPacket = { ...packet, runGroup }

  const skipped: PlannedAdvancingSkip[] = []
  const writes: PlannedAdvancingWrite[] = []
  const allFlags = [...packet.softFlags]

  if (!confidenceAllowsAutoWrite(packet.confidence, forceApply)) {
    return {
      status: 'queued',
      sourceNote: packet.sourceNote,
      packetConfidence: packet.confidence,
      messageId: packet.messageId,
      threadRef: packet.threadRef,
      evidenceSnippet: packet.evidenceSnippet,
      venueShortName: packet.venueShortName,
      writes: [],
      skipped: packet.lines.map(line => ({
        lineId: line.id,
        description: line.description,
        reason: 'Silence-as-accept: auto-apply high confidence only',
        softFlags: line.softFlags,
      })),
      softFlags: [...new Set([...allFlags, ...packet.lines.flatMap(l => l.softFlags)])],
      queueReason: `Packet confidence is ${packet.confidence ?? 'missing'} — Finance/Lead review (force-apply to write)`,
    }
  }

  for (const line of resolved.lines) {
    const lineConfidence = line.confidence ?? packet.confidence
    const resolvedLine = resolveFieldKey(line, resolved)
    allFlags.push(...resolvedLine.flags)

    if (!resolvedLine.fieldKey) {
      skipped.push({
        lineId: line.id,
        description: line.description,
        reason: resolvedLine.skipReason ?? 'Unclassified',
        softFlags: resolvedLine.flags,
      })
      continue
    }

    const fieldKey = resolvedLine.fieldKey
    const hireOk = packet.hireRenegotiated || line.hireRenegotiated
    const lightingReplaced = packet.lightingReplacedByVenuePackage || line.lightingReplacedByVenuePackage

    if (fieldKey === 'venue_hire') {
      if (!hireOk) {
        skipped.push({
          lineId: line.id,
          fieldKey,
          description: line.description,
          reason: 'Do not overwrite venue hire / Harbour deal unless the thread renegotiates hire',
          softFlags: [...resolvedLine.flags, ADVANCING_SOFT_FLAG.hireNotRenegotiated],
        })
        allFlags.push(ADVANCING_SOFT_FLAG.hireNotRenegotiated)
        // force cannot bypass — never write venue_hire without explicit renegotiation
        continue
      }
    }

    if (fieldKey === 'lighting_hire' && !lightingReplaced) {
      skipped.push({
        lineId: line.id,
        fieldKey,
        description: line.description,
        reason: `Lighting hire stays $${LIGHTING_HIRE_PER_RUN}/run unless Michael says the venue package replaces it`,
        softFlags: [
          ...resolvedLine.flags,
          ADVANCING_SOFT_FLAG.lightingDefaultKept,
          ADVANCING_SOFT_FLAG.lighting330KeepSeparate,
        ],
      })
      allFlags.push(ADVANCING_SOFT_FLAG.lightingDefaultKept)
      allFlags.push(ADVANCING_SOFT_FLAG.lighting330KeepSeparate)
      continue
    }

    if (!confidenceAllowsAutoWrite(lineConfidence, forceApply)) {
      skipped.push({
        lineId: line.id,
        fieldKey,
        description: line.description,
        reason: `Line confidence is ${lineConfidence ?? 'missing'} — not auto-written`,
        softFlags: resolvedLine.flags,
      })
      continue
    }

    const ambiguous = resolvedLine.flags.filter(flag => AMBIGUOUS_SOFT_FLAGS.has(flag))
    if (ambiguous.length > 0 && !forceApply) {
      skipped.push({
        lineId: line.id,
        fieldKey,
        description: line.description,
        reason: `Soft-flagged (${ambiguous.join(', ')}) — Finance/Lead review`,
        softFlags: resolvedLine.flags,
      })
      continue
    }

    const mode: 'entry' | 'role' = fieldKey === 'venue_staff' ? 'role' : 'entry'
    writes.push({
      lineId: line.id,
      fieldKey,
      mode,
      description: line.description,
      sourceNote: packet.sourceNote,
      amount: line.amount,
      gstIncluded: line.gstIncluded,
      role: line.role,
      rate: line.rate,
      hours: line.hours,
      headcount: line.headcount,
      confidence: lineConfidence,
      evidenceSnippet: line.evidenceSnippet ?? packet.evidenceSnippet,
      softFlags: [...new Set(resolvedLine.flags)],
      messageId: packet.messageId,
      threadRef: packet.threadRef,
    })
  }

  return {
    status: 'apply',
    sourceNote: packet.sourceNote,
    packetConfidence: packet.confidence,
    messageId: packet.messageId,
    threadRef: packet.threadRef,
    evidenceSnippet: packet.evidenceSnippet,
    venueShortName: packet.venueShortName,
    writes,
    skipped,
    softFlags: [...new Set(allFlags)],
  }
}

export function formatAdvancingApplyAuditCopy(opts: {
  actorName: string
  venueName: string
  sourceNote: string
  appliedCount: number
  supersededCount: number
}): { fieldName: string; oldValue: string | null; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  const venue = opts.venueName.trim() || 'this show'
  const applied = opts.appliedCount
  const superseded = opts.supersededCount
  const extra = superseded > 0
    ? ` Superseded ${superseded} prior advancing figure${superseded === 1 ? '' : 's'}.`
    : ''
  return {
    fieldName: AUDIT_FIELD_ADVANCING_APPLY,
    oldValue: null,
    newValue: `${actor} applied Michael advancing email (${opts.sourceNote}) on ${venue} — ${applied} line${applied === 1 ? '' : 's'} confirmed (figure accuracy).${extra}`,
  }
}

export function formatAdvancingSupersedeAuditCopy(opts: {
  actorName: string
  lineLabel: string
  oldAmount: number
  newAmount: number
  sourceNote: string
}): { fieldName: string; oldValue: string; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  const line = opts.lineLabel.trim() || 'a line'
  return {
    fieldName: AUDIT_FIELD_ADVANCING_SUPERSEDE,
    oldValue: String(opts.oldAmount),
    newValue: `${actor} superseded the advancing figure on ${line} from $${opts.oldAmount} to $${opts.newAmount} (Michael advancing email — ${opts.sourceNote}).`,
  }
}

export function advancingResultAuditSentences(opts: {
  actorName: string
  venueName: string
  sourceNote: string
  appliedCount: number
  superseded: Array<{ description: string; old_amount: number; new_amount: number }>
}): string[] {
  const sentences: string[] = []
  if (opts.appliedCount > 0) {
    sentences.push(formatAdvancingApplyAuditCopy({
      actorName: opts.actorName,
      venueName: opts.venueName,
      sourceNote: opts.sourceNote,
      appliedCount: opts.appliedCount,
      supersededCount: opts.superseded.length,
    }).newValue)
  }
  for (const item of opts.superseded) {
    sentences.push(formatAdvancingSupersedeAuditCopy({
      actorName: opts.actorName,
      lineLabel: item.description,
      oldAmount: item.old_amount,
      newAmount: item.new_amount,
      sourceNote: opts.sourceNote,
    }).newValue)
  }
  return sentences
}

function advancingMeta(write: PlannedAdvancingWrite): Record<string, unknown> {
  return {
    advancing_source: ADVANCING_SOURCE_KIND,
    advancing_message_id: write.messageId,
    advancing_thread_ref: write.threadRef,
    advancing_confidence: write.confidence,
    advancing_evidence_snippet: write.evidenceSnippet,
  }
}

function toAdvancingEntry(write: PlannedAdvancingWrite, id?: string): CostEntry {
  return {
    id: id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `adv-${write.lineId}`),
    description: write.description,
    notes: write.sourceNote,
    amount: write.amount,
    gst_included: write.gstIncluded,
    confirmed: false,
    paid: false,
    paid_at: null,
    attachment_path: null,
    attachment_filename: null,
    attachment_mime: null,
    quote_note: '',
    payables_document_id: null,
    ...advancingMeta(write),
  }
}

function toAdvancingRole(write: PlannedAdvancingWrite, id?: string): StaffLineItem {
  return {
    id: id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `adv-role-${write.lineId}`),
    role: write.role,
    rate: write.rate,
    hours: write.hours,
    headcount: write.headcount,
    source: write.sourceNote,
    confirmed: false,
    paid: false,
    paid_at: null,
    ...advancingMeta(write),
  }
}

function matchLabel(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function placeholderEntry(entry: CostEntry, fieldLabel: string): boolean {
  if (isAdvancingLine(entry)) return false
  if (entry.paid) return false
  const desc = entry.description.trim().toLowerCase()
  const label = fieldLabel.trim().toLowerCase()
  return entry.amount === 0 && (desc === label || desc === 'estimate' || desc === '')
}

function fieldDefFor(fieldKey: string) {
  return [...DEFINED_SHOW_COST_FIELDS, ...DEFINED_RUN_COST_FIELDS].find(f => f.key === fieldKey)
}

export async function applyAdvancingPlan(opts: {
  admin: SupabaseClient
  userId: string
  actorName: string
  runId: string
  showId: string
  venueName: string
  role: string
  packet: ParsedAdvancingPacket
  plan: AdvancingApplyPlan
  forceApply: boolean
}): Promise<AdvancingApplyResult> {
  const { admin, userId, actorName, runId, showId, venueName, role, packet, plan, forceApply } = opts

  const empty: AdvancingApplyResult = {
    status: plan.status === 'queued' ? 'queued' : 'applied',
    source_note: plan.sourceNote,
    apply_id: null,
    applied: [],
    skipped: plan.skipped,
    superseded: [],
    audit: [],
    soft_flags: plan.softFlags,
    queue_reason: plan.queueReason,
    fields: [],
  }

  if (plan.status === 'queued') {
    const applyId = await insertApplyRow(admin, {
      runId,
      showId,
      packet,
      plan,
      forceApply,
      userId,
      status: 'queued',
      result: empty,
    })
    return { ...empty, apply_id: applyId }
  }

  const allowedWrites = plan.writes.filter(write => {
    if (role === 'production' && !productionCanEditFieldKey(write.fieldKey)) {
      plan.skipped.push({
        lineId: write.lineId,
        fieldKey: write.fieldKey,
        description: write.description,
        reason: 'Production role cannot write this cost field',
        softFlags: write.softFlags,
      })
      return false
    }
    return true
  })

  const byField = new Map<string, PlannedAdvancingWrite[]>()
  for (const write of allowedWrites) {
    const list = byField.get(write.fieldKey) ?? []
    list.push(write)
    byField.set(write.fieldKey, list)
  }

  const { data: existingRows, error: loadErr } = await admin
    .from('cost_fields')
    .select('*')
    .eq('run_id', runId)
    .or(showScopedOrRun(showId, [...byField.keys()]))

  if (loadErr) throw new Error(loadErr.message)

  const rows = (existingRows ?? []) as Array<Record<string, unknown>>
  const rowByKey = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    const key = String(row.field_key)
    const sid = row.show_id ? String(row.show_id) : null
    if (key === 'lighting_hire' || key === 'backline_hire') {
      if (sid == null) rowByKey.set(key, row)
    } else if (sid === showId) {
      rowByKey.set(key, row)
    }
  }

  const applied: AdvancingApplyResult['applied'] = []
  const superseded: AdvancingApplyResult['superseded'] = []
  const updatedFields: Array<Record<string, unknown>> = []
  const auditRows: Parameters<typeof writeAuditLog>[2] = []

  for (const [fieldKey, writes] of byField) {
    const def = fieldDefFor(fieldKey)
    if (!def) continue
    const showScoped = def.scope === 'show'
    let row = rowByKey.get(fieldKey)
    if (!row) {
      const created = await createCostFieldRow(admin, {
        runId,
        showId: showScoped ? showId : null,
        fieldKey,
        label: def.label,
        category: def.category,
        userId,
      })
      row = created
      rowByKey.set(fieldKey, created)
    }

    const fieldLabel = String(row.label ?? def.label)
    const nextSource = hasPreservedSource(row.source as string | null)
      ? row.source
      : plan.sourceNote

    if (fieldKey === 'venue_staff') {
      const existingRoles = normalizeLineItems(row.line_items) ?? []
      const { roles, superseded: roleSupersedes } = upsertAdvancingRoles(existingRoles, writes)
      const value = lineItemsSum(roles)
      const patch = {
        line_items: roles,
        value: value === 0 ? null : value,
        state: CONFIRMED_FIELD_STATE,
        source: nextSource,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      }
      const { data, error } = await admin
        .from('cost_fields')
        .update(patch)
        .eq('id', row.id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      updatedFields.push(data as Record<string, unknown>)
      for (const write of writes) {
        applied.push({
          field_key: fieldKey,
          description: write.role,
          amount: write.rate * write.hours * write.headcount,
          mode: 'role',
        })
      }
      for (const item of roleSupersedes) {
        superseded.push({ field_key: fieldKey, ...item })
        const copy = formatAdvancingSupersedeAuditCopy({
          actorName,
          lineLabel: item.description,
          oldAmount: item.old_amount,
          newAmount: item.new_amount,
          sourceNote: plan.sourceNote,
        })
        auditRows.push({
          table_name: 'cost_fields',
          record_id: String(row.id),
          run_id: runId,
          field_name: copy.fieldName,
          old_value: copy.oldValue,
          new_value: copy.newValue,
          change_type: 'update',
        })
      }
      if (auditStringify(row.state) !== auditStringify(CONFIRMED_FIELD_STATE)) {
        auditRows.push({
          table_name: 'cost_fields',
          record_id: String(row.id),
          run_id: runId,
          field_name: 'state',
          old_value: auditStringify(row.state),
          new_value: CONFIRMED_FIELD_STATE,
          change_type: 'update',
        })
      }
      continue
    }

    const existingEntries = normalizeEntries(row.entries) ?? []
    const { entries, superseded: entrySupersedes } = upsertAdvancingEntries(
      existingEntries,
      writes,
      fieldLabel,
    )
    const value = entriesSum(entries)
    const patch = {
      entries,
      value,
      state: CONFIRMED_FIELD_STATE as CostFieldState,
      source: nextSource,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    }
    const { data, error } = await admin
      .from('cost_fields')
      .update(patch)
      .eq('id', row.id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    updatedFields.push(data as Record<string, unknown>)
    for (const write of writes) {
      applied.push({
        field_key: fieldKey,
        description: write.description,
        amount: write.amount,
        mode: 'entry',
      })
    }
    for (const item of entrySupersedes) {
      superseded.push({ field_key: fieldKey, ...item })
      const copy = formatAdvancingSupersedeAuditCopy({
        actorName,
        lineLabel: item.description,
        oldAmount: item.old_amount,
        newAmount: item.new_amount,
        sourceNote: plan.sourceNote,
      })
      auditRows.push({
        table_name: 'cost_fields',
        record_id: String(row.id),
        run_id: runId,
        field_name: copy.fieldName,
        old_value: copy.oldValue,
        new_value: copy.newValue,
        change_type: 'update',
      })
    }
    if (auditStringify(row.state) !== auditStringify(CONFIRMED_FIELD_STATE)) {
      auditRows.push({
        table_name: 'cost_fields',
        record_id: String(row.id),
        run_id: runId,
        field_name: 'state',
        old_value: auditStringify(row.state),
        new_value: CONFIRMED_FIELD_STATE,
        change_type: 'update',
      })
    }
  }

  if (applied.length > 0) {
    const summary = formatAdvancingApplyAuditCopy({
      actorName,
      venueName,
      sourceNote: plan.sourceNote,
      appliedCount: applied.length,
      supersededCount: superseded.length,
    })
    auditRows.unshift({
      table_name: 'shows',
      record_id: showId,
      run_id: runId,
      field_name: summary.fieldName,
      old_value: summary.oldValue,
      new_value: summary.newValue,
      change_type: 'update',
    })
  }

  if (auditRows.length) {
    await writeAuditLog(admin, userId, auditRows)
  }

  const status: AdvancingApplyResult['status'] = applied.length === 0
    ? (plan.skipped.length > 0 ? 'queued' : 'applied')
    : plan.skipped.length > 0 ? 'partial' : 'applied'

  const result: AdvancingApplyResult = {
    status,
    source_note: plan.sourceNote,
    apply_id: null,
    applied,
    skipped: plan.skipped,
    superseded,
    audit: advancingResultAuditSentences({
      actorName,
      venueName,
      sourceNote: plan.sourceNote,
      appliedCount: applied.length,
      superseded,
    }),
    soft_flags: plan.softFlags,
    queue_reason: status === 'queued' ? 'No lines were auto-written' : undefined,
    fields: updatedFields,
  }

  const applyId = await insertApplyRow(admin, {
    runId,
    showId,
    packet,
    plan,
    forceApply,
    userId,
    status,
    result,
  })
  return { ...result, apply_id: applyId }
}

function showScopedOrRun(showId: string, fieldKeys: string[]): string {
  const showKeys = fieldKeys.filter(k => k !== 'lighting_hire' && k !== 'backline_hire')
  const runKeys = fieldKeys.filter(k => k === 'lighting_hire' || k === 'backline_hire')
  const parts: string[] = []
  if (showKeys.length) parts.push(`and(show_id.eq.${showId},field_key.in.(${showKeys.join(',')}))`)
  if (runKeys.length) parts.push(`and(show_id.is.null,field_key.in.(${runKeys.join(',')}))`)
  return parts.join(',') || `show_id.eq.${showId}`
}

async function createCostFieldRow(
  admin: SupabaseClient,
  opts: {
    runId: string
    showId: string | null
    fieldKey: string
    label: string
    category: string
    userId: string
  },
): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .from('cost_fields')
    .insert({
      run_id: opts.runId,
      show_id: opts.showId,
      category: opts.category,
      field_key: opts.fieldKey,
      label: opts.label,
      value: null,
      state: 'guess',
      source: null,
      entries: [],
      line_items: opts.fieldKey === 'venue_staff' ? [] : null,
      updated_by: opts.userId,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Record<string, unknown>
}

function upsertAdvancingEntries(
  existing: CostEntry[],
  writes: PlannedAdvancingWrite[],
  fieldLabel: string,
): { entries: CostEntry[]; superseded: Array<{ description: string; old_amount: number; new_amount: number }> } {
  const superseded: Array<{ description: string; old_amount: number; new_amount: number }> = []
  const kept: CostEntry[] = []

  for (const entry of existing) {
    if (placeholderEntry(entry, fieldLabel)) continue
    const match = writes.find(write => matchLabel(write.description, entry.description))
    if (match && isAdvancingLine(entry)) {
      if (entryIsPaidLocked(entry)) {
        continue
      }
      superseded.push({
        description: entry.description,
        old_amount: entry.amount,
        new_amount: match.amount,
      })
      kept.push(toAdvancingEntry(match, entry.id))
      continue
    }
    kept.push(entry)
  }

  for (const write of writes) {
    if (kept.some(entry => matchLabel(entry.description, write.description) && isAdvancingLine(entry))) {
      continue
    }
    kept.push(toAdvancingEntry(write))
  }

  return { entries: kept, superseded }
}

function upsertAdvancingRoles(
  existing: StaffLineItem[],
  writes: PlannedAdvancingWrite[],
): { roles: StaffLineItem[]; superseded: Array<{ description: string; old_amount: number; new_amount: number }> } {
  const superseded: Array<{ description: string; old_amount: number; new_amount: number }> = []
  const kept: StaffLineItem[] = []

  for (const role of existing) {
    const match = writes.find(write => matchLabel(write.role, role.role))
    if (match && isAdvancingLine(role)) {
      if (entryIsPaidLocked(role)) continue
      const oldAmount = (role.rate || 0) * (role.hours || 0) * (role.headcount || 0)
      const newAmount = match.rate * match.hours * match.headcount
      superseded.push({ description: role.role, old_amount: oldAmount, new_amount: newAmount })
      kept.push(toAdvancingRole(match, role.id))
      continue
    }
    kept.push(role)
  }

  for (const write of writes) {
    if (kept.some(role => matchLabel(role.role, write.role) && isAdvancingLine(role))) continue
    kept.push(toAdvancingRole(write))
  }

  return { roles: kept, superseded }
}

async function insertApplyRow(
  admin: SupabaseClient,
  opts: {
    runId: string
    showId: string
    packet: ParsedAdvancingPacket
    plan: AdvancingApplyPlan
    forceApply: boolean
    userId: string
    status: AdvancingApplyResult['status']
    result: AdvancingApplyResult
  },
): Promise<string | null> {
  const { data, error } = await admin
    .from('advancing_extract_applies')
    .insert({
      run_id: opts.runId,
      show_id: opts.showId,
      venue_short_name: opts.packet.venueShortName,
      source_note: opts.plan.sourceNote,
      message_id: opts.plan.messageId,
      thread_ref: opts.plan.threadRef,
      confidence: opts.plan.packetConfidence,
      evidence_snippet: opts.plan.evidenceSnippet,
      packet: {
        schema: 'advancing-packet-v1',
        version: ADVANCING_PACKET_VERSION,
        venue_short_name: opts.packet.venueShortName,
        email_date: opts.packet.emailDate,
        message_id: opts.packet.messageId,
        thread_ref: opts.packet.threadRef,
        confidence: opts.packet.confidence,
        lines: opts.packet.lines.map(line => ({
          id: line.id,
          kind: line.kind,
          description: line.description,
          amount: line.amount,
          role: line.role,
          rate: line.rate,
          hours: line.hours,
          headcount: line.headcount,
          confidence: line.confidence,
          soft_flags: line.softFlags,
        })),
      },
      force_apply: opts.forceApply,
      status: opts.status,
      result: {
        applied: opts.result.applied,
        skipped: opts.result.skipped,
        superseded: opts.result.superseded,
        audit: opts.result.audit,
        soft_flags: opts.result.soft_flags,
        queue_reason: opts.result.queue_reason ?? null,
      },
      applied_by: opts.userId,
    })
    .select('id')
    .single()

  if (error) {
    console.error('advancing_extract_applies insert failed', error.message)
    return null
  }
  return data?.id ? String(data.id) : null
}

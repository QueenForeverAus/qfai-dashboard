/**
 * Plain-language Audit Trail formatter.
 *
 * Structured old/new stay in audit_log. This layer turns existing rows
 * (writeAuditLog + triggers) into one readable sentence per event so the UI
 * never asks anyone to decode field keys.
 */

import {
  AUDIT_FIELD_BULK_PAID,
  AUDIT_FIELD_LINE_MOVED,
  AUDIT_FIELD_PAID_ALSO_CONFIRMED,
  AUDIT_FIELD_PAID_RESTORE,
  AUDIT_FIELD_SECTION_CONFIRMED,
  DEFINED_RUN_COST_FIELDS,
  DEFINED_SHOW_COST_FIELDS,
} from './cost-fields.ts'
import {
  AUDIT_FIELD_BAND_COST_ADDED,
  AUDIT_FIELD_BAND_COST_STATUS,
  AUDIT_FIELD_FINALISE_COSTING,
} from './settlements.ts'
import { AUDIT_FIELD_BOOKED_COST_FREEZE } from './booked-cost-freeze.ts'
import {
  AUDIT_FIELD_QUOTE_ATTACHMENT,
  AUDIT_FIELD_QUOTE_NOTE,
} from './quote-invoice-stub.ts'
import {
  AUDIT_FIELD_CHALLENGE_DRAFT,
  AUDIT_FIELD_REMITTANCE_ACCEPTED,
  AUDIT_FIELD_REMITTANCE_ADDED,
  AUDIT_FIELD_REMITTANCE_RECTIFY,
  AUDIT_FIELD_RIGHTS_PAYER,
} from './remittance.ts'
import { staffDisplayName } from './cost-entry-source.ts'
import { formatBookingStatus } from './format-booking-status.ts'
import { formatDateAU } from './dates.ts'

export const AUDIT_TEXT_TRUNCATE = 80

export type AuditTrailRowInput = {
  id: string
  table_name?: string | null
  record_id?: string | null
  field_name: string | null
  old_value: string | null
  new_value: string | null
  change_type?: string | null
  changed_at: string
  changed_by_name: string | null
}

export type AuditTrailCostField = {
  id: string
  field_key?: string | null
  label?: string | null
  show_id?: string | null
  entries?: Array<{ id?: string | null; description?: string | null }> | null
  line_items?: Array<{ id?: string | null; role?: string | null }> | null
}

export type AuditTrailShow = {
  id: string
  venue_name?: string | null
}

export type AuditTrailAdvancement = {
  id: string
  label?: string | null
  item_key?: string | null
}

export type AuditTrailContext = {
  costFields?: AuditTrailCostField[]
  shows?: AuditTrailShow[]
  advancement?: AuditTrailAdvancement[]
}

export type FormattedAuditEvent = {
  id: string
  changed_at: string
  changed_by_name: string | null
  sentence: string
  kind: string
  record_id: string | null
  suppressWith?: string[]
}

const FIGURE_STATE: Record<string, string> = {
  known: 'KNOWN',
  estimated: 'ESTIMATE',
  guess: 'GUESS',
  pending: 'FIGURES NEEDED',
  figures_needed: 'FIGURES NEEDED',
  auto_calc: 'AUTO CALC',
}

const COST_FIELD_LABELS: Record<string, string> = Object.fromEntries(
  [...DEFINED_SHOW_COST_FIELDS, ...DEFINED_RUN_COST_FIELDS].map(f => [f.key, f.label]),
)

const SHOW_FIELD_LABELS: Record<string, string> = {
  venue_name: 'venue',
  venue_city: 'city',
  state_territory: 'state',
  show_date: 'show date',
  capacity: 'capacity',
  capacity_bands: 'capacity bands',
  ticket_price: 'ticket price',
  tickets_sold: 'tickets sold',
  ticket_outlook: 'Ticket Outlook',
  ticket_outlook_status: 'Ticket Outlook status',
  ticket_outlook_level: 'Ticket Outlook level',
  ticket_outlook_as_of: 'Ticket Outlook as-of date',
  ticket_outlook_sources: 'Ticket Outlook sources',
  harbour_status: 'harbour status',
  sell_through_pct: 'sell-through',
  venue_address: 'venue address',
  venue_phone: 'venue phone',
  venue_contact: 'venue contact',
  sets_label: 'sets',
  production_company: 'production company',
  production_contact: 'production contact',
  backline_company: 'backline company',
  backline_contact: 'backline contact',
  sched_access: 'access time',
  sched_soundcheck: 'soundcheck time',
  sched_dinner: 'dinner time',
  sched_doors: 'doors time',
  sched_show: 'show time',
  sched_finish: 'finish time',
  travel_access_notes: 'travel / access notes',
  hotel_notes: 'hotel notes',
  hospitality_merch_notes: 'hospitality / merch notes',
  michael_notes: "Michael's notes",
}

const RUN_FIELD_LABELS: Record<string, string> = {
  status: 'run status',
  name: 'run name',
  region: 'region',
  synopsis: 'synopsis',
  notes: 'run notes',
  ticket_outlook_summary: 'Ticket Outlook summary',
  flights_notes: 'flights notes',
  vehicles_notes: 'vehicles notes',
  hotels_overview_notes: 'hotels notes',
  show_pack_status: 'show-pack status',
  start_date: 'start date',
  end_date: 'end date',
}

const SKIP_FIELDS = new Set([
  'updated_at',
  'updated_by',
  'show_pack_published_at',
  'show_pack_published_by',
  'booked_cost_snapshot',
  'booked_cost_frozen_at',
  'booked_cost_frozen_by',
])

const NARRATIVE_FIELDS = new Set([
  AUDIT_FIELD_BULK_PAID,
  AUDIT_FIELD_PAID_ALSO_CONFIRMED,
  AUDIT_FIELD_PAID_RESTORE,
  AUDIT_FIELD_SECTION_CONFIRMED,
  AUDIT_FIELD_LINE_MOVED,
  AUDIT_FIELD_FINALISE_COSTING,
  AUDIT_FIELD_BOOKED_COST_FREEZE,
  AUDIT_FIELD_BAND_COST_ADDED,
  AUDIT_FIELD_BAND_COST_STATUS,
  AUDIT_FIELD_REMITTANCE_ADDED,
  AUDIT_FIELD_REMITTANCE_ACCEPTED,
  AUDIT_FIELD_REMITTANCE_RECTIFY,
  AUDIT_FIELD_CHALLENGE_DRAFT,
  AUDIT_FIELD_RIGHTS_PAYER,
  AUDIT_FIELD_QUOTE_NOTE,
  AUDIT_FIELD_QUOTE_ATTACHMENT,
])

export function formatAuditMoney(value: unknown): string {
  if (value == null || value === '') return '—'
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  const formatted = n.toLocaleString('en-AU', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return `$${formatted}`
}

export function formatFigureState(value: string | null | undefined): string {
  if (value == null || value === '') return '—'
  const key = String(value).trim().toLowerCase()
  return FIGURE_STATE[key] ?? String(value).replace(/_/g, ' ').toUpperCase()
}

export function truncateAuditText(value: string | null | undefined, max = AUDIT_TEXT_TRUNCATE): string {
  const text = (value ?? '').trim()
  if (!text) return '—'
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

export function quoteLabel(value: string): string {
  return `“${value}”`
}

function actorName(raw: string | null | undefined): string | null {
  const first = staffDisplayName(raw)
  if (!first) return null
  if (first.toLowerCase() === 'system') return null
  return first
}

function sentence(actor: string | null, rest: string): string {
  const body = rest.trim()
  if (!body) return ''
  if (!actor) return body.charAt(0).toUpperCase() + body.slice(1)
  return `${actor} ${body}`
}

function finish(text: string): string {
  const t = text.trim()
  if (!t) return t
  return /[.!?]$/.test(t) ? t : `${t}.`
}

function tryParseJson(raw: string | null | undefined): unknown {
  if (raw == null) return null
  const t = raw.trim()
  if (!t) return null
  if (t[0] !== '{' && t[0] !== '[') return null
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

function looksLikeSentence(text: string | null | undefined): boolean {
  if (!text) return false
  const t = text.trim()
  if (t.length < 12) return false
  if (t.startsWith('{') || t.startsWith('[')) return false
  if (t.includes(' → ') && t.length < 40) return false
  return (
    /^(Someone|\S+) (marked|restored|edited|confirmed|renamed|changed|added|removed|moved|updated|set|published|returned|unmarked|confirm-ticked|finalised|waived|entered|accepted|created|cleared|attached)\b/i.test(t)
    || (t.endsWith('.') && /[a-zA-Z]{3,} .+ /.test(t) && t.split(' ').length >= 5)
  )
}

function isTrue(value: unknown): boolean {
  if (value === true) return true
  const t = String(value ?? '').trim().toLowerCase()
  return t === 'true' || t === 't' || t === '1' || t === 'yes'
}

type ParsedField = {
  kind: string
  fieldKey?: string
  entryId?: string
  entryField?: string
  showField?: string
  runField?: string
  itemKey?: string
  advField?: string
}

export function parseAuditFieldName(fieldName: string | null | undefined): ParsedField {
  const raw = (fieldName ?? '').trim()
  if (!raw) return { kind: 'unknown' }
  if (NARRATIVE_FIELDS.has(raw)) return { kind: raw }

  const entry = raw.match(/^(?:([a-z0-9_]+)\.)?entries\[([^\]]+)\](?:\.(.+))?$/i)
  if (entry) {
    return {
      kind: 'entry',
      fieldKey: entry[1] || undefined,
      entryId: entry[2],
      entryField: entry[3] || '',
    }
  }

  const lineItem = raw.match(/^(?:([a-z0-9_]+)\.)?line_items\[([^\]]+)\](?:\.(.+))?$/i)
  if (lineItem) {
    return {
      kind: 'line_item',
      fieldKey: lineItem[1] || undefined,
      entryId: lineItem[2],
      entryField: lineItem[3] || '',
    }
  }

  if (raw.startsWith('shows.')) return { kind: 'show', showField: raw.slice('shows.'.length) }
  if (raw.startsWith('runs.')) return { kind: 'run', runField: raw.slice('runs.'.length) }
  if (raw.startsWith('advancement.')) {
    const rest = raw.slice('advancement.'.length)
    const dot = rest.lastIndexOf('.')
    if (dot > 0) {
      return { kind: 'advancement', itemKey: rest.slice(0, dot), advField: rest.slice(dot + 1) }
    }
    return { kind: 'advancement', itemKey: rest, advField: '' }
  }

  const cost = raw.match(/^([a-z0-9_]+)\.(value|state|source|label|line_items|entries|verified_by|assigned_to)$/)
  if (cost) return { kind: cost[2], fieldKey: cost[1] }

  return { kind: raw }
}

function costLabel(
  ctx: AuditTrailContext,
  recordId: string | null | undefined,
  fieldKey?: string,
): string {
  const field = (ctx.costFields ?? []).find(f => f.id === recordId)
  if (field?.label?.trim()) return field.label.trim()
  const key = fieldKey || field?.field_key || ''
  if (key && COST_FIELD_LABELS[key]) return COST_FIELD_LABELS[key]
  if (key) return key.replace(/_/g, ' ')
  return 'this section'
}

function showLabel(
  ctx: AuditTrailContext,
  recordId: string | null | undefined,
  costFieldId?: string | null,
): string | null {
  const show = (ctx.shows ?? []).find(s => s.id === recordId)
  if (show?.venue_name?.trim()) return show.venue_name.trim()
  const field = (ctx.costFields ?? []).find(f => f.id === (costFieldId ?? recordId))
  if (field?.show_id) {
    const via = (ctx.shows ?? []).find(s => s.id === field.show_id)
    if (via?.venue_name?.trim()) return via.venue_name.trim()
  }
  return null
}

function matchPayableId(
  id: string | null | undefined,
  entryId: string,
): boolean {
  const raw = String(id ?? '')
  if (!raw) return false
  return raw === entryId || raw.startsWith(entryId) || entryId.startsWith(raw.slice(0, 8))
}

function entryLabel(
  ctx: AuditTrailContext,
  recordId: string | null | undefined,
  entryId: string | undefined,
  fallback?: string | null,
): string {
  if (fallback?.trim()) return fallback.trim()
  if (!entryId) return 'a line'
  const field = (ctx.costFields ?? []).find(f => f.id === recordId)
  const match = (field?.entries ?? []).find(e => matchPayableId(e.id, entryId))
  const desc = match?.description?.trim()
  if (desc) return desc
  return 'a line'
}

function roleLabel(
  ctx: AuditTrailContext,
  recordId: string | null | undefined,
  entryId: string | undefined,
  fallback?: string | null,
): string {
  if (fallback?.trim()) return fallback.trim()
  if (!entryId) return 'a role'
  const field = (ctx.costFields ?? []).find(f => f.id === recordId)
  const match = (field?.line_items ?? []).find(e => matchPayableId(e.id, entryId))
  const role = match?.role?.trim()
  if (role) return role
  return 'a role'
}

function advancementLabel(
  ctx: AuditTrailContext,
  recordId: string | null | undefined,
  itemKey?: string,
): string {
  const row = (ctx.advancement ?? []).find(a => a.id === recordId)
  if (row?.label?.trim()) return row.label.trim()
  const key = itemKey || row?.item_key || ''
  const byKey = key ? (ctx.advancement ?? []).find(a => a.item_key === key) : undefined
  if (byKey?.label?.trim()) return byKey.label.trim()
  if (key) return key.replace(/_/g, ' ')
  return 'an advancement item'
}

function entryFromJson(raw: unknown): { id?: string; description?: string; amount?: number } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const description = row.description != null ? String(row.description) : undefined
  const amount = row.amount != null && Number.isFinite(Number(row.amount)) ? Number(row.amount) : undefined
  const id = row.id != null ? String(row.id) : undefined
  return { id, description, amount }
}

function roleFromJson(raw: unknown): { id?: string; role?: string } | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const role = row.role != null ? String(row.role) : undefined
  const id = row.id != null ? String(row.id) : undefined
  return { id, role }
}

function onlyPaidSnapshotChanged(oldRaw: string | null, newRaw: string | null): boolean {
  const oldVal = tryParseJson(oldRaw)
  const newVal = tryParseJson(newRaw)
  if (!Array.isArray(oldVal) || !Array.isArray(newVal)) return false
  if (oldVal.length !== newVal.length) return false
  const strip = (row: unknown) => {
    if (!row || typeof row !== 'object') return row
    const copy = { ...(row as Record<string, unknown>) }
    delete copy.paid_snapshot
    return copy
  }
  try {
    return JSON.stringify(oldVal.map(strip)) === JSON.stringify(newVal.map(strip))
  } catch {
    return false
  }
}

function meaningfulEntryChange(prev: Record<string, unknown>, next: Record<string, unknown>): string[] {
  const label = String(next.description ?? prev.description ?? 'a line').trim() || 'a line'
  const changes: string[] = []
  if (String(prev.amount ?? '') !== String(next.amount ?? '')) {
    changes.push(`edited ${label} from ${formatAuditMoney(prev.amount)} to ${formatAuditMoney(next.amount)}`)
  }
  if (String(prev.description ?? '') !== String(next.description ?? '')) {
    changes.push(`renamed ${quoteLabel(String(prev.description ?? ''))} to ${quoteLabel(String(next.description ?? ''))}`)
  }
  if (String(prev.notes ?? '') !== String(next.notes ?? '')) {
    changes.push(`updated Notes on ${label} from ${quoteLabel(truncateAuditText(String(prev.notes ?? '')))} to ${quoteLabel(truncateAuditText(String(next.notes ?? '')))}`)
  }
  if (String(prev.quote_note ?? '') !== String(next.quote_note ?? '')) {
    const nextNote = String(next.quote_note ?? '').trim()
    changes.push(nextNote
      ? `updated the quote/invoice note on ${label}`
      : `cleared the quote/invoice note on ${label}`)
  }
  if (String(prev.attachment_filename ?? '') !== String(next.attachment_filename ?? '')) {
    const nextFile = String(next.attachment_filename ?? '').trim()
    const prevFile = String(prev.attachment_filename ?? '').trim()
    changes.push(nextFile
      ? `added a quote/invoice file ${nextFile} on ${label}`
      : `removed the quote/invoice file ${prevFile || 'attachment'} from ${label}`)
  }
  if (Boolean(prev.gst_included) !== Boolean(next.gst_included)) {
    changes.push(`set GST on ${label} to ${next.gst_included ? 'included' : 'excluded'} (was ${prev.gst_included ? 'included' : 'excluded'})`)
  }
  if (Boolean(prev.confirmed) !== Boolean(next.confirmed)) {
    changes.push(next.confirmed ? `confirm-ticked ${label}` : `removed the confirm tick from ${label}`)
  }
  if (Boolean(prev.paid) !== Boolean(next.paid)) {
    changes.push(next.paid
      ? `marked ${label} as PAID (line locked)`
      : `marked ${label} unpaid (line unlocked)`)
  }
  return changes
}

function meaningfulRoleChange(prev: Record<string, unknown>, next: Record<string, unknown>): string[] {
  const label = String(next.role ?? prev.role ?? 'a role').trim() || 'a role'
  const changes: string[] = []
  if (String(prev.role ?? '') !== String(next.role ?? '')) {
    changes.push(`renamed ${quoteLabel(String(prev.role ?? ''))} to ${quoteLabel(String(next.role ?? ''))}`)
  }
  if (String(prev.source ?? '') !== String(next.source ?? '')) {
    changes.push(`updated Notes on ${label} from ${quoteLabel(truncateAuditText(String(prev.source ?? '')))} to ${quoteLabel(truncateAuditText(String(next.source ?? '')))}`)
  }
  if (String(prev.rate ?? '') !== String(next.rate ?? '')) {
    changes.push(`edited ${label} rate from ${prev.rate ?? '—'} to ${next.rate ?? '—'}`)
  }
  if (String(prev.hours ?? '') !== String(next.hours ?? '')) {
    changes.push(`edited ${label} hours from ${prev.hours ?? '—'} to ${next.hours ?? '—'}`)
  }
  if (String(prev.headcount ?? '') !== String(next.headcount ?? '')) {
    changes.push(`edited ${label} headcount from ${prev.headcount ?? '—'} to ${next.headcount ?? '—'}`)
  }
  if (Boolean(prev.confirmed) !== Boolean(next.confirmed)) {
    changes.push(next.confirmed ? `confirm-ticked ${label}` : `removed the confirm tick from ${label}`)
  }
  if (Boolean(prev.paid) !== Boolean(next.paid)) {
    changes.push(next.paid
      ? `marked ${label} as PAID (role locked)`
      : `marked ${label} unpaid (role unlocked)`)
  }
  return changes
}

function onlyInternalEntryKeysChanged(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  const strip = (row: Record<string, unknown>) => {
    const copy = { ...row }
    delete copy.paid_snapshot
    delete copy.paid_at
    return copy
  }
  try {
    return JSON.stringify(strip(prev)) === JSON.stringify(strip(next))
  } catch {
    return false
  }
}

function formatEntriesJsonDiff(
  actor: string | null,
  section: string,
  oldRaw: string | null,
  newRaw: string | null,
): { sentence: string; kind: string } | null {
  const oldVal = tryParseJson(oldRaw)
  const newVal = tryParseJson(newRaw)
  if (!Array.isArray(oldVal) || !Array.isArray(newVal)) return null
  if (onlyPaidSnapshotChanged(oldRaw, newRaw)) return null

  const oldById = new Map<string, Record<string, unknown>>()
  const newById = new Map<string, Record<string, unknown>>()
  for (const row of oldVal) {
    if (row && typeof row === 'object' && (row as { id?: unknown }).id) {
      oldById.set(String((row as { id: unknown }).id), row as Record<string, unknown>)
    }
  }
  for (const row of newVal) {
    if (row && typeof row === 'object' && (row as { id?: unknown }).id) {
      newById.set(String((row as { id: unknown }).id), row as Record<string, unknown>)
    }
  }
  if (oldById.size === 0 && newById.size === 0) return null

  const added: string[] = []
  const removed: string[] = []
  const changes: string[] = []

  for (const [id, row] of newById) {
    if (!oldById.has(id)) {
      const desc = String(row.description ?? 'a line').trim() || 'a line'
      added.push(desc)
    }
  }
  for (const [id, row] of oldById) {
    if (!newById.has(id)) {
      const desc = String(row.description ?? 'a line').trim() || 'a line'
      removed.push(desc)
    }
  }
  for (const [id, next] of newById) {
    const prev = oldById.get(id)
    if (!prev) continue
    changes.push(...meaningfulEntryChange(prev, next).map(bit => (
      bit.startsWith('confirm-ticked') ? `${bit} in ${section}`
        : bit.startsWith('removed the confirm tick') ? `${bit} in ${section}`
        : bit
    )))
  }

  const bits: string[] = []
  if (added.length) bits.push(`added ${added.map(quoteLabel).join(', ')} to ${section}`)
  if (removed.length) bits.push(`removed ${removed.map(quoteLabel).join(', ')} from ${section}`)
  bits.push(...changes)
  if (!bits.length) return null
  if (bits.length === 1) {
    const kind = bits[0].startsWith('added') ? 'entry-add'
      : bits[0].startsWith('removed') ? 'entry-remove'
      : bits[0].startsWith('edited') ? 'entry-amount'
      : bits[0].includes('PAID') ? 'entry-paid'
      : bits[0].includes('confirm') ? 'entry-confirmed'
      : 'entry-other'
    return { sentence: finish(sentence(actor, bits[0])), kind }
  }
  return { sentence: finish(sentence(actor, bits.join('; '))), kind: 'entry-multi' }
}

function formatLineItemsJsonDiff(
  actor: string | null,
  section: string,
  oldRaw: string | null,
  newRaw: string | null,
): { sentence: string; kind: string } | null {
  const oldVal = tryParseJson(oldRaw)
  const newVal = tryParseJson(newRaw)
  if (!Array.isArray(oldVal) || !Array.isArray(newVal)) return null
  if (onlyPaidSnapshotChanged(oldRaw, newRaw)) return null

  const oldById = new Map<string, Record<string, unknown>>()
  const newById = new Map<string, Record<string, unknown>>()
  for (const row of oldVal) {
    if (row && typeof row === 'object' && (row as { id?: unknown }).id) {
      oldById.set(String((row as { id: unknown }).id), row as Record<string, unknown>)
    }
  }
  for (const row of newVal) {
    if (row && typeof row === 'object' && (row as { id?: unknown }).id) {
      newById.set(String((row as { id: unknown }).id), row as Record<string, unknown>)
    }
  }
  if (oldById.size === 0 && newById.size === 0) return null

  const added: string[] = []
  const removed: string[] = []
  const changes: string[] = []

  for (const [id, row] of newById) {
    if (!oldById.has(id)) {
      const role = String(row.role ?? 'a role').trim() || 'a role'
      added.push(role)
    }
  }
  for (const [id, row] of oldById) {
    if (!newById.has(id)) {
      const role = String(row.role ?? 'a role').trim() || 'a role'
      removed.push(role)
    }
  }
  for (const [id, next] of newById) {
    const prev = oldById.get(id)
    if (!prev) continue
    changes.push(...meaningfulRoleChange(prev, next).map(bit => (
      bit.startsWith('confirm-ticked') ? `${bit} in ${section}`
        : bit.startsWith('removed the confirm tick') ? `${bit} in ${section}`
        : bit
    )))
  }

  const bits: string[] = []
  if (added.length) bits.push(`added ${added.map(quoteLabel).join(', ')} to planned roles on ${section}`)
  if (removed.length) bits.push(`removed ${removed.map(quoteLabel).join(', ')} from planned roles on ${section}`)
  bits.push(...changes)
  if (!bits.length) return null
  if (bits.length === 1) {
    const kind = bits[0].startsWith('added') ? 'role-add'
      : bits[0].startsWith('removed') ? 'role-remove'
      : bits[0].includes('PAID') ? 'role-paid'
      : bits[0].includes('confirm') ? 'role-confirmed'
      : 'role-other'
    return { sentence: finish(sentence(actor, bits[0])), kind }
  }
  return { sentence: finish(sentence(actor, bits.join('; '))), kind: 'role-multi' }
}

function formatLineMoved(
  actor: string | null,
  oldValue: string | null,
  newValue: string | null,
): string {
  const oldJson = tryParseJson(oldValue) as { line?: string; from?: string } | null
  const newJson = tryParseJson(newValue) as { line?: string; to?: string; from?: string } | null
  if (oldJson && newJson && (oldJson.line || newJson.line)) {
    const line = String(newJson.line ?? oldJson.line ?? 'a line')
    const from = String(oldJson.from ?? 'another section')
    const to = String(newJson.to ?? 'another section')
    return finish(sentence(actor, `moved ${quoteLabel(line)} from ${from} to ${to}`))
  }
  if (looksLikeSentence(newValue)) return finish(newValue!)
  return finish(sentence(actor, `moved a line from ${oldValue ?? 'one section'} to ${newValue ?? 'another section'}`))
}

function polishNarrative(fieldName: string, text: string): string {
  let out = text.trim()
  if (fieldName === AUDIT_FIELD_PAID_RESTORE) {
    out = out.replace(/\brestored prior PAID snapshot\b/, 'restored the prior PAID snapshot')
  }
  return finish(out)
}

function formatValuePair(
  actor: string | null,
  verbTarget: string,
  oldValue: string | null,
  newValue: string | null,
  opts?: { money?: boolean; state?: boolean; booking?: boolean; date?: boolean; quote?: boolean },
): string {
  const fmt = (v: string | null) => {
    if (v == null || v === '') return '—'
    if (opts?.money) return formatAuditMoney(v)
    if (opts?.state) return formatFigureState(v)
    if (opts?.booking) return formatBookingStatus(v)
    if (opts?.date) return formatDateAU(v)
    if (opts?.quote) return quoteLabel(truncateAuditText(v))
    return truncateAuditText(v)
  }
  return finish(sentence(actor, `changed ${verbTarget} from ${fmt(oldValue)} to ${fmt(newValue)}`))
}

export function formatAuditEvent(
  row: AuditTrailRowInput,
  ctx: AuditTrailContext = {},
): FormattedAuditEvent | null {
  const fieldName = (row.field_name ?? '').trim()
  const parsed = parseAuditFieldName(fieldName)
  const actor = actorName(row.changed_by_name)
  const recordId = row.record_id ?? null
  const table = row.table_name ?? ''

  if (SKIP_FIELDS.has(parsed.kind) || SKIP_FIELDS.has(fieldName)) return null
  if (fieldName.endsWith('.updated_at') || fieldName.endsWith('.updated_by')) return null

  if (row.change_type === 'insert' && !actor) return null

  if (NARRATIVE_FIELDS.has(fieldName) || NARRATIVE_FIELDS.has(parsed.kind)) {
    if (fieldName === AUDIT_FIELD_LINE_MOVED || parsed.kind === AUDIT_FIELD_LINE_MOVED) {
      return {
        id: row.id,
        changed_at: row.changed_at,
        changed_by_name: actor,
        sentence: formatLineMoved(actor, row.old_value, row.new_value),
        kind: 'narrative-move',
        record_id: recordId,
      }
    }
    const raw = looksLikeSentence(row.new_value) ? row.new_value! : null
    if (raw) {
      return {
        id: row.id,
        changed_at: row.changed_at,
        changed_by_name: actor,
        sentence: polishNarrative(fieldName, raw),
        kind: fieldName === AUDIT_FIELD_BULK_PAID ? 'narrative-bulk-paid'
          : fieldName === AUDIT_FIELD_PAID_RESTORE ? 'narrative-restore'
          : fieldName === AUDIT_FIELD_FINALISE_COSTING ? 'narrative-finalise'
          : fieldName === AUDIT_FIELD_BAND_COST_ADDED ? 'narrative-band-cost'
          : fieldName === AUDIT_FIELD_BAND_COST_STATUS ? 'narrative-band-cost-status'
          : fieldName === AUDIT_FIELD_QUOTE_NOTE ? 'narrative-quote-note'
          : fieldName === AUDIT_FIELD_QUOTE_ATTACHMENT ? 'narrative-quote-attachment'
          : 'narrative',
        record_id: recordId,
      }
    }
  }

  if (looksLikeSentence(row.new_value) && !tryParseJson(row.new_value)) {
    return {
      id: row.id,
      changed_at: row.changed_at,
      changed_by_name: actor,
      sentence: polishNarrative(fieldName, row.new_value!),
      kind: 'narrative',
      record_id: recordId,
    }
  }

  const section = costLabel(ctx, recordId, parsed.fieldKey)
  const venue = showLabel(ctx, table === 'shows' ? recordId : null, recordId)

  if (parsed.kind === 'entry') {
    const line = entryLabel(
      ctx,
      recordId,
      parsed.entryId,
      entryFromJson(tryParseJson(row.new_value) ?? tryParseJson(row.old_value))?.description,
    )
    const entryField = parsed.entryField ?? ''

    if (!entryField) {
      if (row.old_value && !row.new_value) {
        return {
          id: row.id, changed_at: row.changed_at, changed_by_name: actor,
          sentence: finish(sentence(actor, `removed ${quoteLabel(line)} from ${section}`)),
          kind: 'entry-remove', record_id: recordId,
          suppressWith: ['narrative-move', 'narrative-bulk-paid', 'narrative-restore'],
        }
      }
      if (!row.old_value && row.new_value) {
        const parsedEntry = entryFromJson(tryParseJson(row.new_value))
        const name = parsedEntry?.description?.trim() || line
        const amt = parsedEntry?.amount != null ? ` (${formatAuditMoney(parsedEntry.amount)})` : ''
        return {
          id: row.id, changed_at: row.changed_at, changed_by_name: actor,
          sentence: finish(sentence(actor, `added ${quoteLabel(name)}${amt} to ${section}`)),
          kind: 'entry-add', record_id: recordId,
          suppressWith: ['narrative-move'],
        }
      }
      const jsonDiff = formatEntriesJsonDiff(actor, section, row.old_value, row.new_value)
      if (jsonDiff) {
        return {
          id: row.id, changed_at: row.changed_at, changed_by_name: actor,
          sentence: jsonDiff.sentence, kind: jsonDiff.kind, record_id: recordId,
          suppressWith: ['narrative-bulk-paid', 'narrative-restore', 'narrative-move'],
        }
      }
      const oldObj = tryParseJson(row.old_value)
      const newObj = tryParseJson(row.new_value)
      if (
        oldObj && newObj
        && typeof oldObj === 'object' && typeof newObj === 'object'
        && !Array.isArray(oldObj) && !Array.isArray(newObj)
      ) {
        const prev = oldObj as Record<string, unknown>
        const next = newObj as Record<string, unknown>
        if (onlyInternalEntryKeysChanged(prev, next)) return null
        const bits = meaningfulEntryChange(prev, next).map(bit => (
          bit.startsWith('confirm-ticked') ? `${bit} in ${section}`
            : bit.startsWith('removed the confirm tick') ? `${bit} in ${section}`
            : bit
        ))
        if (!bits.length) return null
        const kind = bits[0].startsWith('edited') ? 'entry-amount'
          : bits[0].includes('PAID') ? 'entry-paid'
          : bits[0].includes('confirm') ? 'entry-confirmed'
          : 'entry-other'
        return {
          id: row.id, changed_at: row.changed_at, changed_by_name: actor,
          sentence: finish(sentence(actor, bits.join('; '))),
          kind,
          record_id: recordId,
          suppressWith: ['narrative-bulk-paid', 'narrative-restore', 'narrative-move'],
        }
      }
    }

    if (entryField === 'amount') {
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, `edited ${line} from ${formatAuditMoney(row.old_value)} to ${formatAuditMoney(row.new_value)}`)),
        kind: 'entry-amount', record_id: recordId,
      }
    }
    if (entryField === 'description') {
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, `renamed ${quoteLabel(row.old_value ?? '')} to ${quoteLabel(row.new_value ?? '')}`)),
        kind: 'entry-rename', record_id: recordId,
      }
    }
    if (entryField === 'notes') {
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, `updated Notes on ${line} from ${quoteLabel(truncateAuditText(row.old_value))} to ${quoteLabel(truncateAuditText(row.new_value))}`)),
        kind: 'entry-notes', record_id: recordId,
      }
    }
    if (entryField === 'quote_note') {
      const nextNote = (row.new_value ?? '').trim()
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, nextNote
          ? `updated the quote/invoice note on ${line}`
          : `cleared the quote/invoice note on ${line}`)),
        kind: 'entry-quote-note', record_id: recordId,
      }
    }
    if (entryField === 'attachment_filename') {
      const nextFile = (row.new_value ?? '').trim()
      const prevFile = (row.old_value ?? '').trim()
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, nextFile
          ? `added a quote/invoice file ${nextFile} on ${line}`
          : `removed the quote/invoice file ${prevFile || 'attachment'} from ${line}`)),
        kind: 'entry-quote-attachment', record_id: recordId,
      }
    }
    if (entryField === 'gst_included') {
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, `set GST on ${line} to ${isTrue(row.new_value) ? 'included' : 'excluded'} (was ${isTrue(row.old_value) ? 'included' : 'excluded'})`)),
        kind: 'entry-gst', record_id: recordId,
      }
    }
    if (entryField === 'confirmed') {
      const ticked = isTrue(row.new_value)
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, ticked
          ? `confirm-ticked ${line} in ${section}`
          : `removed the confirm tick from ${line} in ${section}`)),
        kind: 'entry-confirmed', record_id: recordId,
        suppressWith: ['narrative', 'narrative-bulk-paid'],
      }
    }
    if (entryField === 'paid' || entryField === 'paid_at') {
      if (entryField === 'paid_at') return null
      const paid = isTrue(row.new_value)
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, paid
          ? `marked ${line} as PAID (line locked)`
          : `marked ${line} unpaid (line unlocked)`)),
        kind: 'entry-paid', record_id: recordId,
        suppressWith: ['narrative-bulk-paid', 'narrative-restore'],
      }
    }
  }

  if (parsed.kind === 'line_item') {
    const role = roleLabel(
      ctx,
      recordId,
      parsed.entryId,
      roleFromJson(tryParseJson(row.new_value) ?? tryParseJson(row.old_value))?.role,
    )
    const roleField = parsed.entryField ?? ''

    if (!roleField) {
      if (row.old_value && !row.new_value) {
        return {
          id: row.id, changed_at: row.changed_at, changed_by_name: actor,
          sentence: finish(sentence(actor, `removed ${quoteLabel(role)} from planned roles on ${section}`)),
          kind: 'role-remove', record_id: recordId,
          suppressWith: ['narrative-move', 'narrative-bulk-paid', 'narrative-restore'],
        }
      }
      if (!row.old_value && row.new_value) {
        const parsedRole = roleFromJson(tryParseJson(row.new_value))
        const name = parsedRole?.role?.trim() || role
        return {
          id: row.id, changed_at: row.changed_at, changed_by_name: actor,
          sentence: finish(sentence(actor, `added ${quoteLabel(name)} to planned roles on ${section}`)),
          kind: 'role-add', record_id: recordId,
          suppressWith: ['narrative-move'],
        }
      }
      const jsonDiff = formatLineItemsJsonDiff(actor, section, row.old_value, row.new_value)
      if (jsonDiff) {
        return {
          id: row.id, changed_at: row.changed_at, changed_by_name: actor,
          sentence: jsonDiff.sentence, kind: jsonDiff.kind, record_id: recordId,
          suppressWith: ['narrative-bulk-paid', 'narrative-restore', 'narrative-move'],
        }
      }
      const oldObj = tryParseJson(row.old_value)
      const newObj = tryParseJson(row.new_value)
      if (
        oldObj && newObj
        && typeof oldObj === 'object' && typeof newObj === 'object'
        && !Array.isArray(oldObj) && !Array.isArray(newObj)
      ) {
        const prev = oldObj as Record<string, unknown>
        const next = newObj as Record<string, unknown>
        if (onlyInternalEntryKeysChanged(prev, next)) return null
        const bits = meaningfulRoleChange(prev, next).map(bit => (
          bit.startsWith('confirm-ticked') ? `${bit} in ${section}`
            : bit.startsWith('removed the confirm tick') ? `${bit} in ${section}`
            : bit
        ))
        if (!bits.length) return null
        const kind = bits[0].includes('PAID') ? 'role-paid'
          : bits[0].includes('confirm') ? 'role-confirmed'
          : 'role-other'
        return {
          id: row.id, changed_at: row.changed_at, changed_by_name: actor,
          sentence: finish(sentence(actor, bits.join('; '))),
          kind,
          record_id: recordId,
          suppressWith: ['narrative-bulk-paid', 'narrative-restore', 'narrative-move'],
        }
      }
    }

    if (roleField === 'role') {
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, `renamed ${quoteLabel(row.old_value ?? '')} to ${quoteLabel(row.new_value ?? '')}`)),
        kind: 'role-rename', record_id: recordId,
      }
    }
    if (roleField === 'source') {
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, `updated Notes on ${role} from ${quoteLabel(truncateAuditText(row.old_value))} to ${quoteLabel(truncateAuditText(row.new_value))}`)),
        kind: 'role-notes', record_id: recordId,
      }
    }
    if (roleField === 'rate' || roleField === 'hours' || roleField === 'headcount') {
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, `edited ${role} ${roleField} from ${row.old_value ?? '—'} to ${row.new_value ?? '—'}`)),
        kind: 'role-amount', record_id: recordId,
      }
    }
    if (roleField === 'confirmed') {
      const ticked = isTrue(row.new_value)
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, ticked
          ? `confirm-ticked ${role} in ${section}`
          : `removed the confirm tick from ${role} in ${section}`)),
        kind: 'role-confirmed', record_id: recordId,
        suppressWith: ['narrative', 'narrative-bulk-paid'],
      }
    }
    if (roleField === 'paid' || roleField === 'paid_at') {
      if (roleField === 'paid_at') return null
      const paid = isTrue(row.new_value)
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, paid
          ? `marked ${role} as PAID (role locked)`
          : `marked ${role} unpaid (role unlocked)`)),
        kind: 'role-paid', record_id: recordId,
        suppressWith: ['narrative-bulk-paid', 'narrative-restore'],
      }
    }
  }

  if (parsed.kind === 'value' || fieldName === 'value') {
    return {
      id: row.id, changed_at: row.changed_at, changed_by_name: actor,
      sentence: finish(sentence(actor, `edited ${section} from ${formatAuditMoney(row.old_value)} to ${formatAuditMoney(row.new_value)}`)),
      kind: 'section-value', record_id: recordId,
      suppressWith: ['entry-amount', 'entry-add', 'entry-remove', 'entry-multi', 'narrative-bulk-paid', 'narrative-restore', 'narrative-move'],
    }
  }

  if (parsed.kind === 'state' || fieldName === 'state') {
    const next = formatFigureState(row.new_value)
    const prev = formatFigureState(row.old_value)
    return {
      id: row.id, changed_at: row.changed_at, changed_by_name: actor,
      sentence: finish(sentence(actor, `marked ${section} as ${next} (was ${prev})`)),
      kind: 'state', record_id: recordId,
      suppressWith: ['narrative'],
    }
  }

  if (parsed.kind === 'source' || fieldName === 'source') {
    return {
      id: row.id, changed_at: row.changed_at, changed_by_name: actor,
      sentence: finish(sentence(actor, `updated Source of Data on ${section} from ${quoteLabel(truncateAuditText(row.old_value))} to ${quoteLabel(truncateAuditText(row.new_value))}`)),
      kind: 'source', record_id: recordId,
    }
  }

  if (parsed.kind === 'label' || fieldName === 'label') {
    const target = table === 'advancement_items'
      ? `advancement item ${quoteLabel(row.old_value ?? '')}`
      : quoteLabel(row.old_value ?? section)
    return {
      id: row.id, changed_at: row.changed_at, changed_by_name: actor,
      sentence: finish(sentence(actor, `renamed ${target} to ${quoteLabel(row.new_value ?? '')}`)),
      kind: 'rename', record_id: recordId,
    }
  }

  if (parsed.kind === 'line_items' || fieldName === 'line_items' || fieldName.endsWith('.line_items')) {
    const jsonDiff = formatLineItemsJsonDiff(actor, section, row.old_value, row.new_value)
    if (jsonDiff) {
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: jsonDiff.sentence, kind: jsonDiff.kind, record_id: recordId,
        suppressWith: ['role-amount', 'role-add', 'role-remove', 'role-confirmed', 'role-paid', 'role-notes', 'role-rename', 'narrative-bulk-paid', 'narrative-restore', 'narrative-move'],
      }
    }
    return {
      id: row.id, changed_at: row.changed_at, changed_by_name: actor,
      sentence: finish(sentence(actor, `updated planned roles on ${section}`)),
      kind: 'line-items', record_id: recordId,
      suppressWith: ['narrative-move', 'role-confirmed', 'role-paid', 'narrative-bulk-paid', 'narrative-restore'],
    }
  }

  if (parsed.kind === 'entries' || fieldName === 'entries') {
    const jsonDiff = formatEntriesJsonDiff(actor, section, row.old_value, row.new_value)
    if (!jsonDiff) return null
    return {
      id: row.id, changed_at: row.changed_at, changed_by_name: actor,
      sentence: jsonDiff.sentence, kind: jsonDiff.kind, record_id: recordId,
      suppressWith: ['entry-amount', 'entry-add', 'entry-remove', 'entry-confirmed', 'entry-paid', 'entry-notes', 'entry-gst', 'entry-rename', 'narrative-bulk-paid', 'narrative-restore', 'narrative-move'],
    }
  }

  if (parsed.kind === 'show' || table === 'shows') {
    const col = parsed.showField || fieldName
    const subject = venue ? `${SHOW_FIELD_LABELS[col] ?? col.replace(/_/g, ' ')} for ${venue}` : (SHOW_FIELD_LABELS[col] ?? col.replace(/_/g, ' '))
    if (col === 'ticket_outlook_status') {
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, `set Ticket Outlook status${venue ? ` on ${venue}` : ''} to ${String(row.new_value ?? '—').replace(/_/g, ' ').toUpperCase()} (was ${String(row.old_value ?? '—').replace(/_/g, ' ').toUpperCase()})`)),
        kind: 'show-outlook', record_id: recordId,
      }
    }
    if (col === 'ticket_outlook') {
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, `updated Ticket Outlook${venue ? ` for ${venue}` : ''} from ${quoteLabel(truncateAuditText(row.old_value))} to ${quoteLabel(truncateAuditText(row.new_value))}`)),
        kind: 'show-outlook', record_id: recordId,
      }
    }
    if (col === 'ticket_outlook_level') {
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, `set Ticket Outlook level${venue ? ` on ${venue}` : ''} to ${String(row.new_value ?? '—').toUpperCase()} (was ${String(row.old_value ?? '—').toUpperCase()})`)),
        kind: 'show-outlook', record_id: recordId,
      }
    }
    const money = col === 'ticket_price' || col === 'capacity'
    const date = col === 'show_date'
    const booking = col === 'harbour_status'
    if (col === 'capacity') {
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, `changed capacity${venue ? ` at ${venue}` : ''} from ${row.old_value ?? '—'} to ${row.new_value ?? '—'}`)),
        kind: 'show-identity', record_id: recordId,
      }
    }
    return {
      id: row.id, changed_at: row.changed_at, changed_by_name: actor,
      sentence: formatValuePair(actor, subject, row.old_value, row.new_value, { money, date, booking, quote: !money && !date && !booking }),
      kind: col.startsWith('ticket_outlook') ? 'show-outlook' : 'show-identity',
      record_id: recordId,
    }
  }

  if (parsed.kind === 'run' || table === 'runs') {
    const col = parsed.runField || (fieldName.startsWith('runs.') ? fieldName.slice(5) : fieldName)
    if (col === 'status') {
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, `changed run status from ${formatBookingStatus(row.old_value)} to ${formatBookingStatus(row.new_value)}`)),
        kind: 'run-status', record_id: recordId,
      }
    }
    if (col === 'show_pack_status') {
      const next = String(row.new_value ?? '').toLowerCase()
      const verb = next === 'published'
        ? 'published the show-pack'
        : next === 'draft'
          ? 'returned the show-pack to draft'
          : `changed show-pack status from ${row.old_value ?? '—'} to ${row.new_value ?? '—'}`
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, verb)),
        kind: 'show-pack', record_id: recordId,
      }
    }
    const label = RUN_FIELD_LABELS[col] ?? col.replace(/_/g, ' ')
    return {
      id: row.id, changed_at: row.changed_at, changed_by_name: actor,
      sentence: finish(sentence(actor, `updated ${label} from ${quoteLabel(truncateAuditText(row.old_value))} to ${quoteLabel(truncateAuditText(row.new_value))}`)),
      kind: 'show-pack', record_id: recordId,
    }
  }

  if (parsed.kind === 'advancement' || table === 'advancement_items') {
    const item = advancementLabel(ctx, recordId, parsed.itemKey)
    const col = parsed.advField || fieldName
    if (col === 'status') {
      const fmt = (v: string | null) => {
        const t = String(v ?? '').toLowerCase()
        if (t === 'n_a' || t === 'na') return 'N/A'
        if (!t) return '—'
        return t.replace(/_/g, ' ').toUpperCase()
      }
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, `marked advancement item ${quoteLabel(item)} as ${fmt(row.new_value)} (was ${fmt(row.old_value)})`)),
        kind: 'advancement', record_id: recordId,
      }
    }
    if (col === 'paid') {
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, `${isTrue(row.new_value) ? 'marked' : 'unmarked'} advancement item ${quoteLabel(item)} as paid`)),
        kind: 'advancement', record_id: recordId,
      }
    }
    if (col === 'notes') {
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, `updated notes on ${quoteLabel(item)} from ${quoteLabel(truncateAuditText(row.old_value))} to ${quoteLabel(truncateAuditText(row.new_value))}`)),
        kind: 'advancement', record_id: recordId,
      }
    }
    if (col === 'assigned_to' || col === 'payment_type') {
      const what = col === 'assigned_to' ? 'assignee' : 'payment type'
      return {
        id: row.id, changed_at: row.changed_at, changed_by_name: actor,
        sentence: finish(sentence(actor, `changed ${what} on ${quoteLabel(item)} from ${row.old_value ?? '—'} to ${row.new_value ?? '—'}`)),
        kind: 'advancement', record_id: recordId,
      }
    }
  }

  if (fieldName === 'paid' && table !== 'advancement_items') {
    return {
      id: row.id, changed_at: row.changed_at, changed_by_name: actor,
      sentence: finish(sentence(actor, isTrue(row.new_value) ? `marked ${section} as PAID` : `marked ${section} unpaid`)),
      kind: 'entry-paid', record_id: recordId,
      suppressWith: ['narrative-bulk-paid', 'narrative-restore'],
    }
  }

  const fallbackLabel = fieldName.replace(/[._]/g, ' ').trim() || row.change_type || 'a field'
  if (!row.old_value && !row.new_value) return null
  return {
    id: row.id, changed_at: row.changed_at, changed_by_name: actor,
    sentence: finish(sentence(actor, `updated ${fallbackLabel} from ${quoteLabel(truncateAuditText(row.old_value))} to ${quoteLabel(truncateAuditText(row.new_value))}`)),
    kind: 'other', record_id: recordId,
  }
}

function sameMoment(a: string, b: string): boolean {
  const da = Date.parse(a)
  const db = Date.parse(b)
  if (!Number.isFinite(da) || !Number.isFinite(db)) return a === b
  return Math.abs(da - db) <= 2000
}

/**
 * Format + collapse duplicate trigger/writeAuditLog rows for the same edit.
 */
export function formatAuditTrailEvents(
  rows: AuditTrailRowInput[],
  ctx: AuditTrailContext = {},
): FormattedAuditEvent[] {
  const formatted = rows
    .map(row => formatAuditEvent(row, ctx))
    .filter((row): row is FormattedAuditEvent => row != null)

  return formatted.filter((row, _i, all) => {
    if (!row.suppressWith?.length) return true
    const blocker = all.find(other =>
      other.id !== row.id
      && other.record_id
      && other.record_id === row.record_id
      && sameMoment(other.changed_at, row.changed_at)
      && row.suppressWith!.includes(other.kind),
    )
    return !blocker
  })
}

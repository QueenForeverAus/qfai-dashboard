/**
 * Validate an on-sale tracker save. Datetime values with no offset are
 * Melbourne wall time. A manual edit of a synced group sets that group's
 * source back to manual. The route always sets updated_by itself.
 */

import { MELBOURNE_TZ, isValidTimeZone, isoToWallInput, wallTimeToUtcIso, type OnsaleTrackerRecord } from './onsale-tracker.ts'

const TICKET_STATES = ['none', 'received', 'approved', 'live'] as const
const EDM_STATES = ['none', 'draft_received', 'approved', 'sent_scheduled'] as const
const WEBSITE_STATES = ['not_built', 'scheduled', 'live'] as const
const FB_STATES = ['none', 'drafted', 'live'] as const
const AD_STATES = ['none', 'paused', 'running', 'ended'] as const
const PIXEL_STATES = ['ours_added', 'chasing', 'cant_add'] as const
const OWNERS = ['Gareth', 'Comms', 'Website', 'Marketing', 'Harbour'] as const

type Kind = 'text' | 'ts' | 'date' | 'int' | 'money' | 'enum' | 'bool' | 'boolNull' | 'tz'

interface FieldSpec {
  key: keyof OnsaleFormValues
  label: string
  kind: Kind
  max?: number
  values?: readonly string[]
}

export interface OnsaleFormValues {
  announce_at: string
  presale_at: string
  general_onsale_at: string
  show_local_tz: string
  ticket_link_state: string
  ticket_link_url: string
  ticket_link_platform: string
  ticket_link_received_at: string
  ticket_link_approved_at: string
  ticket_link_live_at: string
  edm_state: string
  edm_received_at: string
  edm_send_date: string
  edm_send_at: string
  website_state: string
  website_go_live_at: string
  website_wp_post_id: string
  website_url: string
  fb_event_state: string
  fb_event_id: string
  fb_event_url: string
  fb_event_live_at: string
  fb_event_venue_cohost: string
  er_ad_state: string
  er_campaign_id: string
  er_paused_since: string
  er_spend_to_date: string
  er_budget: string
  ticket_ad_state: string
  ticket_campaign_id: string
  ticket_paused_since: string
  ticket_spend_to_date: string
  ticket_budget: string
  pixel_state: string
  pixel_platform: string
  pixel_verified_at: string
  next_action: string
  next_action_owner: string
  manual_red_flag: string
  manual_red_reason: string
  notes: string
  source_of_data: string
}

const FIELDS: FieldSpec[] = [
  { key: 'announce_at', label: 'Announce', kind: 'ts' },
  { key: 'presale_at', label: 'Presale', kind: 'ts' },
  { key: 'general_onsale_at', label: 'General on-sale', kind: 'ts' },
  { key: 'show_local_tz', label: 'Show local time zone', kind: 'tz', max: 80 },
  { key: 'ticket_link_state', label: 'Ticket link', kind: 'enum', values: TICKET_STATES },
  { key: 'ticket_link_url', label: 'Ticket link URL', kind: 'text', max: 2000 },
  { key: 'ticket_link_platform', label: 'Ticket link platform', kind: 'text', max: 200 },
  { key: 'ticket_link_received_at', label: 'Ticket link received', kind: 'ts' },
  { key: 'ticket_link_approved_at', label: 'Ticket link approved', kind: 'ts' },
  { key: 'ticket_link_live_at', label: 'Ticket link live', kind: 'ts' },
  { key: 'edm_state', label: 'EDM', kind: 'enum', values: EDM_STATES },
  { key: 'edm_received_at', label: 'EDM received', kind: 'ts' },
  { key: 'edm_send_date', label: 'EDM send date', kind: 'date' },
  { key: 'edm_send_at', label: 'EDM send time', kind: 'ts' },
  { key: 'website_state', label: 'Website', kind: 'enum', values: WEBSITE_STATES },
  { key: 'website_go_live_at', label: 'Website go-live', kind: 'ts' },
  { key: 'website_wp_post_id', label: 'Website WP post', kind: 'int' },
  { key: 'website_url', label: 'Website URL', kind: 'text', max: 2000 },
  { key: 'fb_event_state', label: 'FB Event', kind: 'enum', values: FB_STATES },
  { key: 'fb_event_id', label: 'FB Event id', kind: 'text', max: 200 },
  { key: 'fb_event_url', label: 'FB Event URL', kind: 'text', max: 2000 },
  { key: 'fb_event_live_at', label: 'FB Event live', kind: 'ts' },
  { key: 'fb_event_venue_cohost', label: 'FB Event venue co-host', kind: 'boolNull' },
  { key: 'er_ad_state', label: 'ER ad', kind: 'enum', values: AD_STATES },
  { key: 'er_campaign_id', label: 'ER campaign', kind: 'text', max: 200 },
  { key: 'er_paused_since', label: 'ER paused since', kind: 'ts' },
  { key: 'er_spend_to_date', label: 'ER spend to date', kind: 'money' },
  { key: 'er_budget', label: 'ER budget', kind: 'money' },
  { key: 'ticket_ad_state', label: 'Ticket ad', kind: 'enum', values: AD_STATES },
  { key: 'ticket_campaign_id', label: 'Ticket campaign', kind: 'text', max: 200 },
  { key: 'ticket_paused_since', label: 'Ticket ad paused since', kind: 'ts' },
  { key: 'ticket_spend_to_date', label: 'Ticket ad spend to date', kind: 'money' },
  { key: 'ticket_budget', label: 'Ticket ad budget', kind: 'money' },
  { key: 'pixel_state', label: 'Pixel', kind: 'enum', values: PIXEL_STATES },
  { key: 'pixel_platform', label: 'Pixel platform', kind: 'text', max: 200 },
  { key: 'pixel_verified_at', label: 'Pixel verified', kind: 'ts' },
  { key: 'next_action', label: 'Next action', kind: 'text', max: 2000 },
  { key: 'next_action_owner', label: 'Next action owner', kind: 'enum', values: OWNERS },
  { key: 'manual_red_flag', label: 'Manual red flag', kind: 'bool' },
  { key: 'manual_red_reason', label: 'Manual red reason', kind: 'text', max: 2000 },
  { key: 'notes', label: 'Notes', kind: 'text', max: 8000 },
  { key: 'source_of_data', label: 'Source of Data', kind: 'text', max: 8000 },
]

const SOURCE_GROUPS: { source: string; fields: (keyof OnsaleFormValues)[] }[] = [
  { source: 'website_source', fields: ['website_state', 'website_go_live_at', 'website_wp_post_id', 'website_url'] },
  { source: 'fb_event_source', fields: ['fb_event_state', 'fb_event_id', 'fb_event_url', 'fb_event_live_at', 'fb_event_venue_cohost'] },
  { source: 'er_ad_source', fields: ['er_ad_state', 'er_campaign_id', 'er_paused_since', 'er_spend_to_date', 'er_budget'] },
  { source: 'ticket_ad_source', fields: ['ticket_ad_state', 'ticket_campaign_id', 'ticket_paused_since', 'ticket_spend_to_date', 'ticket_budget'] },
  { source: 'pixel_source', fields: ['pixel_state', 'pixel_platform', 'pixel_verified_at'] },
]

const TS_FORM_KEYS = new Set<keyof OnsaleFormValues>([
  'announce_at', 'presale_at', 'general_onsale_at',
  'ticket_link_received_at', 'ticket_link_approved_at', 'ticket_link_live_at',
  'edm_received_at', 'edm_send_at', 'website_go_live_at', 'fb_event_live_at',
  'er_paused_since', 'ticket_paused_since', 'pixel_verified_at',
])

export function emptyOnsaleForm(): OnsaleFormValues {
  return {
    announce_at: '',
    presale_at: '',
    general_onsale_at: '',
    show_local_tz: '',
    ticket_link_state: '',
    ticket_link_url: '',
    ticket_link_platform: '',
    ticket_link_received_at: '',
    ticket_link_approved_at: '',
    ticket_link_live_at: '',
    edm_state: '',
    edm_received_at: '',
    edm_send_date: '',
    edm_send_at: '',
    website_state: '',
    website_go_live_at: '',
    website_wp_post_id: '',
    website_url: '',
    fb_event_state: '',
    fb_event_id: '',
    fb_event_url: '',
    fb_event_live_at: '',
    fb_event_venue_cohost: '',
    er_ad_state: '',
    er_campaign_id: '',
    er_paused_since: '',
    er_spend_to_date: '',
    er_budget: '',
    ticket_ad_state: '',
    ticket_campaign_id: '',
    ticket_paused_since: '',
    ticket_spend_to_date: '',
    ticket_budget: '',
    pixel_state: '',
    pixel_platform: '',
    pixel_verified_at: '',
    next_action: '',
    next_action_owner: '',
    manual_red_flag: 'false',
    manual_red_reason: '',
    notes: '',
    source_of_data: '',
  }
}

export function trackerToForm(tracker: OnsaleTrackerRecord | null): OnsaleFormValues {
  const form = emptyOnsaleForm()
  if (!tracker) return form
  for (const field of FIELDS) {
    const key = field.key
    if (key === 'manual_red_flag') {
      form.manual_red_flag = tracker.manual_red_flag ? 'true' : 'false'
      continue
    }
    if (key === 'fb_event_venue_cohost') {
      form.fb_event_venue_cohost = tracker.fb_event_venue_cohost == null
        ? ''
        : tracker.fb_event_venue_cohost ? 'true' : 'false'
      continue
    }
    if (TS_FORM_KEYS.has(key)) {
      form[key] = isoToWallInput(tracker[key] as string | null, MELBOURNE_TZ)
      continue
    }
    const raw = tracker[key as keyof OnsaleTrackerRecord]
    form[key] = raw == null ? '' : String(raw)
  }
  return form
}

/** Melbourne datetime-local fields become UTC ISO strings. Other fields stay as entered. */
export function formValuesToPatch(form: OnsaleFormValues): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  const body: Record<string, unknown> = {}
  for (const field of FIELDS) {
    const raw = form[field.key] ?? ''
    if (field.kind === 'ts') {
      const trimmed = raw.trim()
      if (!trimmed) {
        body[field.key] = null
        continue
      }
      const iso = wallTimeToUtcIso(trimmed, MELBOURNE_TZ)
      if (!iso) return { ok: false, error: `${field.label} must be a Melbourne date and time` }
      body[field.key] = iso
      continue
    }
    if (field.kind === 'bool') {
      body[field.key] = raw === 'true'
      continue
    }
    if (field.kind === 'boolNull') {
      if (raw !== 'true' && raw !== 'false' && raw !== '') {
        return { ok: false, error: `${field.label} must be yes, no, or unknown` }
      }
      body[field.key] = raw === '' ? null : raw === 'true'
      continue
    }
    if (field.kind === 'int' || field.kind === 'money') {
      body[field.key] = raw.trim() === '' ? null : raw.trim()
      continue
    }
    body[field.key] = raw.trim() === '' ? null : raw
  }
  return { ok: true, body }
}

function blank(value: unknown): boolean {
  return value == null || value === ''
}

function parseTimestamp(value: unknown, label: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (blank(value)) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false, error: `${label} must be a date and time` }
  const trimmed = value.trim()
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed)
    if (Number.isNaN(date.getTime())) return { ok: false, error: `${label} must be a date and time` }
    return { ok: true, value: date.toISOString() }
  }
  const iso = wallTimeToUtcIso(trimmed, MELBOURNE_TZ)
  if (!iso) return { ok: false, error: `${label} must be a Melbourne date and time` }
  return { ok: true, value: iso }
}

function parseText(value: unknown, label: string, max: number): { ok: true; value: string | null } | { ok: false; error: string } {
  if (blank(value)) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false, error: `${label} must be text` }
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, value: null }
  if (trimmed.length > max) return { ok: false, error: `${label} is too long` }
  return { ok: true, value: trimmed }
}

function parseDate(value: unknown, label: string): { ok: true; value: string | null } | { ok: false; error: string } {
  if (blank(value)) return { ok: true, value: null }
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, error: `${label} must be a date` }
  }
  return { ok: true, value }
}

function parseIntField(value: unknown, label: string): { ok: true; value: number | null } | { ok: false; error: string } {
  if (blank(value)) return { ok: true, value: null }
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isInteger(n)) return { ok: false, error: `${label} must be a whole number` }
  return { ok: true, value: n }
}

function parseMoney(value: unknown, label: string): { ok: true; value: number | null } | { ok: false; error: string } {
  if (blank(value)) return { ok: true, value: null }
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  if (!Number.isFinite(n)) return { ok: false, error: `${label} must be a number` }
  return { ok: true, value: Math.round(n * 100) / 100 }
}

function parseEnum(value: unknown, label: string, values: readonly string[]): { ok: true; value: string | null } | { ok: false; error: string } {
  if (blank(value)) return { ok: true, value: null }
  if (typeof value !== 'string' || !values.includes(value)) {
    return { ok: false, error: `${label} is not a known state` }
  }
  return { ok: true, value }
}

function sameTimestamp(existing: unknown, next: string | null): boolean {
  if (blank(existing) && next == null) return true
  if (blank(existing) || next == null) return false
  const left = new Date(String(existing))
  const right = new Date(next)
  if (Number.isNaN(left.getTime()) || Number.isNaN(right.getTime())) return String(existing) === next
  return left.getTime() === right.getTime()
}

function sameText(existing: unknown, next: string | null): boolean {
  const left = blank(existing) ? null : String(existing).trim() || null
  return left === next
}

function sameNumber(existing: unknown, next: number | null): boolean {
  if (blank(existing) && next == null) return true
  if (blank(existing) || next == null) return false
  const left = Number(existing)
  if (!Number.isFinite(left)) return false
  return Math.round(left * 100) === Math.round(next * 100)
}

function sameBool(existing: unknown, next: boolean | null): boolean {
  if (existing == null && next == null) return true
  return existing === next
}

export function parseOnsalePatch(
  body: unknown,
  existing: Record<string, unknown> | null,
): { ok: true; values: Record<string, unknown> } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Expected a JSON object' }
  }
  const input = body as Record<string, unknown>
  const values: Record<string, unknown> = {}

  for (const field of FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input, field.key)) continue
    const raw = input[field.key]
    if (field.kind === 'ts') {
      const parsed = parseTimestamp(raw, field.label)
      if (!parsed.ok) return parsed
      values[field.key] = parsed.value
    } else if (field.kind === 'text') {
      const parsed = parseText(raw, field.label, field.max ?? 2000)
      if (!parsed.ok) return parsed
      values[field.key] = parsed.value
    } else if (field.kind === 'tz') {
      const parsed = parseText(raw, field.label, field.max ?? 80)
      if (!parsed.ok) return parsed
      if (parsed.value && !isValidTimeZone(parsed.value)) {
        return { ok: false, error: `${field.label} must be an IANA time zone, or blank` }
      }
      values[field.key] = parsed.value
    } else if (field.kind === 'date') {
      const parsed = parseDate(raw, field.label)
      if (!parsed.ok) return parsed
      values[field.key] = parsed.value
    } else if (field.kind === 'int') {
      const parsed = parseIntField(raw, field.label)
      if (!parsed.ok) return parsed
      values[field.key] = parsed.value
    } else if (field.kind === 'money') {
      const parsed = parseMoney(raw, field.label)
      if (!parsed.ok) return parsed
      values[field.key] = parsed.value
    } else if (field.kind === 'enum') {
      const parsed = parseEnum(raw, field.label, field.values ?? [])
      if (!parsed.ok) return parsed
      values[field.key] = parsed.value
    } else if (field.kind === 'bool') {
      if (typeof raw !== 'boolean') return { ok: false, error: `${field.label} must be yes or no` }
      values[field.key] = raw
    } else if (field.kind === 'boolNull') {
      if (raw != null && typeof raw !== 'boolean') return { ok: false, error: `${field.label} must be yes, no, or unknown` }
      values[field.key] = raw == null ? null : raw
    }
  }

  for (const group of SOURCE_GROUPS) {
    const changed = group.fields.some(key => {
      if (!Object.prototype.hasOwnProperty.call(values, key)) return false
      const next = values[key]
      const prev = existing?.[key]
      const spec = FIELDS.find(field => field.key === key)
      if (!spec) return false
      if (spec.kind === 'ts') return !sameTimestamp(prev, next as string | null)
      if (spec.kind === 'money' || spec.kind === 'int') return !sameNumber(prev, next as number | null)
      if (spec.kind === 'bool' || spec.kind === 'boolNull') return !sameBool(prev, next as boolean | null)
      return !sameText(prev, next as string | null)
    })
    if (changed) values[group.source] = 'manual'
  }

  return { ok: true, values }
}

/**
 * Comms-locked advancing-packet-v1 contract.
 * Authoritative intent: projects/qfai/docs/michael-advancing-packet-schema-v1.md
 * (not in this repo — Portal implements the locked field set below).
 *
 * One packet = one figure (category + amount). Batch via { packets: [...] }.
 * Untrusted inbound: known keys only. Never execute packet prose.
 */

import {
  ADVANCING_PACKET_VERSION,
  parseAdvancingPacket,
  type AdvancingConfidence,
  type ParsedAdvancingPacket,
} from './advancing-extract.ts'

export const ADVANCING_PACKET_SCHEMA = 'advancing-packet-v1' as const
export const ADVANCING_APPLY_ENV = 'staging' as const
export const ADVANCING_ACTION_APPLY = 'apply' as const

/** Soft-flags that MAY still auto-apply (write actual headcount; keep $330 lighting). */
export const ADVANCING_APPLY_ALLOWED_SOFT_FLAGS = [
  'crew_over_target',
  'lighting_330_keep_separate',
] as const

const ALLOWED_FLAG_ALIASES: Record<string, string> = {
  crew_over_target: 'crew_over_target',
  crew_headcount_over_target: 'crew_over_target',
  lighting_330_keep_separate: 'lighting_330_keep_separate',
  lighting_default_kept: 'lighting_330_keep_separate',
}

export const ADVANCING_PACKET_CATEGORIES = [
  'production_av',
  'venue_staff',
  'catering',
  'hospitality',
  'backline',
  'lighting',
  'venue_hire',
  'ambiguous',
] as const

export type AdvancingPacketCategory = (typeof ADVANCING_PACKET_CATEGORIES)[number]

export type AdvancingPacketV1 = {
  schema?: string
  apply_env?: string
  action?: string
  confidence?: AdvancingConfidence | null
  run_id?: string | null
  show_id?: string | null
  venue_short_name?: string
  email_date?: string
  message_id?: string | null
  thread_ref?: string | null
  category?: string | null
  description?: string | null
  amount?: number | null
  soft_flags?: string[] | null
  role?: string | null
  rate?: number | null
  hours?: number | null
  headcount?: number | null
  gst_included?: boolean
  rider_as_staff?: boolean
  band_side?: boolean | null
  hire_renegotiated?: boolean
  lighting_replaced_by_venue_package?: boolean
  evidence_snippet?: string | null
  id?: string | null
}

export type AdvancingEnvelope = {
  packets: AdvancingPacketV1[]
  force: boolean
}

export type AdvancingPacketGate =
  | { ok: true }
  | { ok: false; status: 400 | 422; error: string; soft_flags: string[] }

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function sanitize(value: unknown, max = 240): string {
  if (value == null) return ''
  return String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
}

function asFlags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(item => sanitize(item, 64)).filter(Boolean)
}

export function canonicalSoftFlag(flag: string): string {
  const key = flag.trim().toLowerCase()
  return ALLOWED_FLAG_ALIASES[key] ?? key
}

export function isAllowedApplySoftFlag(flag: string): boolean {
  const canon = canonicalSoftFlag(flag)
  return (ADVANCING_APPLY_ALLOWED_SOFT_FLAGS as readonly string[]).includes(canon)
}

export function blockingSoftFlags(flags: string[]): string[] {
  return [...new Set(flags.map(canonicalSoftFlag).filter(flag => !isAllowedApplySoftFlag(flag)))]
}

export function looksLikeV1Packet(raw: unknown): boolean {
  const row = asRecord(raw)
  if (!row) return false
  const schema = sanitize(row.schema, 64)
  if (schema === ADVANCING_PACKET_SCHEMA) return true
  if (row.category != null && row.amount != null && !Array.isArray(row.lines) && !Array.isArray(row.packets)) {
    return true
  }
  return false
}

export function parseAdvancingEnvelope(raw: unknown, opts?: { force?: boolean }): AdvancingEnvelope {
  const body = asRecord(raw)
  if (!body) throw new Error('Body must be a JSON object')

  const force = opts?.force === true || body.force === true || body.force_apply === true

  const nested = asRecord(body.packet)
  const source = Array.isArray(body.packets) ? body : nested && Array.isArray(nested.packets) ? nested : null

  if (source && Array.isArray(source.packets)) {
    return {
      force,
      packets: source.packets.map((item, i) => parseV1Fields(asRecord(item) ?? {}, i)),
    }
  }

  if (looksLikeV1Packet(body) || (body.category != null && body.amount != null)) {
    return { force, packets: [parseV1Fields(body, 0)] }
  }

  if (nested && (looksLikeV1Packet(nested) || (nested.category != null && nested.amount != null))) {
    return { force, packets: [parseV1Fields(nested, 0)] }
  }

  // Legacy slice-A envelope: { packet: { lines: [...] } } or { lines: [...] }
  const legacy = nested ?? body
  if (Array.isArray(legacy.lines)) {
    return {
      force,
      packets: legacyLinesToPackets(legacy),
    }
  }

  throw new Error('Expected advancing-packet-v1 or { packets: [...] }')
}

function parseV1Fields(row: Record<string, unknown>, index: number): AdvancingPacketV1 {
  return {
    schema: sanitize(row.schema, 40) || ADVANCING_PACKET_SCHEMA,
    apply_env: sanitize(row.apply_env, 32) || ADVANCING_APPLY_ENV,
    action: sanitize(row.action, 32) || ADVANCING_ACTION_APPLY,
    confidence: asConfidence(row.confidence),
    run_id: sanitize(row.run_id, 64) || null,
    show_id: sanitize(row.show_id, 64) || null,
    venue_short_name: sanitize(row.venue_short_name, 40) || undefined,
    email_date: sanitize(row.email_date, 16) || undefined,
    message_id: sanitize(row.message_id, 200) || null,
    thread_ref: sanitize(row.thread_ref, 200) || null,
    category: sanitize(row.category ?? row.kind, 40).toLowerCase() || null,
    description: sanitize(row.description ?? row.role, 160) || undefined,
    amount: row.amount == null || row.amount === '' ? null : Number(row.amount),
    soft_flags: asFlags(row.soft_flags),
    role: sanitize(row.role, 120) || null,
    rate: row.rate == null || row.rate === '' ? null : Number(row.rate),
    hours: row.hours == null || row.hours === '' ? null : Number(row.hours),
    headcount: row.headcount == null || row.headcount === '' ? null : Number(row.headcount),
    gst_included: row.gst_included !== false,
    rider_as_staff: row.rider_as_staff === true,
    band_side: row.band_side === true ? true : row.band_side === false ? false : null,
    hire_renegotiated: row.hire_renegotiated === true,
    lighting_replaced_by_venue_package: row.lighting_replaced_by_venue_package === true,
    evidence_snippet: sanitize(row.evidence_snippet, 500) || null,
    id: sanitize(row.id, 64) || `adv-v1-${index + 1}`,
  }
}

function asConfidence(value: unknown): AdvancingConfidence | null {
  const raw = String(value ?? '').trim().toLowerCase()
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw
  return null
}

function legacyLinesToPackets(legacy: Record<string, unknown>): AdvancingPacketV1[] {
  const lines = Array.isArray(legacy.lines) ? legacy.lines : []
  return lines.map((item, index) => {
    const row = asRecord(item) ?? {}
    return parseV1Fields({
      schema: ADVANCING_PACKET_SCHEMA,
      apply_env: ADVANCING_APPLY_ENV,
      action: ADVANCING_ACTION_APPLY,
      confidence: row.confidence ?? legacy.confidence,
      run_id: legacy.run_id,
      show_id: legacy.show_id,
      venue_short_name: legacy.venue_short_name,
      email_date: legacy.email_date,
      message_id: legacy.message_id,
      thread_ref: legacy.thread_ref,
      category: row.kind ?? row.category,
      description: row.description,
      amount: row.amount,
      soft_flags: row.soft_flags ?? legacy.soft_flags,
      role: row.role,
      rate: row.rate,
      hours: row.hours,
      headcount: row.headcount,
      gst_included: row.gst_included,
      rider_as_staff: row.rider_as_staff,
      band_side: row.band_side,
      hire_renegotiated: row.hire_renegotiated ?? legacy.hire_renegotiated,
      lighting_replaced_by_venue_package:
        row.lighting_replaced_by_venue_package ?? legacy.lighting_replaced_by_venue_package,
      evidence_snippet: row.evidence_snippet ?? legacy.evidence_snippet,
      id: row.id,
    }, index)
  })
}

export function gateAdvancingEnvelope(
  envelope: AdvancingEnvelope,
  ctx: { runId: string; showId?: string | null },
): AdvancingPacketGate {
  if (envelope.packets.length === 0) {
    return { ok: false, status: 400, error: 'packets must not be empty', soft_flags: [] }
  }

  const blocking: string[] = []

  for (const packet of envelope.packets) {
    if (packet.apply_env && packet.apply_env !== ADVANCING_APPLY_ENV) {
      return {
        ok: false,
        status: 400,
        error: `apply_env must be ${ADVANCING_APPLY_ENV}`,
        soft_flags: [],
      }
    }
    if (packet.action && packet.action !== ADVANCING_ACTION_APPLY) {
      return {
        ok: false,
        status: 400,
        error: `action must be ${ADVANCING_ACTION_APPLY}`,
        soft_flags: [],
      }
    }
    if (packet.schema && packet.schema !== ADVANCING_PACKET_SCHEMA) {
      return {
        ok: false,
        status: 400,
        error: `schema must be ${ADVANCING_PACKET_SCHEMA}`,
        soft_flags: [],
      }
    }
    if (!envelope.force && packet.confidence !== 'high') {
      return {
        ok: false,
        status: 422,
        error: `Silence-as-accept: confidence must be high (got ${packet.confidence ?? 'missing'})`,
        soft_flags: packet.soft_flags ?? [],
      }
    }
    const runId = packet.run_id || ctx.runId
    const showId = packet.show_id || ctx.showId
    if (!runId || !showId) {
      return { ok: false, status: 400, error: 'run_id and show_id are required', soft_flags: [] }
    }
    if (packet.amount == null || !Number.isFinite(Number(packet.amount))) {
      return { ok: false, status: 400, error: 'amount is required', soft_flags: packet.soft_flags ?? [] }
    }
    if (!packet.category) {
      return { ok: false, status: 400, error: 'category is required', soft_flags: [] }
    }
    if (packet.category === 'ambiguous' && !envelope.force) {
      return {
        ok: false,
        status: 422,
        error: 'category is ambiguous — Finance/Lead review',
        soft_flags: [...(packet.soft_flags ?? []), 'ambiguous'],
      }
    }
    blocking.push(...blockingSoftFlags(packet.soft_flags ?? []))
  }

  const uniqueBlocking = [...new Set(blocking)]
  if (uniqueBlocking.length > 0 && !envelope.force) {
    return {
      ok: false,
      status: 422,
      error: 'Soft-flagged — not applied unless force: true',
      soft_flags: uniqueBlocking,
    }
  }

  return { ok: true }
}

export function envelopeToParsedPacket(
  envelope: AdvancingEnvelope,
  ctx: { runId: string; showId: string; runGroup?: string | null },
): ParsedAdvancingPacket {
  const first = envelope.packets[0]
  const venue = first?.venue_short_name || 'Venue'
  const date = first?.email_date || new Date().toLocaleDateString('en-GB')

  const lines = envelope.packets.map((packet, index) => {
    const flags = (packet.soft_flags ?? []).map(canonicalSoftFlag)
    if (packet.headcount != null && Number(packet.headcount) > 3 && !flags.includes('crew_over_target')) {
      flags.push('crew_over_target')
    }
    if (packet.category === 'lighting' && !packet.lighting_replaced_by_venue_package) {
      if (!flags.includes('lighting_330_keep_separate')) flags.push('lighting_330_keep_separate')
    }
    return {
      id: packet.id || `adv-v1-${index + 1}`,
      kind: packet.category,
      category: packet.category,
      description: packet.description,
      notes: packet.evidence_snippet,
      amount: packet.amount,
      gst_included: packet.gst_included,
      role: packet.role,
      rate: packet.rate,
      hours: packet.hours,
      headcount: packet.headcount,
      confidence: packet.confidence,
      soft_flags: flags,
      evidence_snippet: packet.evidence_snippet,
      rider_as_staff: packet.rider_as_staff,
      band_side: packet.band_side,
      lighting_replaced_by_venue_package: packet.lighting_replaced_by_venue_package,
      hire_renegotiated: packet.hire_renegotiated,
    }
  })

  return parseAdvancingPacket({
    version: ADVANCING_PACKET_VERSION,
    run_id: first?.run_id || ctx.runId,
    show_id: first?.show_id || ctx.showId,
    venue_short_name: venue,
    email_date: date,
    message_id: first?.message_id,
    thread_ref: first?.thread_ref,
    confidence: first?.confidence ?? 'high',
    evidence_snippet: first?.evidence_snippet,
    soft_flags: first?.soft_flags ?? [],
    hire_renegotiated: envelope.packets.some(p => p.hire_renegotiated),
    lighting_replaced_by_venue_package: envelope.packets.some(p => p.lighting_replaced_by_venue_package),
    run_group: ctx.runGroup,
    lines,
  })
}

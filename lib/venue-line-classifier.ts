/**
 * Classify venue cost line descriptions into staff / marketing / production(AV).
 * Used when splitting Harbour quotes and planned roles across show cost fields.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { writeAuditLog, auditStringify } from '@/lib/audit-log'
import { entriesSum, type CostEntry } from '@/lib/cost-fields'

export type VenueLineKind = 'venue_marketing' | 'production_costs' | 'venue_staff' | 'unknown'

const MARKETING_RE =
  /\b(marketing|levy|promo|promotional|advertising|advert|campaign|brochure|poster|posters|signage|edm|email\s*blast|foyer\s*poster|selling)\b/i

const GEAR_RE =
  /\b(package|packages|a\/?v|audio.?visual|mic|mics|microphone|projector|screen|smoke|lighting\s*hire|light(?:ing)?\s*(?:hire|package|equip)|house\s*pa|\bpa\b|backline|equipment|equip\b|small\s*equip|tech\s*package|production\s*package|vision|staging|sound\s*(?:hire|package|system)|speaker|speakers|monitor(?:s)?|rigging|hazer|fog)\b/i

const PEOPLE_RE =
  /\b(usher|ushers|security|foh|front\s*of\s*house|technician|tech(?:s)?\b|labour|labor|warden|rider\s*staff|stage\s*door|event\s*duty\s*manager|duty\s*manager|crew|staff(?:ing)?|operator|stagehand|runner|host|hosts|manager)\b/i

/** Lone "EDM" is ambiguous (email campaign vs Event Duty Manager) — prefer unknown unless context clarifies. */
function edmKind(text: string): VenueLineKind | null {
  if (!/\bedm\b/i.test(text)) return null
  if (/\b(email|campaign|poster|marketing|promo|advert|levy|solo\s*edm|dedicated\s*edm)\b/i.test(text)) {
    return 'venue_marketing'
  }
  if (/\b(event\s*duty|duty\s*manager|manager|staff|people|usher)\b/i.test(text)) {
    return 'venue_staff'
  }
  // Prefer marketing when "Solo/Dedicated EDM" sits with marketing packages (Lead rule)
  if (/\b(solo|dedicated)\s+edm\b/i.test(text)) return 'venue_marketing'
  return 'unknown'
}

export function classifyVenueLine(
  description?: string | null,
  notes?: string | null,
): VenueLineKind {
  const text = `${description ?? ''} ${notes ?? ''}`.trim()
  if (!text) return 'unknown'

  const edm = edmKind(text)
  if (edm) return edm

  const hasMarketing = MARKETING_RE.test(text)
  const hasGear = GEAR_RE.test(text)
  const hasPeople = PEOPLE_RE.test(text)

  // Marketing wins when levy/promo cues present (even alongside staff wording)
  if (hasMarketing && !hasPeople) return 'venue_marketing'
  if (hasMarketing && hasPeople && !hasGear) {
    // e.g. "Event Marketing+Selling" — marketing park, may FLAG via unknown if too mixed
    if (/\b(marketing|levy|promo|advert|campaign|poster)\b/i.test(text)) return 'venue_marketing'
  }
  if (hasMarketing && !hasGear) return 'venue_marketing'

  if (hasGear && !hasPeople) return 'production_costs'
  if (hasPeople && !hasGear && !hasMarketing) return 'venue_staff'

  if (hasGear && hasPeople) {
    // Gear packages with labour mention → production; pure people stay staff
    if (/\b(package|hire|equipment|a\/?v|pa|projector|lighting)\b/i.test(text)) {
      return 'production_costs'
    }
    return 'venue_staff'
  }

  if (hasGear) return 'production_costs'
  if (hasPeople) return 'venue_staff'
  if (hasMarketing) return 'venue_marketing'
  return 'unknown'
}

type LineItem = {
  role?: string
  label?: string
  description?: string
  notes?: string
  amount?: number
  cost?: number
  [key: string]: unknown
}

function lineItemText(item: LineItem): string {
  return `${item.role ?? ''} ${item.label ?? ''} ${item.description ?? ''} ${item.notes ?? ''}`.trim()
}

export type ReclassifyShowVenueLinesOpts = {
  adminClient: SupabaseClient
  showId: string
  runId?: string | null
  userId?: string | null
  /** When true, leave unknown lines in place and count them as flagged. Default true. */
  flagUnknown?: boolean
}

export type ReclassifyShowVenueLinesResult = {
  moved: number
  flagged: number
  notes: string[]
}

function asEntries(raw: unknown): CostEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.map((e, i) => {
    const row = (e ?? {}) as Record<string, unknown>
    return {
      id: String(row.id ?? `e-${i}`),
      description: String(row.description ?? ''),
      notes: String(row.notes ?? ''),
      amount: Number(row.amount) || 0,
      gst_included: Boolean(row.gst_included),
      confirmed: Boolean(row.confirmed),
    }
  })
}

/**
 * Move mis-filed entries between venue_staff / venue_marketing / production_costs
 * for one show. Also strips gear roles from venue_staff.line_items when those
 * belong in production_costs. Leaves unknown entries in place and flags them.
 */
export async function reclassifyShowVenueLines(
  opts: ReclassifyShowVenueLinesOpts,
): Promise<ReclassifyShowVenueLinesResult> {
  const { adminClient, showId, userId } = opts
  const flagUnknown = opts.flagUnknown !== false
  const notes: string[] = []
  let moved = 0
  let flagged = 0

  const keys = ['venue_staff', 'venue_marketing', 'production_costs'] as const
  const { data: rows, error } = await adminClient
    .from('cost_fields')
    .select('id, run_id, show_id, field_key, value, state, source, entries, line_items, label')
    .eq('show_id', showId)
    .in('field_key', [...keys])

  if (error) {
    notes.push(`load failed: ${error.message}`)
    return { moved: 0, flagged: 0, notes }
  }

  const byKey = new Map<string, Record<string, unknown>>()
  for (const row of rows ?? []) {
    byKey.set(String(row.field_key), row as Record<string, unknown>)
  }

  const runId = opts.runId ?? (byKey.get('venue_staff')?.run_id as string | null) ?? null

  // Ensure target fields exist in memory (caller / seed should create rows)
  const buckets: Record<'venue_staff' | 'venue_marketing' | 'production_costs', CostEntry[]> = {
    venue_staff: asEntries(byKey.get('venue_staff')?.entries),
    venue_marketing: asEntries(byKey.get('venue_marketing')?.entries),
    production_costs: asEntries(byKey.get('production_costs')?.entries),
  }

  const nextBuckets = {
    venue_staff: [] as CostEntry[],
    venue_marketing: [] as CostEntry[],
    production_costs: [] as CostEntry[],
  }

  for (const fromKey of keys) {
    for (const entry of buckets[fromKey]) {
      const kind = classifyVenueLine(entry.description, entry.notes)
      if (kind === 'unknown') {
        nextBuckets[fromKey].push(entry)
        if (flagUnknown) {
          flagged += 1
          notes.push(`FLAG unknown: "${entry.description}" (left in ${fromKey})`)
        }
        continue
      }
      if (kind === fromKey) {
        nextBuckets[fromKey].push(entry)
        continue
      }
      nextBuckets[kind].push(entry)
      moved += 1
      notes.push(`moved "${entry.description}" $${entry.amount} : ${fromKey} → ${kind}`)
    }
  }

  // Strip gear roles from venue_staff.line_items → note for production (entries preferred)
  const staffRow = byKey.get('venue_staff')
  let nextLineItems: LineItem[] | undefined
  if (staffRow && Array.isArray(staffRow.line_items)) {
    const kept: LineItem[] = []
    for (const raw of staffRow.line_items as LineItem[]) {
      const kind = classifyVenueLine(lineItemText(raw), null)
      if (kind === 'production_costs' || kind === 'venue_marketing') {
        moved += 1
        const desc = lineItemText(raw) || 'role'
        const amt = Number(raw.amount ?? raw.cost) || 0
        // Promote to an entry on the target field if not already present
        const already = nextBuckets[kind].some(
          e => e.description.toLowerCase() === desc.toLowerCase() && e.amount === amt,
        )
        if (!already && desc) {
          nextBuckets[kind].push({
            id: typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `li-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            description: desc,
            notes: 'Reclassified from venue_staff.line_items',
            amount: amt,
            gst_included: false,
            confirmed: false,
          })
        }
        notes.push(`line_item "${desc}" removed from venue_staff → ${kind}`)
        continue
      }
      if (kind === 'unknown' && flagUnknown) {
        flagged += 1
        notes.push(`FLAG unknown line_item: "${lineItemText(raw)}" (left on venue_staff)`)
      }
      kept.push(raw)
    }
    nextLineItems = kept
  }

  const auditRows: Parameters<typeof writeAuditLog>[2] = []

  for (const key of keys) {
    const row = byKey.get(key)
    if (!row?.id) {
      notes.push(`skip update ${key}: no cost_fields row for show`)
      continue
    }
    const newEntries = nextBuckets[key]
    const newValue = entriesSum(newEntries)
    const patch: Record<string, unknown> = {
      entries: newEntries,
      value: newValue,
      updated_at: new Date().toISOString(),
    }
    if (key === 'venue_staff' && nextLineItems !== undefined) {
      patch.line_items = nextLineItems
    }
    if (userId) patch.updated_by = userId

    const before = {
      entries: row.entries,
      value: row.value,
      line_items: row.line_items,
    }
    const { error: upErr } = await adminClient
      .from('cost_fields')
      .update(patch)
      .eq('id', row.id)

    if (upErr) {
      notes.push(`update ${key} failed: ${upErr.message}`)
      continue
    }

    if (userId) {
      for (const field of ['entries', 'value', 'line_items'] as const) {
        if (field === 'line_items' && key !== 'venue_staff') continue
        const oldVal = before[field]
        const newVal = patch[field]
        if (auditStringify(oldVal) === auditStringify(newVal)) continue
        auditRows.push({
          table_name: 'cost_fields',
          record_id: String(row.id),
          run_id: runId,
          field_name: field,
          old_value: auditStringify(oldVal),
          new_value: auditStringify(newVal),
          change_type: 'update',
        })
      }
    }
  }

  if (userId && auditRows.length) {
    await writeAuditLog(adminClient, userId, auditRows)
    notes.push(`audit: ${auditRows.length} field change(s)`)
  }

  notes.push(`reclassify show ${showId}: moved=${moved} flagged=${flagged}`)
  return { moved, flagged, notes }
}

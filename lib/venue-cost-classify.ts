/**
 * Classify venue on-cost cues into venue_marketing / production_costs / venue_staff.
 *
 * Import Schedule does not ingest cost line items — use classifyVenueLine when
 * assigning field_key on ingest, or POST /api/admin/reclassify-venue-costs.
 *
 * Unknown cues stay put and are flagged (never silent-moved).
 * Reclass updates venue_staff.line_items (primary Venue Staff UI), not only entries.
 * History is not deleted; moves write source + audit_log notes.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { writeAuditLog, auditFieldDiffs, COST_FIELD_AUDIT_FIELDS } from '@/lib/audit-log'
import {
  DEFINED_SHOW_COST_FIELDS,
  ensureMinimumEntry,
  entriesSum,
  type CostEntry,
} from '@/lib/cost-fields'

export type VenueLineKind = 'venue_marketing' | 'production_costs' | 'venue_staff' | 'unknown'

export type StaffLineItem = {
  role: string
  rate: number
  hours: number
  headcount: number
  source?: string
}

export type ReclassFlag = {
  text: string
  reason: string
}

export type ReclassMove = {
  from: 'line_item' | 'entry'
  target: 'venue_marketing' | 'production_costs'
  amount: number
  description: string
  cue: string
  entry: CostEntry
  lineItem?: StaffLineItem
}

export type VenueStaffReclassPlan = {
  remainingLineItems: StaffLineItem[]
  remainingEntries: CostEntry[]
  moves: ReclassMove[]
  flags: ReclassFlag[]
  venueStaffValue: number | null
  destAdds: Record<'venue_marketing' | 'production_costs', CostEntry[]>
  auditNote: string
}

type CostFieldRow = {
  id: string
  run_id: string
  show_id: string | null
  category: string
  field_key: string
  label: string
  value: number | null
  state: string
  source: string | null
  line_items: StaffLineItem[] | null
  entries: CostEntry[] | null
}

const PLACEHOLDER_DESCS = new Set([
  'venue staff / on-costs',
  'venue staff',
  'estimate',
  'venue marketing',
  'production / av',
  'production costs',
])

const MARKETING_RES: RegExp[] = [
  /\bmarketing\b/,
  /\blevy\b/,
  /\bpromo(tion(al)?)?s?\b/,
  /\badvertis(e|ing|ement)s?\b/,
  /\bcampaign\b/,
  /\bbrochure\b/,
  /\bposters?\b/,
  /\bfoyer\s+poster\b/,
  /\bsignage\b/,
  /\blightbox\b/,
  /\bselling\s+staff\b/,
  /\bevent\s+marketing\b/,
  /\bvenue\s+marketing\b/,
  /\bmandatory\s+marketing\b/,
  /\b(dedicated|solo)\s+edm\b/,
  /\bedm\s*\/\s*marketing\b/,
  /\bemail\b/,
]

const GEAR_RES: RegExp[] = [
  /\bproduction\s+package\b/,
  /\btech\s+package\b/,
  /\b(av|a\/v)\s+package\b/,
  /\bvision\s+package\b/,
  /\bbasic\s+tech\b/,
  /\bbig\s+band\s+tech\b/,
  /\bsmall\s+band\s+tech\b/,
  /\bpackage\s+c\b/,
  /\bsmall\s+equip(ment)?\b/,
  /\bequipment\s+hire\b/,
  /\blighting\s+(hire|package)\b/,
  /\bhouse\s+pa\b/,
  /\bbackline\b/,
  /\bprojectors?\b/,
  /\bmics?\b/,
  /\bmicrophones?\b/,
  /\bsmoke\b/,
  /\batmospheric\b/,
  /\bhazers?\b/,
  /\bpa\b/,
  /\bequipment\b/,
  /\bgear\s+package\b/,
  /\bfull\s+gear\b/,
  /\bpackage\b/,
]

const PEOPLE_RES: RegExp[] = [
  /\bushers?\b/,
  /\bsecurity\b/,
  /\bfoh\b/,
  /\bduty\s+manager\b/,
  /\bevent\s+duty\s+manager\b/,
  /\bstage\s+door\b/,
  /\b(fire\s+)?wardens?\b/,
  /\btechnician\b/,
  /\b(audio|lighting|lx|av)\s+tech(nician)?s?\b/,
  /\btech(nical)?\s+(staff|labour|labor|crew)\b/,
  /\bbackstage\b/,
  /\bclean(er|ing)\b/,
  /\bcatering\b/,
  /\bbeverages?\b/,
  /\brider\b/,
  /\bcrew\b/,
  /\bbox\s+office\b/,
  /\bticket\s+(seller|scanner|office)\b/,
  /\bmerch(\s+staff|\s+seller)?\b/,
  /\bfollowspot\s+op\b/,
  /\bbump[-\s]?(in|out)\b/,
  /\bflyman\b/,
  /\bevent\s+staff\b/,
  /\bevent\s+manager\b/,
  /\bstaff\s+manager\b/,
  /\bvenue\s+(supervisor|personnel)\b/,
]

function newEntryId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `e-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function norm(text: string): string {
  return text.toLowerCase().replace(/[_/]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function anyMatch(res: RegExp[], t: string): boolean {
  return res.some(r => r.test(t))
}

/**
 * Classify a free-text cue (role names, entry descriptions, line_item.role, source notes).
 */
export function classifyVenueCostCue(text: string): VenueLineKind {
  const t = norm(text ?? '')
  if (!t) return 'unknown'

  // People EDM (Event Duty Manager) before generic / marketing EDM.
  const peopleEdm = /\bevent\s+duty\s+manager\b/.test(t) || (/\bduty\s+manager\b/.test(t) && !/\bmarketing\b/.test(t))
  const marketingEdm =
    /\b(dedicated|solo)\s+edm\b/.test(t) ||
    /\bedm\s*\/\s*marketing\b/.test(t) ||
    (/\bedm\b/.test(t) && /\b(marketing|campaign|email|poster|signage)\b/.test(t)) ||
    (/\bedm\b/.test(t) && !peopleEdm && !/\bduty\b/.test(t))

  const marketing = anyMatch(MARKETING_RES, t) || marketingEdm
  const people = anyMatch(PEOPLE_RES, t) || peopleEdm
  const gear = anyMatch(GEAR_RES, t)

  if (marketing && !gear && !people) return 'venue_marketing'
  if (gear && !marketing && !people) return 'production_costs'
  if (people && !marketing && !gear) return 'venue_staff'

  // Marketing-adjacent selling staff / levy + people words.
  if (marketing && people && !gear) {
    if (
      /\b(marketing|levy|poster|signage|edm|campaign|promo|selling\s+staff)\b/.test(t)
    ) {
      return 'venue_marketing'
    }
    return 'venue_staff'
  }

  // "Audio / Lighting Techs" → people; "AV Package + technician" stay unknown if mixed lump.
  if (gear && people && !marketing) {
    if (/\b(package|hire|equipment|projector|mic|pa|gear)\b/.test(t) && !/\b(tech|technician|op|staff|usher|crew)\b/.test(t)) {
      return 'production_costs'
    }
    if (/\b(tech|technician|op|staff|usher|crew|warden|usher)\b/.test(t) && !/\bpackage\b/.test(t)) {
      return 'venue_staff'
    }
    return 'unknown'
  }

  if (marketing && !people) return 'venue_marketing'
  if (gear && !people) return 'production_costs'
  if (people && !marketing && !gear) return 'venue_staff'

  return 'unknown'
}

export function classifyVenueLine(
  description?: string | null,
  notes?: string | null,
): VenueLineKind {
  const parts = [description, notes].filter(Boolean).join(' ')
  return classifyVenueCostCue(parts)
}

export function classifyLineItem(item: StaffLineItem): VenueLineKind {
  return classifyVenueLine(item.role, item.source)
}

export function classifyEntry(entry: { description?: string | null; notes?: string | null }): VenueLineKind {
  return classifyVenueLine(entry.description, entry.notes)
}

export function lineItemAmount(item: StaffLineItem): number {
  return (Number(item.rate) || 0) * (Number(item.hours) || 0) * (Number(item.headcount) || 0)
}

function isPlaceholderEntry(entry: CostEntry): boolean {
  return PLACEHOLDER_DESCS.has(norm(entry.description ?? ''))
}

function toEntry(partial: {
  description: string
  notes: string
  amount: number
}): CostEntry {
  return {
    id: newEntryId(),
    description: partial.description,
    notes: partial.notes,
    amount: partial.amount,
    gst_included: true,
    confirmed: false,
  }
}

function appendSource(existing: string | null | undefined, note: string): string {
  const prev = (existing ?? '').trim()
  return prev ? `${prev}\n${note}` : note
}

/**
 * Pure plan: scan venue_staff line_items (primary) then entries.
 * Matched marketing/gear amounts become dest entries; unknown stays + flags.
 */
export function planVenueStaffReclass(staff: CostFieldRow): VenueStaffReclassPlan {
  const flags: ReclassFlag[] = []
  const moves: ReclassMove[] = []
  const remainingLineItems: StaffLineItem[] = []
  const destAdds: Record<'venue_marketing' | 'production_costs', CostEntry[]> = {
    venue_marketing: [],
    production_costs: [],
  }

  for (const item of staff.line_items ?? []) {
    const cue = [item.role, item.source].filter(Boolean).join(' — ')
    const kind = classifyLineItem(item)
    if (kind === 'unknown') {
      remainingLineItems.push(item)
      flags.push({ text: cue || item.role, reason: 'unknown cue — left on venue_staff' })
      continue
    }
    if (kind === 'venue_staff') {
      remainingLineItems.push(item)
      continue
    }
    const amount = lineItemAmount(item)
    const entry = toEntry({
      description: item.role,
      notes: appendSource(item.source, `Reclass from venue_staff line_item → ${kind}`),
      amount,
    })
    moves.push({ from: 'line_item', target: kind, amount, description: item.role, cue, entry, lineItem: item })
    destAdds[kind].push(entry)
  }

  const remainingEntries: CostEntry[] = []
  for (const entry of staff.entries ?? []) {
    if (isPlaceholderEntry(entry)) {
      remainingEntries.push(entry)
      continue
    }
    const cue = [entry.description, entry.notes].filter(Boolean).join(' — ')
    const kind = classifyEntry(entry)
    if (kind === 'unknown') {
      remainingEntries.push(entry)
      flags.push({ text: cue || entry.description, reason: 'unknown cue — left on venue_staff' })
      continue
    }
    if (kind === 'venue_staff') {
      remainingEntries.push(entry)
      continue
    }
    const moved: CostEntry = {
      ...entry,
      id: newEntryId(),
      notes: appendSource(entry.notes, `Reclass from venue_staff entry → ${kind}`),
    }
    moves.push({
      from: 'entry',
      target: kind,
      amount: Number(entry.amount) || 0,
      description: entry.description,
      cue,
      entry: moved,
    })
    destAdds[kind].push(moved)
  }

  const venueStaffValue = remainingLineItems.length > 0
    ? remainingLineItems.reduce((sum, item) => sum + lineItemAmount(item), 0)
    : remainingEntries.length > 0
      ? entriesSum(remainingEntries)
      : 0

  const auditNote = moves.length
    ? `Reclass venue_staff: ${moves.map(m => `${m.description} $${m.amount} → ${m.target}`).join('; ')}`
    : 'Reclass venue_staff: no moves'

  return {
    remainingLineItems,
    remainingEntries,
    moves,
    flags,
    venueStaffValue,
    destAdds,
    auditNote,
  }
}

function showFieldDef(key: string) {
  return DEFINED_SHOW_COST_FIELDS.find(f => f.key === key)
}

/**
 * Apply a planned reclass to one show: PATCH venue_staff line_items + dest entries.
 * Creates missing dest fields. Does not delete history.
 */
export async function applyVenueStaffReclassPlan(
  supabase: SupabaseClient,
  staff: CostFieldRow,
  destByKey: Partial<Record<'venue_marketing' | 'production_costs', CostFieldRow | undefined>>,
  plan: VenueStaffReclassPlan,
  opts?: { userId?: string; dryRun?: boolean },
): Promise<{ staff: CostFieldRow; dests: CostFieldRow[] }> {
  const staffEntries = plan.remainingLineItems.length > 0
    ? ensureMinimumEntry(plan.remainingEntries, staff.label, plan.venueStaffValue)
    : ensureMinimumEntry(plan.remainingEntries, staff.label, plan.venueStaffValue)

  const staffPatch = {
    line_items: plan.remainingLineItems,
    entries: staffEntries,
    value: plan.venueStaffValue,
    source: appendSource(staff.source, plan.auditNote),
    updated_at: new Date().toISOString(),
  }

  if (opts?.dryRun) {
    return {
      staff: { ...staff, ...staffPatch },
      dests: [],
    }
  }

  const { data: updatedStaff, error: staffErr } = await supabase
    .from('cost_fields')
    .update(staffPatch)
    .eq('id', staff.id)
    .select()
    .single()
  if (staffErr || !updatedStaff) {
    throw new Error(staffErr?.message ?? 'Failed to update venue_staff')
  }

  if (opts?.userId) {
    await writeAuditLog(
      supabase,
      opts.userId,
      auditFieldDiffs(
        'cost_fields',
        staff.id,
        staff.run_id,
        staff,
        updatedStaff,
        COST_FIELD_AUDIT_FIELDS,
      ),
    )
  }

  const dests: CostFieldRow[] = []
  for (const key of ['venue_marketing', 'production_costs'] as const) {
    const adds = plan.destAdds[key]
    if (!adds.length) continue

    let dest = destByKey[key]
    if (!dest) {
      const def = showFieldDef(key)
      if (!def) throw new Error(`Missing defined field ${key}`)
      const seedEntries = ensureMinimumEntry([], def.label, 0)
      const insertRow = {
        run_id: staff.run_id,
        show_id: staff.show_id,
        category: def.category,
        field_key: def.key,
        label: def.label,
        value: 0,
        state: def.defaultState,
        source: plan.auditNote,
        entries: seedEntries,
      }
      const { data: created, error: createErr } = await supabase
        .from('cost_fields')
        .insert(insertRow)
        .select()
        .single()
      if (createErr || !created) {
        throw new Error(createErr?.message ?? `Failed to create ${key}`)
      }
      dest = created as CostFieldRow
      destByKey[key] = dest
    }

    const existing = Array.isArray(dest.entries) ? dest.entries : []
    const withoutBarePlaceholder = existing.filter(e => !(isPlaceholderEntry(e) && (Number(e.amount) || 0) === 0))
    const nextEntries = ensureMinimumEntry([...withoutBarePlaceholder, ...adds], dest.label, dest.value)
    const destPatch = {
      entries: nextEntries,
      value: entriesSum(nextEntries),
      source: appendSource(dest.source, plan.auditNote),
      updated_at: new Date().toISOString(),
    }
    const { data: updatedDest, error: destErr } = await supabase
      .from('cost_fields')
      .update(destPatch)
      .eq('id', dest.id)
      .select()
      .single()
    if (destErr || !updatedDest) {
      throw new Error(destErr?.message ?? `Failed to update ${key}`)
    }
    if (opts?.userId) {
      await writeAuditLog(
        supabase,
        opts.userId,
        auditFieldDiffs(
          'cost_fields',
          dest.id,
          dest.run_id,
          dest,
          updatedDest,
          COST_FIELD_AUDIT_FIELDS,
        ),
      )
    }
    dests.push(updatedDest as CostFieldRow)
  }

  return { staff: updatedStaff as CostFieldRow, dests }
}

export type ReclassifyShowOpts = {
  supabase: SupabaseClient
  runId: string
  showId: string
  userId?: string
  dryRun?: boolean
}

/**
 * Reclassify one show's venue_staff line_items + entries into marketing / production.
 */
export async function reclassifyShowVenueLines(
  opts: ReclassifyShowOpts,
): Promise<{ moved: number; flagged: number; notes: string[] }> {
  const { supabase, runId, showId, userId, dryRun } = opts
  const { data: rows, error } = await supabase
    .from('cost_fields')
    .select('*')
    .eq('run_id', runId)
    .eq('show_id', showId)
    .in('field_key', ['venue_staff', 'venue_marketing', 'production_costs'])

  if (error) throw new Error(error.message)

  const staff = (rows ?? []).find(r => r.field_key === 'venue_staff') as CostFieldRow | undefined
  if (!staff) {
    return { moved: 0, flagged: 0, notes: [`show ${showId}: no venue_staff row`] }
  }

  const destByKey: Partial<Record<'venue_marketing' | 'production_costs', CostFieldRow>> = {
    venue_marketing: (rows ?? []).find(r => r.field_key === 'venue_marketing') as CostFieldRow | undefined,
    production_costs: (rows ?? []).find(r => r.field_key === 'production_costs') as CostFieldRow | undefined,
  }

  const plan = planVenueStaffReclass(staff)
  if (plan.moves.length === 0 && plan.flags.length === 0) {
    return { moved: 0, flagged: 0, notes: [] }
  }

  if (!dryRun) {
    await applyVenueStaffReclassPlan(supabase, staff, destByKey, plan, { userId, dryRun })
  }

  return {
    moved: plan.moves.length,
    flagged: plan.flags.length,
    notes: [
      plan.auditNote,
      ...plan.flags.map(f => `flag: ${f.text} (${f.reason})`),
    ],
  }
}

export type ReclassifyRunOpts = {
  supabase: SupabaseClient
  runId?: string
  userId?: string
  dryRun?: boolean
}

/**
 * Scan venue_staff for one run (or all runs) and reclass misfiled line_items/entries.
 */
export async function reclassifyVenueStaffMisfiles(
  opts: ReclassifyRunOpts,
): Promise<{
  moved: number
  flagged: number
  notes: string[]
  shows: number
}> {
  const { supabase, runId, userId, dryRun } = opts
  let staffQuery = supabase
    .from('cost_fields')
    .select('run_id, show_id')
    .eq('field_key', 'venue_staff')
    .not('show_id', 'is', null)
  if (runId) staffQuery = staffQuery.eq('run_id', runId)

  const { data: staffRows, error } = await staffQuery
  if (error) throw new Error(error.message)

  let moved = 0
  let flagged = 0
  const notes: string[] = []
  const seen = new Set<string>()

  for (const row of staffRows ?? []) {
    if (!row.show_id) continue
    const key = `${row.run_id}:${row.show_id}`
    if (seen.has(key)) continue
    seen.add(key)
    const result = await reclassifyShowVenueLines({
      supabase,
      runId: row.run_id,
      showId: row.show_id,
      userId,
      dryRun,
    })
    moved += result.moved
    flagged += result.flagged
    notes.push(...result.notes)
  }

  return { moved, flagged, notes, shows: seen.size }
}

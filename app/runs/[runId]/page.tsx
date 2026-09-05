import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import CostFieldsTab from './CostFieldsTab'
import SynopsisBlock from './SynopsisBlock'
import { buildSynopsis } from '@/lib/synopsis'
import { formatDateAU, formatDateTimeAU } from '@/lib/dates'
import { runDateRangeFromShows } from '@/lib/run-dates'
import { computeCompletionPct } from '@/lib/completion'
import { formatBookingStatus } from '@/lib/format-booking-status'

type Show = {
  id: string
  venue_name: string
  venue_city: string
  state_territory: string | null
  show_date: string | null
  capacity: number | null
  capacity_bands?: unknown | null
  ticket_price: number | null
  sell_through_pct: number | null
  show_order: number
  ticket_outlook: string | null
  ticket_outlook_level: 'clear' | 'watch' | 'impediment' | null
  ticket_outlook_status: 'empty' | 'draft' | 'confirmed'
  ticket_outlook_as_of: string | null
  ticket_outlook_sources: unknown
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  line_items: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entries: any
}

type AuditRow = {
  id: string
  field_name: string | null
  old_value: string | null
  new_value: string | null
  changed_at: string
  change_type: string
  profiles: { full_name: string } | null
}

const STATUS_STYLES: Record<string, string> = {
  confirmed:  'bg-green-900/40 text-green-400 border border-green-800',
  proposed:   'bg-amber-900/40 text-amber-400 border border-amber-800',
  booking:    'bg-blue-900/40 text-blue-400 border border-blue-800',
  show_week:  'bg-purple-900/40 text-purple-400 border border-purple-800',
  post_show:  'bg-orange-900/40 text-orange-400 border border-orange-800',
  settled:    'bg-slate-700 text-slate-400 border border-slate-600',
}

const REGION_LABELS: Record<string, string> = {
  group1: 'Group 1 · Self-drive',
  group2: 'Group 2 · Fly + Van',
  group3: 'Group 3 · Fly + Local Backline',
}

export default async function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params
  const code = runId.toUpperCase()
  const supabase = createAdminClient()

  // Determine role for edit permissions
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  let isOwnerOrAdmin = false
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    isOwnerOrAdmin = ['owner', 'admin'].includes(profile?.role ?? '')
  }

  const { data: run } = await supabase
    .from('runs')
    .select('*')
    .eq('code', code)
    .single()

  if (!run) notFound()

  const [{ data: shows }, { data: costFields }, { data: auditRows }] = await Promise.all([
    supabase.from('shows').select('*').eq('run_id', run.id).order('show_order'),
    supabase.from('cost_fields').select('*').eq('run_id', run.id).order('show_id', { ascending: true, nullsFirst: false }),
    supabase.from('audit_log').select('*, profiles(full_name)').eq('record_id', run.id).order('changed_at', { ascending: false }).limit(50),
  ])

  // Auto-seed defaults on first view
  const typedShows = (shows ?? []) as Show[]
  const rawFields = (costFields ?? []) as CostFieldRow[]

  let typedFields = rawFields
  if (rawFields.length === 0 && typedShows.length > 0) {
    const { seedRunDefaults } = await import('@/lib/defaults/seed-run')
    await seedRunDefaults(supabase, run.id, run.code, typedShows)
    // Re-fetch after seeding
    const { data: seededFields } = await supabase
      .from('cost_fields')
      .select('*')
      .eq('run_id', run.id)
      .order('show_id', { ascending: true, nullsFirst: false })
    typedFields = (seededFields ?? []) as CostFieldRow[]
    // Also re-fetch shows (capacity/ticket_price may have been updated)
    const { data: updatedShows } = await supabase
      .from('shows')
      .select('*')
      .eq('run_id', run.id)
      .order('show_order')
    if (updatedShows) typedShows.splice(0, typedShows.length, ...updatedShows as Show[])
  } else if (rawFields.length > 0) {
    // Backfill: empty entries → ≥1 default; diverging value → value = sum(entries)
    // Also create missing defined fields (e.g. backline_hire on G2 R01 where seed skipped it).
    const { RUN_DEFAULTS } = await import('@/lib/defaults/run-defaults')
    const { generateEntries } = await import('@/lib/defaults/generate-entries')
    const {
      ensureMinimumEntry,
      entriesSum,
      ENTRY_EXEMPT_FIELD_KEYS,
      findMissingDefinedCostFields,
      buildCreateCostFieldBody,
    } = await import('@/lib/cost-fields')
    const defaults = RUN_DEFAULTS[run.code] ?? null
    let dirty = false

    const needsWork = rawFields.filter(f => {
      if (ENTRY_EXEMPT_FIELD_KEYS.has(f.field_key)) return false
      const empty = f.entries === null || (Array.isArray(f.entries) && f.entries.length === 0)
      if (empty) return true
      if (Array.isArray(f.entries) && f.entries.length > 0) {
        const sum = entriesSum(f.entries)
        // venue_staff with planned roles: do not overwrite value from entries
        const hasLineItems = f.field_key === 'venue_staff' && Array.isArray(f.line_items) && f.line_items.length > 0
        if (hasLineItems) return false
        return f.value == null || Math.abs(Number(f.value) - sum) > 0.005
      }
      return false
    })
    if (needsWork.length > 0) {
      await Promise.all(
        needsWork.map(f => {
          const empty = f.entries === null || (Array.isArray(f.entries) && f.entries.length === 0)
          let entries = Array.isArray(f.entries) ? f.entries : []
          if (empty) {
            const generated = generateEntries(f.field_key, f.state, defaults, typedShows)
            entries = ensureMinimumEntry(generated, f.label, f.value)
          }
          const hasLineItems = f.field_key === 'venue_staff' && Array.isArray(f.line_items) && f.line_items.length > 0
          const patch: { entries: unknown; value?: number } = { entries }
          if (!hasLineItems) patch.value = entriesSum(entries as Parameters<typeof entriesSum>[0])
          return supabase.from('cost_fields').update(patch).eq('id', f.id)
        })
      )
      dirty = true
    }

    const missing = findMissingDefinedCostFields(
      rawFields.map(f => ({ show_id: f.show_id, field_key: f.field_key })),
      typedShows.map(s => s.id),
    )
    if (missing.length > 0) {
      const rows = missing.map(spec => {
        const body = buildCreateCostFieldBody(run.id, spec)
        // Prefer generateEntries when defaults exist (e.g. Group 3 backline).
        if (!ENTRY_EXEMPT_FIELD_KEYS.has(spec.fieldDef.key)) {
          const generated = generateEntries(
            spec.fieldDef.key,
            spec.fieldDef.defaultState,
            defaults,
            typedShows,
          )
          const entries = ensureMinimumEntry(generated, spec.fieldDef.label, null)
          body.entries = entries
          body.value = entriesSum(entries)
        }
        return body
      })
      await supabase.from('cost_fields').insert(rows)
      dirty = true
    }

    if (dirty) {
      const { data: backfilledFields } = await supabase
        .from('cost_fields').select('*').eq('run_id', run.id)
        .order('show_id', { ascending: true, nullsFirst: false })
      typedFields = (backfilledFields ?? []) as CostFieldRow[]
    }
  }

  const typedAudit = (auditRows ?? []) as AuditRow[]

  const completionPct = computeCompletionPct(typedFields)
  // Prefer derived range from shows.show_date (SoT) over denormalized run columns
  const dateRange = runDateRangeFromShows(typedShows)
  const startDate = dateRange.start ?? run.start_date
  const endDate = dateRange.end ?? run.end_date

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-1">
        <Link href="/runs" className="text-slate-500 text-sm hover:text-slate-300 transition-colors">← Runs</Link>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-amber-400 font-bold text-lg">{run.code}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${STATUS_STYLES[run.status] ?? STATUS_STYLES.confirmed}`}>
              {formatBookingStatus(run.status)}
            </span>
          </div>
          <h1 className="text-white text-2xl font-bold">{run.name}</h1>
          <p className="text-slate-400 text-sm mt-1">
            {formatDateAU(startDate)}{startDate !== endDate ? ` – ${formatDateAU(endDate)}` : ''} · {REGION_LABELS[run.region] ?? run.region}
          </p>
        </div>
        <div className="flex flex-col items-center">
          <svg width="56" height="56" className="-rotate-90">
            <circle cx="28" cy="28" r="22" fill="none" stroke="#1e293b" strokeWidth="5" />
            <circle
              cx="28" cy="28" r="22" fill="none"
              stroke={completionPct === 100 ? '#34d399' : '#f59e0b'}
              strokeWidth="5"
              strokeDasharray={`${2 * Math.PI * 22}`}
              strokeDashoffset={`${2 * Math.PI * 22 * (1 - completionPct / 100)}`}
              strokeLinecap="round"
            />
          </svg>
          <span className="text-white text-xs font-bold -mt-1">{completionPct}%</span>
          <span className="text-slate-500 text-xs">cost fields</span>
        </div>
      </div>

      {/* Run synopsis — auto-generated, owner-editable */}
      <SynopsisBlock
        runId={run.id}
        initialText={run.synopsis ?? buildSynopsis(typedShows, typedFields, run.region)}
        isOwnerOrAdmin={isOwnerOrAdmin}
      />

      {/* Tabs rendered client-side */}
      <CostFieldsTab
        runId={run.id}
        runCode={run.code}
        runName={run.name}
        region={run.region}
        startDate={startDate}
        endDate={endDate}
        synopsis={run.synopsis ?? null}
        shows={typedShows}
        initialFields={typedFields}
        isOwnerOrAdmin={isOwnerOrAdmin}
        ticketOutlookSummary={run.ticket_outlook_summary ?? null}
        auditRows={typedAudit.map(r => ({
          id: r.id,
          field_name: r.field_name,
          old_value: r.old_value,
          new_value: r.new_value,
          changed_at: formatDateTimeAU(r.changed_at),
          change_type: r.change_type,
          changed_by_name: r.profiles?.full_name ?? 'Unknown',
        }))}
      />
    </div>
  )
}

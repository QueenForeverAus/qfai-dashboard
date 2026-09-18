/**
 * Persist Costings Group Type change after review.
 * Staging additive: writes `runs.region` + `region_operator_set`.
 */

import { writeAuditLog } from './audit-log.ts'
import {
  applyGroupChangeDecisions,
  buildGroupSeedFields,
  previewGroupChange,
  type GroupChangeDecision,
  type GroupChangeField,
} from './group-change.ts'
import {
  canEditGroupType,
  GROUP_CHANGE_SAME,
  GROUP_TYPE_LABELS,
  isGroupType,
} from './group-type.ts'
import { parseFactorMap } from './defaults/estimate-from-factors.ts'
import { loadPortalSettings } from './portal-settings.ts'
import { LIGHTING_HIRE_PER_RUN } from './defaults/run-defaults.ts'
import type { SeedShow } from './defaults/seed-run.ts'
import type { createAdminClient } from '@/lib/supabase/server-admin'

type AdminClient = ReturnType<typeof createAdminClient>

function asField(row: Record<string, unknown>): GroupChangeField {
  return {
    id: typeof row.id === 'string' ? row.id : undefined,
    field_key: String(row.field_key ?? ''),
    show_id: (row.show_id as string | null) ?? null,
    label: (row.label as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    value: row.value == null ? null : Number(row.value),
    state: (row.state as string | null) ?? null,
    source: (row.source as string | null) ?? null,
    entries: (row.entries as GroupChangeField['entries']) ?? [],
  }
}

export async function loadGroupChangeContext(opts: {
  admin: AdminClient
  runId: string
}) {
  const [{ data: run }, { data: shows }, { data: factorRows }, { data: fields }] = await Promise.all([
    opts.admin.from('runs').select('id, code, region, status, costings_unconfirmed_at, region_operator_set').eq('id', opts.runId).maybeSingle(),
    opts.admin.from('shows').select('id, show_order, capacity, ticket_price, venue_name, venue_city, show_date, state_territory').eq('run_id', opts.runId).order('show_order'),
    opts.admin.from('run_factors').select('key, value, category'),
    opts.admin.from('cost_fields').select('id, field_key, show_id, label, category, value, state, source, entries').eq('run_id', opts.runId),
  ])
  if (!run) return null
  const lightingHire = (await loadPortalSettings(opts.admin)).lighting_hire_default ?? LIGHTING_HIRE_PER_RUN
  return {
    run,
    shows: (shows ?? []) as SeedShow[],
    factors: parseFactorMap(factorRows),
    fields: (fields ?? []).map(row => asField(row as Record<string, unknown>)),
    lightingHire,
  }
}

export async function previewGroupChangeForRun(opts: {
  admin: AdminClient
  runId: string
  to: string
  role: string
  workspace?: 'costing' | 'advancing'
}) {
  const ctx = await loadGroupChangeContext({ admin: opts.admin, runId: opts.runId })
  if (!ctx) return { ok: false as const, error: 'Run not found', status: 404 }
  const gate = canEditGroupType({
    role: opts.role,
    status: ctx.run.status,
    costingsUnconfirmedAt: ctx.run.costings_unconfirmed_at,
    workspace: opts.workspace ?? 'costing',
  })
  if (!gate.ok) return { ok: false as const, error: gate.error, status: 409 }
  if (!isGroupType(opts.to)) return { ok: false as const, error: 'Invalid Group Type', status: 400 }
  if (ctx.run.region === opts.to) return { ok: false as const, error: GROUP_CHANGE_SAME, status: 409 }

  const proposed = buildGroupSeedFields({
    runId: ctx.run.id,
    shows: ctx.shows,
    factors: ctx.factors,
    region: opts.to,
    lightingHireFallback: ctx.lightingHire,
  })
  const preview = previewGroupChange({
    from: ctx.run.region,
    to: opts.to,
    existing: ctx.fields,
    proposed,
  })
  return { ok: true as const, preview, run: ctx.run }
}

export async function persistGroupChange(opts: {
  admin: AdminClient
  runId: string
  to: string
  role: string
  actorId: string
  actorName: string
  decisions?: Record<string, GroupChangeDecision> | null
  workspace?: 'costing' | 'advancing'
}): Promise<{ ok: true; applied: number; kept: number } | { ok: false; error: string; status: number }> {
  const previewed = await previewGroupChangeForRun({
    admin: opts.admin,
    runId: opts.runId,
    to: opts.to,
    role: opts.role,
    workspace: opts.workspace,
  })
  if (!previewed.ok) return previewed

  const { keep, replace } = applyGroupChangeDecisions(previewed.preview, opts.decisions)
  const now = new Date().toISOString()

  const { error: runErr } = await opts.admin
    .from('runs')
    .update({
      region: opts.to,
      region_operator_set: true,
      updated_at: now,
    })
    .eq('id', opts.runId)
  if (runErr) {
    console.error('Group change run update failed:', runErr.message)
    return { ok: false, error: runErr.message, status: 500 }
  }

  for (const line of replace) {
    if (line.action === 'remove' && line.existing?.id) {
      await opts.admin.from('cost_fields').delete().eq('id', line.existing.id)
      continue
    }
    const proposed = line.proposed
    if (!proposed) continue
    if (line.existing?.id) {
      await opts.admin.from('cost_fields').update({
        value: proposed.value ?? null,
        state: proposed.state ?? 'estimated',
        source: proposed.source ?? null,
        entries: proposed.entries ?? [],
        label: proposed.label ?? line.existing.label,
        updated_at: now,
      }).eq('id', line.existing.id)
    } else {
      await opts.admin.from('cost_fields').insert({
        run_id: opts.runId,
        show_id: proposed.show_id ?? null,
        category: proposed.category,
        field_key: proposed.field_key,
        label: proposed.label,
        value: proposed.value ?? null,
        state: proposed.state ?? 'estimated',
        source: proposed.source ?? null,
        entries: proposed.entries ?? [],
      })
    }
  }

  const fromLabel = isGroupType(previewed.preview.from)
    ? GROUP_TYPE_LABELS[previewed.preview.from]
    : previewed.preview.from
  const toLabel = isGroupType(previewed.preview.to)
    ? GROUP_TYPE_LABELS[previewed.preview.to]
    : previewed.preview.to
  await writeAuditLog(opts.admin, opts.actorId, [{
    table_name: 'runs',
    record_id: opts.runId,
    run_id: opts.runId,
    field_name: 'Group Type',
    old_value: fromLabel,
    new_value: `${opts.actorName.trim() || 'Someone'} changed Group Type to ${toLabel} (${replace.length} seed line${replace.length === 1 ? '' : 's'} applied, ${keep.length} kept).`,
    change_type: 'update',
  }])

  return { ok: true, applied: replace.length, kept: keep.length }
}

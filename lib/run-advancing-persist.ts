/**
 * Server-side Run Advancing copy / soft-archive.
 * Staging additive tables — see supabase/migrations/20260908_run_advancing_workspace.sql
 *
 * Never writes Advancing edits into cost_fields. booked_cost_snapshot stays
 * the freeze audit snapshot; this workspace is the editable twin.
 */

import { writeAuditLog } from './audit-log.ts'
import {
  ADVANCING_WRITEBACK_ERROR,
  ADVANCING_WRITES_BACK_TO_COSTING,
  advancingCopyLineKey,
  buildAdvancingFieldCopies,
  buildAdvancingShowsChrome,
  formatRunAdvancingArchiveAuditCopy,
  formatRunAdvancingCopyAuditCopy,
  isAdvancingWorkspaceActive,
  shouldArchiveAdvancingWorkspace,
  shouldCopyRunIntoAdvancing,
  shouldEnsureAdvancingWorkspaceForBookedRun,
  type AdvancingCostFieldCopy,
  type AdvancingShowChrome,
  type CostFieldCopySource,
  type ShowChromeSource,
} from './run-advancing.ts'
import {
  isBandCompsFieldKey,
  mergeCostingCopiesPreservingAdvancing,
} from './advancing-preserve.ts'
import type { createAdminClient } from '@/lib/supabase/server-admin'

type AdminClient = ReturnType<typeof createAdminClient>

export type RunAdvancingWorkspaceRow = {
  id: string
  run_id: string
  copied_at: string
  copied_by: string | null
  archived_at: string | null
  archived_by: string | null
  shows_chrome: AdvancingShowChrome[] | unknown
  travel_blocks?: unknown
  created_at: string
  updated_at: string
}

export function assertNoAdvancingWriteBack(): void {
  if (ADVANCING_WRITES_BACK_TO_COSTING) {
    throw new Error(ADVANCING_WRITEBACK_ERROR)
  }
}

export async function loadActiveAdvancingWorkspace(
  admin: AdminClient,
  runId: string,
): Promise<RunAdvancingWorkspaceRow | null> {
  const { data, error } = await admin
    .from('run_advancing_workspaces')
    .select('*')
    .eq('run_id', runId)
    .is('archived_at', null)
    .order('copied_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('loadActiveAdvancingWorkspace failed:', error.message)
    return null
  }
  return (data as RunAdvancingWorkspaceRow | null) ?? null
}

export async function loadAdvancingCostFields(
  admin: AdminClient,
  workspaceId: string,
): Promise<CostFieldCopySource[]> {
  const { data, error } = await admin
    .from('advancing_cost_fields')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('show_id', { ascending: true, nullsFirst: false })
  if (error) {
    console.error('loadAdvancingCostFields failed:', error.message)
    return []
  }
  return (data ?? []) as CostFieldCopySource[]
}

async function insertAdvancingWorkspaceCopy(opts: {
  admin: AdminClient
  runId: string
  runCode: string
  actorId?: string | null
  actorName?: string | null
}): Promise<{ copied: boolean; workspace: RunAdvancingWorkspaceRow | null }> {
  const [{ data: fields }, { data: shows }] = await Promise.all([
    opts.admin.from('cost_fields').select('*').eq('run_id', opts.runId),
    opts.admin.from('shows').select('id, ticket_price, capacity, capacity_bands, booking_fee_per_payer, cc_fee_pct').eq('run_id', opts.runId),
  ])

  const capturedAt = new Date().toISOString()
  const chrome = buildAdvancingShowsChrome((shows ?? []) as ShowChromeSource[])

  const { data: workspace, error: wsError } = await opts.admin
    .from('run_advancing_workspaces')
    .insert({
      run_id: opts.runId,
      copied_at: capturedAt,
      copied_by: opts.actorId ?? null,
      shows_chrome: chrome,
      updated_at: capturedAt,
    })
    .select('*')
    .single()

  if (wsError || !workspace) {
    console.error('Run Advancing workspace insert failed:', wsError?.message)
    // Concurrent catch-up may have created the active row — reuse it, never wipe.
    const raced = await loadActiveAdvancingWorkspace(opts.admin, opts.runId)
    return { copied: false, workspace: raced }
  }

  // Deduped in buildAdvancingFieldCopies — duplicate (show_id, field_key)
  // rows (e.g. R01 crew_travel_day) collide on advancing_cost_fields_workspace_line_idx.
  const copies = buildAdvancingFieldCopies(
    workspace.id,
    opts.runId,
    (fields ?? []) as CostFieldCopySource[],
  )
  if (copies.length > 0) {
    const { error: fieldError } = await opts.admin
      .from('advancing_cost_fields')
      .insert(copies)
    if (fieldError) {
      console.error('Run Advancing field copy failed:', fieldError.message)
      await opts.admin.from('run_advancing_workspaces').delete().eq('id', workspace.id)
      return { copied: false, workspace: null }
    }
  }

  if (opts.actorId) {
    const copy = formatRunAdvancingCopyAuditCopy({
      actorName: opts.actorName ?? 'Someone',
      runCode: opts.runCode,
      fieldCount: copies.length,
    })
    await writeAuditLog(opts.admin, opts.actorId, [{
      table_name: 'run_advancing_workspaces',
      record_id: workspace.id,
      run_id: opts.runId,
      field_name: copy.fieldName,
      old_value: copy.oldValue,
      new_value: copy.newValue,
      change_type: 'update',
    }])
  }

  return { copied: true, workspace: workspace as RunAdvancingWorkspaceRow }
}

export async function copyRunIntoAdvancingIfNeeded(opts: {
  admin: AdminClient
  runId: string
  runCode: string
  nextStatus: string
  prevStatus?: string | null
  actorId?: string | null
  actorName?: string | null
}): Promise<{ copied: boolean; workspace: RunAdvancingWorkspaceRow | null }> {
  assertNoAdvancingWriteBack()
  const existing = await loadActiveAdvancingWorkspace(opts.admin, opts.runId)
  const hasActiveWorkspace = isAdvancingWorkspaceActive(existing)
  if (!shouldCopyRunIntoAdvancing({
    nextStatus: opts.nextStatus,
    prevStatus: opts.prevStatus ?? null,
    hasActiveWorkspace,
  })) {
    return { copied: false, workspace: existing }
  }

  return insertAdvancingWorkspaceCopy(opts)
}

/**
 * Self-heal: already-BOOKED runs that missed the BOOKED-transition copy.
 * Copies Costings → Advancing only when status is confirmed and no active workspace.
 * Never overwrites an active workspace or wipes existing advancing_cost_fields.
 */
export async function ensureAdvancingWorkspaceForBookedRun(opts: {
  admin: AdminClient
  runId: string
  runCode: string
  status: string
  actorId?: string | null
  actorName?: string | null
}): Promise<{ copied: boolean; workspace: RunAdvancingWorkspaceRow | null }> {
  assertNoAdvancingWriteBack()
  const existing = await loadActiveAdvancingWorkspace(opts.admin, opts.runId)
  const hasActiveWorkspace = isAdvancingWorkspaceActive(existing)
  if (!shouldEnsureAdvancingWorkspaceForBookedRun({
    status: opts.status,
    hasActiveWorkspace,
  })) {
    return { copied: false, workspace: existing }
  }

  return insertAdvancingWorkspaceCopy(opts)
}

export async function archiveAdvancingWorkspaceIfNeeded(opts: {
  admin: AdminClient
  runId: string
  runCode: string
  nextStatus: string
  prevStatus?: string | null
  actorId?: string | null
  actorName?: string | null
}): Promise<{ archived: boolean }> {
  assertNoAdvancingWriteBack()
  const existing = await loadActiveAdvancingWorkspace(opts.admin, opts.runId)
  if (!shouldArchiveAdvancingWorkspace({
    nextStatus: opts.nextStatus,
    prevStatus: opts.prevStatus ?? null,
    hasActiveWorkspace: isAdvancingWorkspaceActive(existing),
  })) {
    return { archived: false }
  }
  if (!existing) return { archived: false }

  const archivedAt = new Date().toISOString()
  const { error } = await opts.admin
    .from('run_advancing_workspaces')
    .update({
      archived_at: archivedAt,
      archived_by: opts.actorId ?? null,
      updated_at: archivedAt,
    })
    .eq('id', existing.id)
    .is('archived_at', null)

  if (error) {
    console.error('Run Advancing archive failed:', error.message)
    return { archived: false }
  }

  if (opts.actorId) {
    const copy = formatRunAdvancingArchiveAuditCopy({
      actorName: opts.actorName ?? 'Someone',
      runCode: opts.runCode,
    })
    await writeAuditLog(opts.admin, opts.actorId, [{
      table_name: 'run_advancing_workspaces',
      record_id: existing.id,
      run_id: opts.runId,
      field_name: copy.fieldName,
      old_value: copy.oldValue,
      new_value: copy.newValue,
      change_type: 'update',
    }])
  }

  return { archived: true }
}

/**
 * Re-BOOK after Unconfirm: overwrite Advancing structure from Costings,
 * keep PAID / INVOICED / paid travel / Band Comps on the existing twin.
 * Does not archive or create a second workspace.
 */
export async function recopyCostingsIntoAdvancingPreservingPaid(opts: {
  admin: AdminClient
  runId: string
  runCode: string
  actorId?: string | null
  actorName?: string | null
}): Promise<{ copied: boolean; fieldCount: number; workspace: RunAdvancingWorkspaceRow | null }> {
  assertNoAdvancingWriteBack()
  const existing = await loadActiveAdvancingWorkspace(opts.admin, opts.runId)
  if (!isAdvancingWorkspaceActive(existing) || !existing) {
    const created = await insertAdvancingWorkspaceCopy(opts)
    return {
      copied: created.copied,
      fieldCount: 0,
      workspace: created.workspace,
    }
  }

  const [{ data: fields }, { data: shows }, { data: advancingTombstones }] = await Promise.all([
    opts.admin.from('cost_fields').select('*').eq('run_id', opts.runId),
    opts.admin.from('shows').select('id, ticket_price, capacity, capacity_bands, booking_fee_per_payer, cc_fee_pct').eq('run_id', opts.runId),
    opts.admin.from('cost_line_tombstones').select('show_id, field_key, seed_key').eq('run_id', opts.runId).eq('sheet', 'advancing'),
  ])

  const costingCopies = buildAdvancingFieldCopies(
    existing.id,
    opts.runId,
    (fields ?? []) as CostFieldCopySource[],
  )
  const advancingRows = await loadAdvancingCostFields(opts.admin, existing.id)
  const merged = mergeCostingCopiesPreservingAdvancing(
    costingCopies,
    advancingRows.map(row => ({
      show_id: row.show_id,
      field_key: row.field_key,
      state: row.state,
      value: row.value,
      source: row.source,
      label: row.label,
      category: row.category,
      line_pct: row.line_pct ?? null,
      entries: Array.isArray(row.entries) ? row.entries : null,
      line_items: Array.isArray(row.line_items) ? row.line_items : null,
    })),
    { advancingTombstones: advancingTombstones ?? [] },
  )

  const existingByKey = new Map(
    advancingRows.map(row => [advancingCopyLineKey(row), row]),
  )
  const now = new Date().toISOString()

  for (const row of merged) {
    const prior = existingByKey.get(advancingCopyLineKey(row))
    const payload: Record<string, unknown> = {
      category: row.category,
      label: row.label,
      value: row.value,
      state: row.state,
      source: row.source,
      line_pct: row.line_pct ?? null,
      line_items: row.line_items,
      entries: row.entries,
      updated_at: now,
    }
    if (prior && 'id' in prior && prior.id) {
      if (isBandCompsFieldKey(row.field_key)) continue
      await opts.admin.from('advancing_cost_fields').update(payload).eq('id', prior.id)
    } else {
      const insertRow: AdvancingCostFieldCopy = {
        workspace_id: existing.id,
        run_id: opts.runId,
        source_cost_field_id: costingCopies.find(c => advancingCopyLineKey(c) === advancingCopyLineKey(row))?.source_cost_field_id ?? null,
        show_id: row.show_id,
        category: row.category ?? 'Venue Costs',
        field_key: row.field_key,
        label: row.label ?? row.field_key,
        value: row.value ?? null,
        state: row.state ?? 'guess',
        source: row.source ?? null,
        line_pct: row.line_pct ?? null,
        line_items: row.line_items ?? null,
        entries: row.entries ?? null,
      }
      await opts.admin.from('advancing_cost_fields').insert(insertRow)
    }
  }

  const chrome = buildAdvancingShowsChrome((shows ?? []) as ShowChromeSource[])
  await opts.admin
    .from('run_advancing_workspaces')
    .update({
      copied_at: now,
      copied_by: opts.actorId ?? existing.copied_by,
      shows_chrome: chrome,
      updated_at: now,
    })
    .eq('id', existing.id)

  return { copied: true, fieldCount: merged.length, workspace: existing }
}

export async function syncRunAdvancingForStatusChange(opts: {
  admin: AdminClient
  runId: string
  runCode: string
  nextStatus: string
  prevStatus?: string | null
  actorId?: string | null
  actorName?: string | null
}): Promise<{ copied: boolean; archived: boolean }> {
  const archived = await archiveAdvancingWorkspaceIfNeeded(opts)
  const copied = await copyRunIntoAdvancingIfNeeded(opts)
  return { copied: copied.copied, archived: archived.archived }
}

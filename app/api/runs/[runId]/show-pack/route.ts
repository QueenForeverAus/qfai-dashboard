import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  SHOW_SELECT_COLS,
  SHOW_WORKSHEET_FIELDS,
  canEditWorksheet,
  pickRunWorksheetUpdates,
  pickShowWorksheetUpdates,
} from '@/lib/worksheet-fields'
import { runDateRangeFromShows } from '@/lib/run-dates'
import {
  RUN_WORKSHEET_AUDIT_FIELDS,
  auditFieldDiffs,
  setAuditActor,
  writeAuditLog,
} from '@/lib/audit-log'
import { assertNoAdvancingWriteBack, loadActiveAdvancingWorkspace } from '@/lib/run-advancing-persist'
import {
  canExposeHotelPin,
  formatWorksheetTravelBlocksAuditCopy,
  mergeHotelPinsPreservingHidden,
  parseTravelBlocks,
  redactTravelBlocksForRole,
  sanitizeTravelBlocks,
} from '@/lib/worksheet-travel-blocks'

async function resolveRunId(supabase: ReturnType<typeof createAdminClient>, runIdOrCode: string): Promise<string | null> {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(runIdOrCode)) return runIdOrCode
  const { data } = await supabase.from('runs').select('id').eq('code', runIdOrCode.toUpperCase()).single()
  return data?.id ?? null
}

async function getProfile(supabase: ReturnType<typeof createAdminClient>, userId: string) {
  const { data } = await supabase.from('profiles').select('id, role, full_name').eq('id', userId).single()
  return data
}

function canPublish(role: string | undefined) {
  return canEditWorksheet(role)
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId: runIdParam } = await params
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createAdminClient()
  const runId = await resolveRunId(supabase, runIdParam)
  if (!runId) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const [{ data: run, error: runErr }, { data: shows, error: showErr }] = await Promise.all([
    supabase
      .from('runs')
      .select('id, code, name, region, start_date, end_date, synopsis, show_pack_status, show_pack_published_at, show_pack_published_by, flights_notes, vehicles_notes, hotels_overview_notes')
      .eq('id', runId)
      .single(),
    supabase
      .from('shows')
      .select(SHOW_SELECT_COLS)
      .eq('run_id', runId)
      .order('show_order'),
  ])

  if (runErr) return NextResponse.json({ error: runErr.message }, { status: 500 })
  if (showErr) return NextResponse.json({ error: showErr.message }, { status: 500 })

  let publishedByName: string | null = null
  if (run?.show_pack_published_by) {
    const { data: pub } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', run.show_pack_published_by)
      .single()
    publishedByName = pub?.full_name ?? null
  }

  const profile = await getProfile(supabase, user.id)
  const workspace = await loadActiveAdvancingWorkspace(supabase, runId)
  const travelBlocks = redactTravelBlocksForRole(
    parseTravelBlocks(workspace?.travel_blocks),
    profile?.role,
  )
  const { data: directory } = await supabase
    .from('profiles')
    .select('id, full_name, nickname')
    .order('full_name')

  const derived = runDateRangeFromShows((shows ?? []) as { show_date?: string | null }[])
  return NextResponse.json({
    run: {
      ...run,
      start_date: derived.start ?? run?.start_date ?? null,
      end_date: derived.end ?? run?.end_date ?? null,
      show_pack_status: run?.show_pack_status ?? 'draft',
      published_by_name: publishedByName,
    },
    shows: shows ?? [],
    travel_blocks: travelBlocks,
    travel_workspace_id: workspace?.id ?? null,
    profiles: directory ?? [],
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId: runIdParam } = await params
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createAdminClient()
  const profile = await getProfile(supabase, user.id)
  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const runId = await resolveRunId(supabase, runIdParam)
  if (!runId) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const body = await req.json()

  // Field-level show patch: { show_id, fields: { ... } } or legacy { show_id, michael_notes }
  if (body.show_id) {
    if (!canEditWorksheet(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const fields: Record<string, unknown> = body.fields && typeof body.fields === 'object'
      ? body.fields
      : Object.fromEntries(
          Object.entries(body).filter(([k]) => k !== 'show_id' && k !== 'fields' && k !== 'action'),
        )

    const updates = pickShowWorksheetUpdates(fields)
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid show fields to update' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('shows')
      .select('*')
      .eq('id', body.show_id)
      .eq('run_id', runId)
      .single()

    await setAuditActor(supabase, user.id)

    const { data, error } = await supabase
      .from('shows')
      .update({ ...updates, updated_by: user.id })
      .eq('id', body.show_id)
      .eq('run_id', runId)
      .select(SHOW_SELECT_COLS)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog(
      supabase,
      user.id,
      auditFieldDiffs(
        'shows',
        body.show_id as string,
        runId,
        (existing ?? {}) as Record<string, unknown>,
        { ...(existing ?? {}), ...updates } as Record<string, unknown>,
        SHOW_WORKSHEET_FIELDS,
      ),
    )
    return NextResponse.json({ show: data })
  }

  // Structured travel cards on the BOOKED Advancing workspace — never cost_fields.
  if (body.travel_blocks && typeof body.travel_blocks === 'object' && !body.show_id && !body.action) {
    if (!canEditWorksheet(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    assertNoAdvancingWriteBack()
    const workspace = await loadActiveAdvancingWorkspace(supabase, runId)
    if (!workspace) {
      return NextResponse.json({
        error: 'Travel cards need an active Run Advancing workspace (BOOKED run).',
      }, { status: 409 })
    }

    const { data: runRow } = await supabase
      .from('runs')
      .select('code')
      .eq('id', runId)
      .single()

    const existing = parseTravelBlocks(workspace.travel_blocks)
    const incoming = sanitizeTravelBlocks(body.travel_blocks)
    const merged = mergeHotelPinsPreservingHidden(
      incoming,
      existing,
      canExposeHotelPin(profile.role),
    )
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('run_advancing_workspaces')
      .update({ travel_blocks: merged, updated_at: now })
      .eq('id', workspace.id)
      .is('archived_at', null)
      .select('id, travel_blocks')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const copy = formatWorksheetTravelBlocksAuditCopy({
      actorName: profile.full_name ?? 'Someone',
      runCode: runRow?.code ?? runId,
      blocks: merged,
    })
    await writeAuditLog(supabase, user.id, [{
      table_name: 'run_advancing_workspaces',
      record_id: workspace.id,
      run_id: runId,
      field_name: copy.fieldName,
      old_value: copy.oldValue,
      new_value: copy.newValue,
      change_type: 'update',
    }])

    return NextResponse.json({
      travel_blocks: redactTravelBlocksForRole(
        parseTravelBlocks(data?.travel_blocks),
        profile.role,
      ),
      travel_workspace_id: workspace.id,
    })
  }

  // Run-level worksheet notes: { fields: { flights_notes, ... } }
  if (body.fields && typeof body.fields === 'object' && !body.show_id && !body.action) {
    if (!canEditWorksheet(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const updates = pickRunWorksheetUpdates(body.fields)
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid run fields to update' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('runs')
      .select('id, flights_notes, vehicles_notes, hotels_overview_notes')
      .eq('id', runId)
      .single()

    await setAuditActor(supabase, user.id)

    const { data, error } = await supabase
      .from('runs')
      .update(updates)
      .eq('id', runId)
      .select('id, flights_notes, vehicles_notes, hotels_overview_notes')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await writeAuditLog(
      supabase,
      user.id,
      auditFieldDiffs(
        'runs',
        runId,
        runId,
        (existing ?? {}) as Record<string, unknown>,
        (data ?? {}) as Record<string, unknown>,
        RUN_WORKSHEET_AUDIT_FIELDS,
      ),
    )
    return NextResponse.json({ run: data })
  }

  // Publish / unpublish pack (per-run)
  if (body.action === 'publish' || body.action === 'unpublish') {
    if (!canPublish(profile.role)) {
      return NextResponse.json({ error: 'Only Gareth or Michael can publish the Worksheet' }, { status: 403 })
    }

    const { data: existingPack } = await supabase
      .from('runs')
      .select('id, show_pack_status')
      .eq('id', runId)
      .single()

    await setAuditActor(supabase, user.id)

    if (body.action === 'publish') {
      // STUB: future — email band + PDF export. Do NOT auto-email yet.
      const { data, error } = await supabase
        .from('runs')
        .update({
          show_pack_status: 'published',
          show_pack_published_at: new Date().toISOString(),
          show_pack_published_by: user.id,
        })
        .eq('id', runId)
        .select('id, show_pack_status, show_pack_published_at, show_pack_published_by')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      await writeAuditLog(
        supabase,
        user.id,
        auditFieldDiffs(
          'runs',
          runId,
          runId,
          (existingPack ?? {}) as Record<string, unknown>,
          (data ?? {}) as Record<string, unknown>,
          ['show_pack_status'],
        ),
      )
      return NextResponse.json({
        run: data,
        message: 'Worksheet published (band email + PDF stubbed — not sent).',
      })
    }

    const { data, error } = await supabase
      .from('runs')
      .update({
        show_pack_status: 'draft',
        show_pack_published_at: null,
        show_pack_published_by: null,
      })
      .eq('id', runId)
      .select('id, show_pack_status, show_pack_published_at, show_pack_published_by')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await writeAuditLog(
      supabase,
      user.id,
      auditFieldDiffs(
        'runs',
        runId,
        runId,
        (existingPack ?? {}) as Record<string, unknown>,
        (data ?? {}) as Record<string, unknown>,
        ['show_pack_status'],
      ),
    )
    return NextResponse.json({ run: data, message: 'Worksheet returned to draft.' })
  }

  return NextResponse.json({ error: 'No valid action' }, { status: 400 })
}

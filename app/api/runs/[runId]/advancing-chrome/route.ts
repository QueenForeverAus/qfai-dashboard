import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { canEditCostFields } from '@/lib/cost-fields'
import {
  ADVANCING_ARCHIVED_ERROR,
  applyAdvancingChromePatch,
  isPnlChromeShowField,
  type AdvancingShowChrome,
} from '@/lib/run-advancing'
import { loadActiveAdvancingWorkspace } from '@/lib/run-advancing-persist'

/**
 * PATCH /api/runs/[runId]/advancing-chrome
 * Working P&L chrome on the Advancing workspace — not shows / cost_fields.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params

  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !canEditCostFields(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: run } = await supabase
    .from('runs')
    .select('id')
    .eq('id', runId)
    .maybeSingle()
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const workspace = await loadActiveAdvancingWorkspace(supabase, run.id)
  if (!workspace) {
    return NextResponse.json({ error: ADVANCING_ARCHIVED_ERROR }, { status: 409 })
  }

  const body = await req.json() as Record<string, unknown>
  const showId = String(body.show_id ?? '')
  if (!showId) return NextResponse.json({ error: 'show_id is required' }, { status: 400 })

  const patch: Partial<Omit<AdvancingShowChrome, 'show_id'>> = {}
  for (const key of Object.keys(body)) {
    if (!isPnlChromeShowField(key)) continue
    const value = body[key]
    ;(patch as Record<string, unknown>)[key] = value === '' ? null : value
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No P&L chrome fields to update' }, { status: 400 })
  }

  const current = Array.isArray(workspace.shows_chrome)
    ? workspace.shows_chrome as AdvancingShowChrome[]
    : []
  const shows_chrome = applyAdvancingChromePatch(current, showId, patch)
  const updatedAt = new Date().toISOString()

  const { data, error } = await supabase
    .from('run_advancing_workspaces')
    .update({ shows_chrome, updated_at: updatedAt })
    .eq('id', workspace.id)
    .is('archived_at', null)
    .select('shows_chrome')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    show_id: showId,
    chrome: (Array.isArray(data?.shows_chrome) ? data.shows_chrome : shows_chrome)
      .find((row: AdvancingShowChrome) => row.show_id === showId) ?? null,
    shows_chrome: data?.shows_chrome ?? shows_chrome,
  })
}

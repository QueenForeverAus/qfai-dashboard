import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { canEditCostFields, productionCanEditFieldKey } from '@/lib/cost-fields'
import { staffDisplayName } from '@/lib/cost-entry-source'
import { executeCostFieldPatch } from '@/lib/cost-field-write'
import { ADVANCING_ARCHIVED_ERROR } from '@/lib/run-advancing'
import { isAdvancingWorkspaceActive } from '@/lib/run-advancing-persist'

/**
 * PATCH /api/advancing-cost-fields/[id]
 * Editable twin of Run Costing. Writes advancing_cost_fields only.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createAdminClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || !canEditCostFields(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('advancing_cost_fields')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Advancing cost field not found' }, { status: 404 })
  }

  if (profile.role === 'production' && !productionCanEditFieldKey(existing.field_key)) {
    return NextResponse.json(
      { error: 'Production role cannot edit this cost field' },
      { status: 403 },
    )
  }

  const { data: workspace } = await supabase
    .from('run_advancing_workspaces')
    .select('id, archived_at')
    .eq('id', existing.workspace_id)
    .maybeSingle()

  if (!isAdvancingWorkspaceActive(workspace)) {
    return NextResponse.json({ error: ADVANCING_ARCHIVED_ERROR }, { status: 409 })
  }

  const body = await req.json()
  return executeCostFieldPatch({
    admin: supabase,
    table: 'advancing_cost_fields',
    id,
    existing: existing as Record<string, unknown>,
    body,
    userId: user.id,
    actorName: staffDisplayName(profile.full_name) ?? 'Someone',
  })
}

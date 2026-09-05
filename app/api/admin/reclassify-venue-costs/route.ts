import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { reclassifyVenueStaffMisfiles } from '@/lib/venue-cost-classify'

async function checkAdmin(): Promise<
  { ok: false; res: NextResponse } | { ok: true; userId: string }
> {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return { ok: false, res: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) }
  const supabase = createAdminClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, userId: user.id }
}

/**
 * POST /api/admin/reclassify-venue-costs
 * Body: { run_id?: string, dryRun?: boolean }
 * — omit run_id → all runs
 * — set run_id → one run
 * Moves marketing/gear cues off venue_staff (line_items + entries).
 * Does not delete history; writes source + audit_log notes.
 */
export async function POST(req: NextRequest) {
  const auth = await checkAdmin()
  if (!auth.ok) return auth.res

  const body = await req.json().catch(() => ({})) as { run_id?: string; dryRun?: boolean }
  const supabase = createAdminClient()

  try {
    const result = await reclassifyVenueStaffMisfiles({
      supabase,
      runId: body.run_id,
      userId: auth.userId,
      dryRun: Boolean(body.dryRun),
    })
    return NextResponse.json({
      ok: true,
      dryRun: Boolean(body.dryRun),
      ...result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Reclassify failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

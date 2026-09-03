import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { explainRunRegion } from '@/lib/region-classify'

async function checkAdmin(): Promise<{ ok: false; res: NextResponse } | { ok: true }> {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return { ok: false, res: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) }
  const supabase = createAdminClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'admin'].includes(profile.role)) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true }
}

/**
 * POST /api/admin/classify-regions
 * Body: { runCode?: string }
 * — omit runCode → reclassify all runs from their shows
 * — set runCode → one run
 * Always auto-writes runs.region (no region_locked column yet).
 */
export async function POST(req: NextRequest) {
  const auth = await checkAdmin()
  if (!auth.ok) return auth.res

  const body = await req.json().catch(() => ({})) as { runCode?: string }
  const supabase = createAdminClient()

  let runsQuery = supabase.from('runs').select('id, code, region')
  if (body.runCode) {
    runsQuery = runsQuery.eq('code', body.runCode)
  }
  const { data: runs, error: runsErr } = await runsQuery
  if (runsErr) return NextResponse.json({ error: runsErr.message }, { status: 500 })
  if (!runs?.length) {
    return NextResponse.json({ error: body.runCode ? `Run ${body.runCode} not found` : 'No runs' }, { status: 404 })
  }

  const results: { code: string; old: string; new: string; reason: string }[] = []

  for (const run of runs) {
    const { data: shows } = await supabase
      .from('shows')
      .select('state_territory, venue_city')
      .eq('run_id', run.id)

    const { region: next, reason } = explainRunRegion(
      (shows ?? []).map(s => ({
        state_territory: s.state_territory,
        venue_city: s.venue_city,
      }))
    )

    if (next !== run.region) {
      const { error } = await supabase.from('runs').update({ region: next }).eq('id', run.id)
      if (error) {
        results.push({ code: run.code, old: run.region, new: run.region, reason: `update failed: ${error.message}` })
        continue
      }
    }
    results.push({ code: run.code, old: run.region, new: next, reason })
  }

  return NextResponse.json({
    ok: true,
    count: results.length,
    changed: results.filter(r => r.old !== r.new).length,
    results,
  })
}

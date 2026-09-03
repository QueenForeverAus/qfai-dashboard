import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

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
  // Gareth = owner/admin (tour_manager); Michael = production (production_manager)
  return role === 'owner' || role === 'admin' || role === 'production'
}

function canEditNotes(role: string | undefined) {
  return role === 'owner' || role === 'admin' || role === 'production'
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
      .select('id, code, name, region, start_date, end_date, synopsis, show_pack_status, show_pack_published_at, show_pack_published_by')
      .eq('id', runId)
      .single(),
    supabase
      .from('shows')
      .select('id, venue_name, venue_city, state_territory, show_date, capacity, show_order, michael_notes')
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

  return NextResponse.json({
    run: {
      ...run,
      show_pack_status: run?.show_pack_status ?? 'draft',
      published_by_name: publishedByName,
    },
    shows: shows ?? [],
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

  // Update Michael notes on a show
  if (body.michael_notes !== undefined && body.show_id) {
    if (!canEditNotes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (typeof body.michael_notes !== 'string') {
      return NextResponse.json({ error: 'michael_notes must be a string' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('shows')
      .update({ michael_notes: body.michael_notes.trim() || null })
      .eq('id', body.show_id)
      .eq('run_id', runId)
      .select('id, michael_notes')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ show: data })
  }

  // Publish / unpublish pack (per-run)
  if (body.action === 'publish' || body.action === 'unpublish') {
    if (!canPublish(profile.role)) {
      return NextResponse.json({ error: 'Only Gareth or Michael can publish the Worksheet' }, { status: 403 })
    }

    if (body.action === 'publish') {
      // STUB: future — email band + PDF export. Do NOT auto-email yet.
      // await sendShowPackEmail(...)
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
    return NextResponse.json({ run: data, message: 'Worksheet returned to draft.' })
  }

  return NextResponse.json({ error: 'No valid action' }, { status: 400 })
}

import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { staffDisplayName } from '@/lib/cost-entry-source'
import { persistGroupChange, previewGroupChangeForRun } from '@/lib/group-change-persist'
import { GROUP_CHANGE_REVIEW_INTRO, isGroupType } from '@/lib/group-type'
import type { GroupChangeDecision } from '@/lib/group-change'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    region?: string
    apply?: boolean
    decisions?: Record<string, GroupChangeDecision>
  }
  if (!isGroupType(body.region)) {
    return NextResponse.json({ error: 'Invalid Group Type' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
  const role = profile?.role ?? ''

  if (!body.apply) {
    const previewed = await previewGroupChangeForRun({
      admin: supabase,
      runId,
      to: body.region,
      role,
      workspace: 'costing',
    })
    if (!previewed.ok) {
      return NextResponse.json({ error: previewed.error }, { status: previewed.status })
    }
    return NextResponse.json({
      ok: true,
      intro: GROUP_CHANGE_REVIEW_INTRO,
      preview: previewed.preview,
    })
  }

  const result = await persistGroupChange({
    admin: supabase,
    runId,
    to: body.region,
    role,
    actorId: user.id,
    actorName: staffDisplayName(profile?.full_name) ?? 'Someone',
    decisions: body.decisions ?? null,
    workspace: 'costing',
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({
    ok: true,
    applied: result.applied,
    kept: result.kept,
    region: body.region,
  })
}

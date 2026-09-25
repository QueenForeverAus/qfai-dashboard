/**
 * Owner/admin upsert of one on-sale tracker row.
 * updated_by is always the signed-in user so the audit trigger records that actor.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminOwnerActor } from '@/lib/admin-access'
import { parseOnsalePatch } from '@/lib/onsale-tracker-patch'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server-admin'

const SHOW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ showId: string }> },
) {
  const { showId } = await params
  if (!SHOW_ID.test(showId)) {
    return NextResponse.json({ error: 'Show not found' }, { status: 404 })
  }

  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const actor = await getAdminOwnerActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const admin = createAdminClient()

  const { data: show, error: showError } = await admin
    .from('shows')
    .select('id')
    .eq('id', showId)
    .maybeSingle()
  if (showError) return NextResponse.json({ error: showError.message }, { status: 500 })
  if (!show) return NextResponse.json({ error: 'Show not found' }, { status: 404 })

  const { data: existing, error: existingError } = await admin
    .from('onsale_tracker')
    .select('*')
    .eq('show_id', showId)
    .maybeSingle()
  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 })

  const parsed = parseOnsalePatch(body, (existing as Record<string, unknown> | null) ?? null)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { data, error } = await admin
    .from('onsale_tracker')
    .upsert({
      ...parsed.values,
      show_id: showId,
      updated_by: actor.userId,
    }, { onConflict: 'show_id' })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ show_id: showId, tracker: data })
}

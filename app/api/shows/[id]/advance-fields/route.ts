import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import {
  SHOW_SELECT_COLS,
  canEditWorksheet,
  pickShowWorksheetUpdates,
} from '@/lib/worksheet-fields'

/**
 * Advancing tab saves the same shows.* columns Worksheet reads.
 * PATCH body: { fields: { production_company, ... } }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('shows')
    .select(`${SHOW_SELECT_COLS}, run_id`)
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Show not found' }, { status: 404 })
  return NextResponse.json({ show: data })
}

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
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !canEditWorksheet(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const fields: Record<string, unknown> = body.fields && typeof body.fields === 'object'
    ? body.fields
    : body

  const updates = pickShowWorksheetUpdates(fields)
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('shows')
    .update(updates)
    .eq('id', id)
    .select(SHOW_SELECT_COLS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ show: data })
}

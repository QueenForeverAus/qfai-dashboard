import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { getAdminOwnerActor } from '@/lib/admin-access'
import { emptyTourDates, tourRangeError } from '@/lib/tours'

const TOUR_SELECT = 'id, name, date_from, date_to, sort_order, created_at, updated_at'

async function requireSignedIn() {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return null
  return user
}

export async function GET() {
  if (!await requireSignedIn()) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tours')
    .select(TOUR_SELECT)
    .order('sort_order', { ascending: true })
    .order('date_from', { ascending: true, nullsFirst: true })
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const actor = await getAdminOwnerActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid tour payload' }, { status: 400 })
  }

  const raw = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const { date_from, date_to } = emptyTourDates(
    typeof raw.date_from === 'string' ? raw.date_from : null,
    typeof raw.date_to === 'string' ? raw.date_to : null,
  )
  const rangeError = tourRangeError(date_from, date_to)
  if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 })

  const sort_order = raw.sort_order === '' || raw.sort_order == null
    ? 0
    : Number(raw.sort_order)
  if (!Number.isInteger(sort_order)) {
    return NextResponse.json({ error: 'Sort order must be a whole number' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('tours')
    .insert({ name, date_from, date_to, sort_order })
    .select(TOUR_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A tour with that name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { getAdminOwnerActor } from '@/lib/admin-access'
import { emptyTourDates, tourRangeError } from '@/lib/tours'

const TOUR_SELECT = 'id, name, date_from, date_to, sort_order, created_at, updated_at'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getAdminOwnerActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Tour id required' }, { status: 400 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid tour payload' }, { status: 400 })
  }

  const raw = body && typeof body === 'object' ? body as Record<string, unknown> : {}
  const supabase = createAdminClient()
  const { data: existing, error: loadError } = await supabase
    .from('tours')
    .select(TOUR_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (loadError) return NextResponse.json({ error: loadError.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Tour not found' }, { status: 404 })

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }

  if ('name' in raw) {
    const name = typeof raw.name === 'string' ? raw.name.trim() : ''
    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    patch.name = name
  }

  const nextFrom = 'date_from' in raw
    ? emptyTourDates(typeof raw.date_from === 'string' ? raw.date_from : null, null).date_from
    : existing.date_from
  const nextTo = 'date_to' in raw
    ? emptyTourDates(null, typeof raw.date_to === 'string' ? raw.date_to : null).date_to
    : existing.date_to

  if ('date_from' in raw) patch.date_from = nextFrom
  if ('date_to' in raw) patch.date_to = nextTo

  const rangeError = tourRangeError(
    'date_from' in raw ? nextFrom : existing.date_from,
    'date_to' in raw ? nextTo : existing.date_to,
  )
  if (rangeError) return NextResponse.json({ error: rangeError }, { status: 400 })

  if ('sort_order' in raw) {
    const sort_order = raw.sort_order === '' || raw.sort_order == null
      ? 0
      : Number(raw.sort_order)
    if (!Number.isInteger(sort_order)) {
      return NextResponse.json({ error: 'Sort order must be a whole number' }, { status: 400 })
    }
    patch.sort_order = sort_order
  }

  const { data, error } = await supabase
    .from('tours')
    .update(patch)
    .eq('id', id)
    .select(TOUR_SELECT)
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A tour with that name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await getAdminOwnerActor()
  if (!actor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Tour id required' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: existing } = await supabase.from('tours').select('id').eq('id', id).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Tour not found' }, { status: 404 })

  const { error } = await supabase.from('tours').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

import { createAdminClient } from '@/lib/supabase/server-admin'
import { NextRequest, NextResponse } from 'next/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { synopsis } = await req.json()
  if (typeof synopsis !== 'string') {
    return NextResponse.json({ error: 'synopsis string required' }, { status: 400 })
  }
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('runs')
    .update({ synopsis: synopsis.trim() || null })
    .eq('id', id)
    .select('id, synopsis')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

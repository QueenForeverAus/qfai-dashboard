import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(null, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin.from('profiles').select('id, full_name, email, role').eq('id', user.id).single()
  return NextResponse.json(data ?? null)
}

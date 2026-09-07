import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { canEditCostFields } from '@/lib/cost-fields'
import { canAccessSettlements } from '@/lib/settlements'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || (!canAccessSettlements(profile.role) && !canEditCostFields(profile.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const { data, error } = await admin
    .from('settlement_file_stubs')
    .select('filename, mime_type, content_base64')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })

  const bytes = Buffer.from(data.content_base64, 'base64')
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': data.mime_type || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${data.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=60',
    },
  })
}

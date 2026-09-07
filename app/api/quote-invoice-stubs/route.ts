import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server-admin'
import { createClient } from '@/lib/supabase/server'
import { canEditCostFields } from '@/lib/cost-fields'
import { canAccessSettlements } from '@/lib/settlements'
import { validateQuoteInvoiceFile } from '@/lib/quote-invoice-stub'

export async function POST(req: NextRequest) {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single()

  if (!profile || (!canAccessSettlements(profile.role) && !canEditCostFields(profile.role))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const form = await req.formData()
  const file = form.get('file')
  const runId = String(form.get('run_id') ?? '').trim()
  if (!runId) return NextResponse.json({ error: 'run_id is required' }, { status: 400 })
  if (!(file instanceof File)) return NextResponse.json({ error: 'File is required' }, { status: 400 })

  const { data: run } = await admin.from('runs').select('id').eq('id', runId).maybeSingle()
  if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })

  const bytes = Buffer.from(await file.arrayBuffer())
  const checked = validateQuoteInvoiceFile({
    filename: file.name,
    mime: file.type,
    byteSize: bytes.length,
  })
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })

  const storagePath = `stubs/${run.id}/${crypto.randomUUID()}/${checked.filename}`
  const { data, error } = await admin
    .from('settlement_file_stubs')
    .insert({
      run_id: run.id,
      filename: checked.filename,
      mime_type: checked.mime,
      byte_size: bytes.length,
      content_base64: bytes.toString('base64'),
      storage_path: storagePath,
      created_by: user.id,
    })
    .select('id, filename, mime_type, storage_path')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    id: data.id,
    path: data.id,
    filename: data.filename,
    mime: data.mime_type,
    storage_path: data.storage_path,
  }, { status: 201 })
}

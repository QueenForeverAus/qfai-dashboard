import { NextRequest, NextResponse } from 'next/server'
import { sendDraftPreview } from '@/lib/gmail'

export async function POST(req: NextRequest) {
  try {
    const { draftId } = await req.json()
    await sendDraftPreview(draftId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

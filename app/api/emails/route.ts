import { NextResponse } from 'next/server'
import { listDrafts } from '@/lib/gmail'

export async function GET() {
  try {
    const drafts = await listDrafts()
    return NextResponse.json({ drafts })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

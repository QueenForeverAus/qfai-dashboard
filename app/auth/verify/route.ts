import { NextRequest, NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
  extractInviteToken,
  isInviteVerifyType,
  portalBaseUrl,
} from '@/lib/invite-url'

/**
 * Accept invite / recovery links on our domain (no supabase.co in the email).
 * Establishes a real session via verifyOtp, then sends the user to set a password.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = extractInviteToken(searchParams, req.nextUrl.search)
  const typeRaw = searchParams.get('type') ?? 'invite'
  const type = isInviteVerifyType(typeRaw) ? typeRaw : 'invite'
  const nextRaw = searchParams.get('next') ?? '/update-password'
  const next = nextRaw.startsWith('/') ? nextRaw : '/update-password'

  const origin = portalBaseUrl(new URL(req.url).origin)
  const dest = new URL(next, `${origin}/`)
  if (type === 'invite') dest.searchParams.set('setup', '1')

  if (!token) {
    dest.searchParams.set('error', 'missing_token')
    return NextResponse.redirect(dest)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    type: type as EmailOtpType,
    token_hash: token,
  })

  if (!error) {
    return NextResponse.redirect(dest)
  }

  // Fallback: hosted verify still works for older links / recovery.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const hosted = new URL(`${supabaseUrl}/auth/v1/verify`)
  hosted.searchParams.set('token', token)
  hosted.searchParams.set('type', type)
  hosted.searchParams.set('redirect_to', dest.toString())
  return NextResponse.redirect(hosted)
}

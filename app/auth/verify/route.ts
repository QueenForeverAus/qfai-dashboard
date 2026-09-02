import { NextRequest, NextResponse } from 'next/server'

// Proxy Supabase verification links through our domain so invite emails
// don't contain supabase.co URLs (which Google flags as spam)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')
  const type = searchParams.get('type') ?? 'invite'
  const next = searchParams.get('next') ?? '/update-password'

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin
  const destination = `${supabaseUrl}/auth/v1/verify?token=${token}&type=${type}&redirect_to=${origin}${next}`

  return NextResponse.redirect(destination)
}

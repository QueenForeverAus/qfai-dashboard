import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/update-password', '/mfa-enroll', '/mfa-verify']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const pathname = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p))
  const isApi = pathname.startsWith('/api')

  const { data: { user } } = await supabase.auth.getUser()

  // Not logged in → login page
  if (!user && !isPublic && !isApi) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Logged in but on login page → redirect home
  if (user && pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // Logged in → check MFA assurance level
  if (user && !isPublic && !isApi) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

    if (aal) {
      const hasFactors = aal.nextLevel === 'aal2' || aal.currentLevel === 'aal2'

      if (aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        // Has MFA enrolled but hasn't verified this session
        const url = request.nextUrl.clone()
        url.pathname = '/mfa-verify'
        return NextResponse.redirect(url)
      }

      if (!hasFactors && aal.currentLevel === 'aal1') {
        // No MFA enrolled at all — force enrollment
        const url = request.nextUrl.clone()
        url.pathname = '/mfa-enroll'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

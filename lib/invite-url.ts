/** Invite accept URLs. Always emit `token=` — quoted-printable and bad concat have produced `?tokenW4b…`. */

export const DEFAULT_PORTAL_URL = 'https://tours.queenforever.com.au'

export const INVITE_VERIFY_TYPES = ['invite', 'recovery', 'signup', 'magiclink', 'email'] as const
export type InviteVerifyType = (typeof INVITE_VERIFY_TYPES)[number]

export function portalBaseUrl(fallbackOrigin?: string): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  const raw = fromEnv || fallbackOrigin?.trim() || DEFAULT_PORTAL_URL
  return raw.replace(/\/$/, '')
}

export function isInviteVerifyType(value: string | null | undefined): value is InviteVerifyType {
  return !!value && (INVITE_VERIFY_TYPES as readonly string[]).includes(value)
}

/**
 * Read the hashed invite token from a query string.
 * Recovers the quoted-printable failure mode `?tokenW4b…` (missing `=`).
 */
export function extractInviteToken(searchParams: URLSearchParams, rawSearch = ''): string | null {
  const direct = searchParams.get('token') ?? searchParams.get('token_hash')
  if (direct) return direct

  for (const [key, value] of searchParams.entries()) {
    if (key.startsWith('token') && key.length > 'token'.length && !value) {
      return key.slice('token'.length)
    }
  }

  const match = rawSearch.match(/[?&]token(?:=)?([^&]+)/i)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

export function tokenFromGenerateLink(properties: {
  hashed_token?: string | null
  action_link?: string | null
}): string | null {
  if (properties.hashed_token) return properties.hashed_token
  if (!properties.action_link) return null
  try {
    const parsed = new URL(properties.action_link)
    return extractInviteToken(parsed.searchParams, parsed.search)
  } catch {
    return null
  }
}

/** Always includes `token=` in the query string. */
export function buildInviteVerifyUrl(args: {
  portalUrl: string
  token: string
  type?: string
  next?: string
}): string {
  if (!args.token) {
    throw new Error('Invite token is required')
  }
  const base = args.portalUrl.endsWith('/') ? args.portalUrl : `${args.portalUrl}/`
  const url = new URL('auth/verify', base)
  url.searchParams.set('token', args.token)
  url.searchParams.set('type', args.type ?? 'invite')
  url.searchParams.set('next', args.next ?? '/update-password')
  const href = url.toString()
  if (!href.includes('token=')) {
    throw new Error('Invite URL missing token=')
  }
  return href
}

/**
 * HTML attribute-safe href. `=` → `&#61;` so quoted-printable transfer
 * cannot swallow the separator and produce `?tokenW4b…`.
 */
export function inviteHrefForHtml(absoluteUrl: string): string {
  return absoluteUrl.replace(/&/g, '&amp;').replace(/=/g, '&#61;')
}

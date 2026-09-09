/**
 * Staging machine auth for Comms travel-scrape apply.
 * Session cookie path stays the human owner/admin door.
 *
 * Secret lives in TRAVEL_SCRAPE_APPLY_SECRET (qfai-staging only).
 * Unset / blank → Bearer / x-qfai-travel-scrape-key attempts are 401.
 * Prod kill switch is: do not set the secret on the production project.
 * Packet apply_env=production is refused by the apply engine (all actors).
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import { peekTravelScrapeSchema } from './packet.ts'

export const TRAVEL_SCRAPE_APPLY_SECRET_ENV = 'TRAVEL_SCRAPE_APPLY_SECRET' as const
export const TRAVEL_SCRAPE_MACHINE_HEADER = 'x-qfai-travel-scrape-key' as const
export const TRAVEL_SCRAPE_MACHINE_ACTOR_NAME = 'Comms scrape' as const
export const TRAVEL_SCRAPE_MACHINE_ACTOR_SLUG = 'travel-scrape-bot' as const

export type TravelScrapeApplyActor = {
  kind: 'session' | 'machine'
  /** Null for the machine actor — audit_log.changed_by / updated_by stay unset (no fake profile UUID). */
  actorUserId: string | null
  actorName: string
  role: 'owner' | 'admin' | 'machine'
}

export type TravelScrapeApplyAuthOk = {
  ok: true
  actor: TravelScrapeApplyActor
}

export type TravelScrapeApplyAuthErr = {
  ok: false
  status: 401 | 403
  error: string
}

export type TravelScrapeApplyAuthResult = TravelScrapeApplyAuthOk | TravelScrapeApplyAuthErr

export type TravelScrapeApplyAuthInput = {
  authorizationHeader?: string | null
  travelScrapeKeyHeader?: string | null
  sessionUserId?: string | null
  sessionRole?: string | null
  sessionName?: string | null
  secret?: string | null
  vercelEnv?: string | null
}

export function readTravelScrapeApplySecret(secret: string | null | undefined): string | null {
  const trimmed = String(secret ?? '').trim()
  return trimmed || null
}

export function extractTravelScrapeMachineToken(input: {
  authorizationHeader?: string | null
  travelScrapeKeyHeader?: string | null
}): string | null {
  const auth = String(input.authorizationHeader ?? '').trim()
  const bearer = auth.match(/^Bearer\s+(\S+)/i)
  if (bearer?.[1]) return bearer[1].trim() || null

  const header = String(input.travelScrapeKeyHeader ?? '').trim()
  return header || null
}

/** SHA-256 then timing-safe compare so length differences do not leak. */
export function travelScrapeMachineTokenMatches(token: string, secret: string): boolean {
  const tokenHash = createHash('sha256').update(token, 'utf8').digest()
  const secretHash = createHash('sha256').update(secret, 'utf8').digest()
  return timingSafeEqual(tokenHash, secretHash)
}

/**
 * Preview / local / named staging are allowed.
 * VERCEL_ENV=production is also allowed: the qfai-staging Vercel project uses
 * its Production environment for staging. Real prod must not set the secret.
 */
export function travelScrapeMachineDeployAllowed(vercelEnv?: string | null): boolean {
  const env = String(vercelEnv ?? '').trim().toLowerCase()
  if (!env) return true
  return env === 'preview' || env === 'development' || env === 'staging' || env === 'production'
}

export function travelScrapeMachineAllowsPacket(packet: unknown): boolean {
  return peekTravelScrapeSchema(packet)
}

export function resolveTravelScrapeApplyAuth(
  input: TravelScrapeApplyAuthInput,
): TravelScrapeApplyAuthResult {
  const token = extractTravelScrapeMachineToken(input)
  if (token) {
    const secret = readTravelScrapeApplySecret(input.secret)
    if (!secret || !travelScrapeMachineDeployAllowed(input.vercelEnv)) {
      return { ok: false, status: 401, error: 'Unauthorised' }
    }
    if (!travelScrapeMachineTokenMatches(token, secret)) {
      return { ok: false, status: 401, error: 'Unauthorised' }
    }
    return {
      ok: true,
      actor: {
        kind: 'machine',
        actorUserId: null,
        actorName: TRAVEL_SCRAPE_MACHINE_ACTOR_NAME,
        role: 'machine',
      },
    }
  }

  const sessionUserId = String(input.sessionUserId ?? '').trim()
  if (!sessionUserId) {
    return { ok: false, status: 401, error: 'Unauthorised' }
  }

  const role = String(input.sessionRole ?? '').trim().toLowerCase()
  if (role !== 'owner' && role !== 'admin') {
    return { ok: false, status: 403, error: 'Forbidden' }
  }

  const name = String(input.sessionName ?? '').trim()
  return {
    ok: true,
    actor: {
      kind: 'session',
      actorUserId: sessionUserId,
      actorName: name || 'Someone',
      role,
    },
  }
}

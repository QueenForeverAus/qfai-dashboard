import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildInviteVerifyUrl,
  extractInviteToken,
  inviteHrefForHtml,
  tokenFromGenerateLink,
} from '../../lib/invite-url.ts'

describe('invite URL token=', () => {
  it('always emits token= in the accept link', () => {
    const url = buildInviteVerifyUrl({
      portalUrl: 'https://tours.queenforever.com.au',
      token: 'W4bTokenExample',
    })
    assert.match(url, /\/auth\/verify\?/)
    assert.match(url, /token=W4bTokenExample/)
    assert.equal(url.includes('?tokenW4b'), false)
    assert.equal(url.includes('tokenW4bTokenExample'), false)
  })

  it('recovers quoted-printable missing = after token', () => {
    const raw = '?tokenW4bBroken&type=invite&next=/update-password'
    const params = new URLSearchParams(raw)
    assert.equal(extractInviteToken(params, raw), 'W4bBroken')
  })

  it('reads a well-formed token= query', () => {
    const raw = '?token=abc123&type=invite'
    const params = new URLSearchParams(raw)
    assert.equal(extractInviteToken(params, raw), 'abc123')
  })

  it('prefers hashed_token from generateLink properties', () => {
    assert.equal(
      tokenFromGenerateLink({
        hashed_token: 'hashed-1',
        action_link: 'https://example.supabase.co/auth/v1/verify?token=other&type=invite',
      }),
      'hashed-1',
    )
  })

  it('HTML href encodes = so quoted-printable cannot swallow token=', () => {
    const url = buildInviteVerifyUrl({
      portalUrl: 'https://tours.queenforever.com.au',
      token: 'W4bTokenExample',
    })
    const href = inviteHrefForHtml(url)
    assert.match(href, /token&#61;W4bTokenExample/)
    assert.match(href, /&amp;type&#61;invite/)
    assert.equal(href.includes('?tokenW4b'), false)
  })
})

import fs from 'fs'
import path from 'path'

const TOKEN_PATH = path.join(process.env.HOME || '', '.openclaw/workspace/credentials/gmail_tokens.json')

async function getAccessToken(): Promise<string> {
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'))
  const res = await fetch(tokens.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: tokens.client_id,
      client_secret: tokens.client_secret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  return data.access_token
}

function decodeBody(payload: Record<string, unknown>): string {
  const p = payload as { body?: { data?: string }; parts?: { mimeType: string; body: { data: string } }[]; mimeType?: string }
  if (p.body?.data) return Buffer.from(p.body.data, 'base64').toString('utf-8')
  if (p.parts) {
    for (const part of p.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8')
      }
    }
  }
  return ''
}

export interface Draft {
  id: string
  to: string
  cc: string
  subject: string
  body: string
  snippet: string
}

export async function listDrafts(): Promise<Draft[]> {
  const token = await getAccessToken()
  const headers = { Authorization: `Bearer ${token}` }

  const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts?maxResults=20', { headers })
  const listData = await listRes.json()
  const draftIds: string[] = (listData.drafts || []).map((d: { id: string }) => d.id)

  const drafts: Draft[] = []
  for (const id of draftIds) {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${id}?format=full`, { headers })
    const data = await res.json()
    const hdrs: Record<string, string> = {}
    for (const h of data.message?.payload?.headers || []) {
      hdrs[h.name] = h.value
    }
    if (!hdrs['Subject'] || !hdrs['To']) continue
    drafts.push({
      id,
      to: hdrs['To'] || '',
      cc: hdrs['Cc'] || '',
      subject: hdrs['Subject'] || '',
      body: decodeBody(data.message?.payload || {}),
      snippet: data.message?.snippet || '',
    })
  }
  return drafts
}

export async function sendDraftPreview(draftId: string): Promise<void> {
  const drafts = await listDrafts()
  const draft = drafts.find(d => d.id === draftId)
  if (!draft) throw new Error('Draft not found')

  const token = await getAccessToken()
  const previewBody = `--- PREVIEW FOR GARETH'S APPROVAL ---\nTo: ${draft.to}\nCC: ${draft.cc || 'none'}\nSubject: ${draft.subject}\n\n${draft.body}\n\n--- Reply YES to approve sending, or reply with any changes needed. ---`

  const raw = [
    `To: gareth@queenforever.com.au`,
    `Subject: PREVIEW: ${draft.subject}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    previewBody,
  ].join('\r\n')

  const encoded = Buffer.from(raw).toString('base64url')
  await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: encoded }),
  })
}

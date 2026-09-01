import { createAdminClient } from '@/lib/supabase/server-admin'
import { NextRequest, NextResponse } from 'next/server'

const RESEND_API_KEY = process.env.RESEND_API_KEY!
const PORTAL_URL = 'https://tours.queenforever.com.au'

async function sendInviteEmail(to: string, name: string, inviteUrl: string) {
  const firstName = name.split(' ')[0]
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:12px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:#fbbf24;padding:24px 32px;">
            <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;color:#1e293b;text-transform:uppercase;">Queen Forever Tours</p>
            <h1 style="margin:8px 0 0;font-size:26px;color:#0f172a;line-height:1.2;">Less admin.<br>More rock. 🎸</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:16px;color:#e2e8f0;">G'day ${firstName},</p>
            <p style="margin:0 0 16px;font-size:15px;color:#94a3b8;line-height:1.6;">
              You've been invited to <strong style="color:#e2e8f0;">Queen Forever Tours</strong> — the band's private portal for tour schedules, financials, and logistics.
            </p>
            <p style="margin:0 0 24px;font-size:15px;color:#94a3b8;line-height:1.6;">
              We handle the spreadsheets so you can focus on the stage.
            </p>
            <table cellpadding="0" cellspacing="0"><tr><td>
              <a href="${inviteUrl}" style="display:inline-block;background:#fbbf24;color:#0f172a;font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:8px;">
                Accept invitation →
              </a>
            </td></tr></table>
            <p style="margin:24px 0 0;font-size:12px;color:#475569;">
              This link expires in 24 hours. If you didn't expect this, ignore it — no account will be created.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #334155;">
            <p style="margin:0;font-size:11px;color:#475569;">Queen Forever Tours · Melbourne, Australia · Est. 2006</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Queen Forever Tours <noreply@queenforever.com.au>',
      to: [to],
      subject: 'Less admin. More rock. You\'ve been invited to Queen Forever Tours 🎸',
      html,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend error: ${body}`)
  }
}

export async function POST(req: NextRequest) {
  const { email, full_name, role } = await req.json()
  if (!email || !full_name || !role) {
    return NextResponse.json({ error: 'email, full_name and role are required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // If the user is already pending (invited but not confirmed), delete them first so we can re-invite
  const { data: existing } = await supabase.auth.admin.listUsers()
  const pendingUser = existing?.users.find(u => u.email === email && u.invited_at && !u.confirmed_at)
  if (pendingUser) {
    await supabase.auth.admin.deleteUser(pendingUser.id)
  }

  // Generate invite link (does not send email)
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      redirectTo: `${PORTAL_URL}/update-password`,
      data: { full_name, role },
    },
  })

  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 })

  // Extract the raw token from Supabase's action_link and route it through our domain
  const supabaseLink = new URL(linkData.properties.action_link)
  const token = supabaseLink.searchParams.get('token')
  const ourInviteUrl = `${PORTAL_URL}/auth/verify?token=${token}&type=invite&next=/update-password`

  // Send branded email via Resend API (links stay on our domain — avoids spam filters)
  try {
    await sendInviteEmail(email, full_name, ourInviteUrl)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to send email'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // Pre-create the profile so they appear in admin immediately
  await supabase.from('profiles').upsert({
    id: linkData.user.id,
    full_name,
    email,
    role,
  })

  return NextResponse.json({ ok: true })
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type Profile = {
  id: string
  full_name: string
  email: string
  role: string
}

type PendingUser = {
  id: string
  email: string
  full_name: string | null
  role: string | null
  invited_at: string
}

const roleStyles: Record<string, string> = {
  admin:      'bg-amber-900/40 text-amber-400 border-amber-800',
  owner:      'bg-purple-900/40 text-purple-400 border-purple-800',
  production: 'bg-blue-900/40 text-blue-400 border-blue-800',
  crew:       'bg-slate-700 text-slate-400 border-slate-600',
  external:   'bg-slate-700 text-slate-500 border-slate-600',
}

export default function AdminPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [pending, setPending] = useState<PendingUser[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [resendStatus, setResendStatus] = useState<Record<string, string>>({})
  const [resetStatus, setResetStatus] = useState<Record<string, string>>({})
  const [showInvite, setShowInvite] = useState(false)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('owner')
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [inviteError, setInviteError] = useState('')

  const loadAll = useCallback(async () => {
    const supabase = createClient()
    const [profilesRes, pendingRes] = await Promise.all([
      supabase.from('profiles').select('*').order('role'),
      fetch('/api/admin/pending-users').then(r => r.json()),
    ])
    setProfiles((profilesRes.data ?? []) as Profile[])
    setPending(pendingRes.pending ?? [])
    setLoadingProfiles(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  async function sendInvite() {
    setInviteStatus('sending')
    setInviteError('')
    const res = await fetch('/api/admin/invite-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, full_name: inviteName, role: inviteRole }),
    })
    if (res.ok) {
      setInviteStatus('sent')
      await loadAll()
      setTimeout(() => {
        setShowInvite(false)
        setInviteStatus('idle')
        setInviteName('')
        setInviteEmail('')
        setInviteRole('owner')
      }, 2000)
    } else {
      const body = await res.json()
      setInviteError(body.error ?? 'Unknown error')
      setInviteStatus('error')
    }
  }

  async function resendInvite(u: PendingUser) {
    setResendingId(u.id)
    setResendStatus(prev => ({ ...prev, [u.id]: 'sending' }))
    const res = await fetch('/api/admin/invite-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, full_name: u.full_name ?? '', role: u.role ?? 'external' }),
    })
    setResendingId(null)
    if (res.ok) {
      setResendStatus(prev => ({ ...prev, [u.id]: 'sent' }))
      setTimeout(() => setResendStatus(prev => ({ ...prev, [u.id]: '' })), 4000)
    } else {
      setResendStatus(prev => ({ ...prev, [u.id]: 'error' }))
    }
  }

  async function cancelInvite(id: string) {
    setDeletingId(id)
    await fetch('/api/admin/pending-users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await loadAll()
    setDeletingId(null)
  }

  async function sendResetLink(email: string) {
    setResetStatus(prev => ({ ...prev, [email]: 'sending' }))
    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (res.ok) {
      setResetStatus(prev => ({ ...prev, [email]: 'sent' }))
      setTimeout(() => setResetStatus(prev => ({ ...prev, [email]: '' })), 4000)
    } else {
      setResetStatus(prev => ({ ...prev, [email]: 'error' }))
    }
  }

  const totalUsers = profiles.length + pending.length

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-white text-2xl font-bold">Admin</h1>
        <p className="text-slate-400 text-sm mt-1">User management and permissions</p>
      </div>

      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-white font-semibold">
            Users ({totalUsers})
            {pending.length > 0 && (
              <span className="ml-2 text-xs font-medium text-amber-400 bg-amber-400/10 border border-amber-800 px-2 py-0.5 rounded">
                {pending.length} pending
              </span>
            )}
          </h2>
          <button
            onClick={() => setShowInvite(true)}
            className="text-sm bg-amber-400 text-slate-900 font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-300 transition-colors"
          >
            + Invite user
          </button>
        </div>

        {loadingProfiles ? (
          <div className="p-6 text-center text-slate-500 text-sm">Loading…</div>
        ) : totalUsers === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">No users found.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Name</th>
                <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Email</th>
                <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Role</th>
                <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Confirmed users */}
              {profiles.map((profile, i) => {
                const status = resetStatus[profile.email]
                const isLast = i === profiles.length - 1 && pending.length === 0
                return (
                  <tr key={profile.id} className={`border-b border-slate-700/50 ${isLast ? 'border-0' : ''}`}>
                    <td className="px-4 py-3 text-white text-sm">{profile.full_name}</td>
                    <td className="px-4 py-3 text-slate-400 text-sm">{profile.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded border text-xs font-medium uppercase ${roleStyles[profile.role] ?? roleStyles.external}`}>
                        {profile.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => sendResetLink(profile.email)}
                        disabled={status === 'sending'}
                        className="text-xs text-slate-500 hover:text-amber-400 transition-colors disabled:opacity-50"
                      >
                        {status === 'sending' ? 'Sending…' : status === 'sent' ? '✓ Sent' : status === 'error' ? '✗ Failed' : 'Send reset link'}
                      </button>
                    </td>
                  </tr>
                )
              })}

              {/* Pending invites */}
              {pending.map((u, i) => (
                <tr key={u.id} className={`border-b border-slate-700/50 bg-slate-800/50 ${i === pending.length - 1 ? 'border-0' : ''}`}>
                  <td className="px-4 py-3 text-slate-300 text-sm">
                    {u.full_name ?? <span className="text-slate-500 italic">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-sm">{u.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {u.role && (
                        <span className={`px-2 py-0.5 rounded border text-xs font-medium uppercase ${roleStyles[u.role] ?? roleStyles.external}`}>
                          {u.role}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded border text-xs font-medium border-yellow-700 text-yellow-500 bg-yellow-900/20">
                        pending
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => resendInvite(u)}
                        disabled={resendingId === u.id}
                        className="text-xs text-slate-500 hover:text-amber-400 transition-colors disabled:opacity-50"
                      >
                        {resendStatus[u.id] === 'sending' ? 'Sending…' : resendStatus[u.id] === 'sent' ? '✓ Sent' : resendStatus[u.id] === 'error' ? '✗ Failed' : 'Resend invite'}
                      </button>
                      <span className="text-slate-700">·</span>
                      <button
                        onClick={() => cancelInvite(u.id)}
                        disabled={deletingId === u.id}
                        className="text-xs text-slate-500 hover:text-red-400 transition-colors disabled:opacity-50"
                      >
                        {deletingId === u.id ? 'Removing…' : 'Cancel'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-white font-semibold text-lg mb-4">Invite user</h2>
            {inviteStatus === 'sent' ? (
              <div className="text-center py-4">
                <div className="text-green-400 text-2xl mb-2">✓</div>
                <p className="text-white font-medium">Invite sent!</p>
                <p className="text-slate-400 text-sm mt-1">{inviteEmail} will receive an email to set their password.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Full name</label>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    placeholder="e.g. Scott Bastian"
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Email address</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="e.g. scott@queenforever.com.au"
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-xs block mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-400"
                  >
                    <option value="owner">Owner — full financials (Scott, Brad)</option>
                    <option value="production">Production — crew/specs only (Michael)</option>
                    <option value="crew">Crew — own schedule only (Adam, Darryn, Danny)</option>
                    <option value="external">External — read-only</option>
                  </select>
                </div>
                {inviteStatus === 'error' && (
                  <p className="text-red-400 text-xs">{inviteError}</p>
                )}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => { setShowInvite(false); setInviteStatus('idle'); setInviteError('') }}
                    className="flex-1 border border-slate-600 text-slate-400 text-sm font-medium py-2 rounded-lg hover:text-white hover:border-slate-400 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={sendInvite}
                    disabled={!inviteName || !inviteEmail || inviteStatus === 'sending'}
                    className="flex-1 bg-amber-400 text-slate-900 text-sm font-semibold py-2 rounded-lg hover:bg-amber-300 disabled:opacity-40 transition-colors"
                  >
                    {inviteStatus === 'sending' ? 'Sending…' : 'Send invite'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h2 className="text-white font-semibold mb-3">Permission levels</h2>
        <div className="space-y-2 text-sm">
          {[
            { role: 'admin',      desc: 'Full access — all runs, financials, user management, audit log. Gareth only.' },
            { role: 'owner',      desc: 'Full financial data — all runs, P&L, distributions. Scott & Brad.' },
            { role: 'production', desc: 'Production fields only — crew headcounts, specs, schedule. Michael.' },
            { role: 'crew',       desc: 'Own schedule and travel details only. Adam, Darryn, Danny.' },
            { role: 'external',   desc: 'Read-only show details as shared by admin.' },
          ].map((r) => (
            <div key={r.role} className="flex gap-3">
              <span className={`px-2 py-0.5 rounded border text-xs font-medium uppercase shrink-0 h-fit ${roleStyles[r.role]}`}>
                {r.role}
              </span>
              <span className="text-slate-400">{r.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

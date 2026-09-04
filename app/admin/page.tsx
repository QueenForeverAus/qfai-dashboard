'use client'

import { formatBookingStatus, formatHarbourStatus } from '@/lib/format-booking-status'
import { useState, useEffect, useCallback, useRef } from 'react'
import type { ImportPreview } from '@/app/api/admin/import-schedule/route'

type Profile = {
  id: string
  full_name: string
  email: string
  role: string
  last_sign_in_at?: string | null
}

type PendingUser = {
  id: string
  email: string
  full_name: string | null
  role: string | null
  invited_at: string
}

function fmtLastSeen(ts: string | null | undefined): string {
  if (!ts) return 'Never'
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

const roleStyles: Record<string, string> = {
  admin:      'bg-amber-900/40 text-amber-400 border-amber-800',
  owner:      'bg-purple-900/40 text-purple-400 border-purple-800',
  production: 'bg-blue-900/40 text-blue-400 border-blue-800',
  crew:       'bg-slate-700 text-slate-400 border-slate-600',
  external:   'bg-slate-700 text-slate-500 border-slate-600',
}

function ImportScheduleSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<{ shows_updated: number; runs_updated: number } | null>(null)
  const [error, setError] = useState('')

  async function handleFile(file: File) {
    setError('')
    setPreview(null)
    setApplyResult(null)
    setLoadingPreview(true)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/admin/import-schedule', { method: 'POST', body: form })
    setLoadingPreview(false)
    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Failed to parse file')
      return
    }
    setPreview(await res.json())
  }

  async function applyChanges() {
    if (!preview) return
    setApplying(true)
    const res = await fetch('/api/admin/import-schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: preview.updates, run_status_changes: preview.run_status_changes }),
    })
    setApplying(false)
    if (!res.ok) { setError('Apply failed'); return }
    const result = await res.json()
    setApplyResult(result)
    setPreview(null)
  }

  const hasChanges = preview && (preview.updates.length > 0 || preview.run_status_changes.length > 0)

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold">Import Harbour Schedule</h2>
          <p className="text-slate-400 text-xs mt-0.5">Upload a Harbour draft xlsx to sync venue names, capacities and run statuses</p>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          className="text-sm bg-slate-700 text-white font-medium px-3 py-1.5 rounded-lg hover:bg-slate-600 border border-slate-600 transition-colors"
        >
          Choose file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
        />
      </div>

      <div className="p-4">
        {error && (
          <div className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 mb-4">{error}</div>
        )}

        {loadingPreview && (
          <div className="text-slate-400 text-sm text-center py-6">Parsing spreadsheet…</div>
        )}

        {applyResult && (
          <div className="text-green-400 text-sm bg-green-900/20 border border-green-800 rounded-lg px-4 py-3">
            ✓ Applied: {applyResult.shows_updated} show{applyResult.shows_updated !== 1 ? 's' : ''} updated
            {applyResult.runs_updated > 0 && `, ${applyResult.runs_updated} run status${applyResult.runs_updated !== 1 ? 'es' : ''} updated`}
          </div>
        )}

        {preview && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-slate-400 text-xs">
                <span className="text-white font-medium">{preview.source_file}</span>
                {' — '}{preview.sheet_shows} shows in file, {preview.db_shows} in DB
              </p>
              {!hasChanges && (
                <span className="text-green-400 text-xs font-medium">No changes needed</span>
              )}
            </div>

            {preview.updates.length > 0 && (
              <div>
                <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wide mb-2">
                  Show updates ({preview.updates.length})
                </h3>
                <div className="rounded-lg overflow-hidden border border-slate-700">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-700/50">
                        <th className="px-3 py-2 text-left text-slate-400 font-medium">Run</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-medium">Date · Venue</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-medium">Field</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-medium">From</th>
                        <th className="px-3 py-2 text-left text-slate-400 font-medium">To</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.updates.flatMap(u =>
                        Object.entries(u.changes).map(([field, val], i) => (
                          <tr key={`${u.show_id}-${field}`} className="border-t border-slate-700/50">
                            {i === 0 && (
                              <td className="px-3 py-2 text-slate-300 font-mono font-bold" rowSpan={Object.keys(u.changes).length}>{u.run_code}</td>
                            )}
                            {i === 0 && (
                              <td className="px-3 py-2 text-slate-400" rowSpan={Object.keys(u.changes).length}>
                                {u.show_date}<br /><span className="text-slate-500">{u.venue_city}</span>
                              </td>
                            )}
                            <td className="px-3 py-2 text-slate-500 font-mono">{field}</td>
                            <td className="px-3 py-2 text-red-400/80">{String(val.from ?? '—')}</td>
                            <td className="px-3 py-2 text-green-400">{String(val.to ?? '—')}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {preview.run_status_changes.length > 0 && (
              <div>
                <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wide mb-2">
                  Run status changes ({preview.run_status_changes.length})
                </h3>
                <div className="space-y-1.5">
                  {preview.run_status_changes.map(r => (
                    <div key={r.run_id} className="flex items-center gap-3 text-xs px-3 py-2 bg-slate-700/30 rounded-lg">
                      <span className="font-mono font-bold text-slate-300">{r.run_code}</span>
                      <span className="text-red-400/80">{formatBookingStatus(r.old_status)}</span>
                      <span className="text-slate-500">→</span>
                      <span className="text-green-400">{formatBookingStatus(r.new_status)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {preview.new_in_sheet.length > 0 && (
              <div>
                <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wide mb-1">
                  New in spreadsheet — not in DB ({preview.new_in_sheet.length}) <span className="text-amber-400">⚠ manual review needed</span>
                </h3>
                <div className="text-xs text-slate-400 space-y-0.5 pl-2">
                  {preview.new_in_sheet.map(s => (
                    <div key={s.show_date}>{s.show_date} · {s.venue_city} — {s.venue_name} (cap {s.capacity ?? '?'}, {formatHarbourStatus(s.harbour_status)})</div>
                  ))}
                </div>
              </div>
            )}

            {preview.removed_from_sheet.length > 0 && (
              <div>
                <h3 className="text-slate-300 text-xs font-semibold uppercase tracking-wide mb-1">
                  In DB but not in spreadsheet ({preview.removed_from_sheet.length}) <span className="text-slate-500">— not touched</span>
                </h3>
                <div className="text-xs text-slate-500 space-y-0.5 pl-2">
                  {preview.removed_from_sheet.map(s => (
                    <div key={s.id}>[{s.run_code}] {s.show_date} · {s.venue_city} — {s.venue_name}</div>
                  ))}
                </div>
              </div>
            )}

            {hasChanges && (
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setPreview(null); if (fileRef.current) fileRef.current.value = '' }}
                  className="px-4 py-2 text-sm text-slate-400 border border-slate-600 rounded-lg hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={applyChanges}
                  disabled={applying}
                  className="px-5 py-2 text-sm font-semibold bg-amber-400 text-slate-900 rounded-lg hover:bg-amber-300 disabled:opacity-40 transition-colors"
                >
                  {applying ? 'Applying…' : `Apply ${preview.updates.length + preview.run_status_changes.length} change${preview.updates.length + preview.run_status_changes.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>
        )}

        {!preview && !loadingPreview && !error && !applyResult && (
          <div className="text-slate-500 text-sm text-center py-4">
            Upload a Harbour "Queen Schedule 20XX - Draft XX.xlsx" file to preview changes
          </div>
        )}
      </div>
    </div>
  )
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
    const [usersAuthRes, pendingRes] = await Promise.all([
      fetch('/api/admin/users-auth').then(r => r.json()),
      fetch('/api/admin/pending-users').then(r => r.json()),
    ])
    setProfiles((usersAuthRes.profiles ?? []) as Profile[])
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
    <div className="p-4 sm:p-6">
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
          <>
            {/* Mobile: card list */}
            <div className="md:hidden divide-y divide-slate-700/50">
              {profiles.map(profile => {
                const status = resetStatus[profile.email]
                return (
                  <div key={profile.id} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-white text-sm font-medium truncate">{profile.full_name}</div>
                        <div className="text-slate-400 text-xs truncate">{profile.email}</div>
                      </div>
                      <span className={`flex-shrink-0 px-2 py-0.5 rounded border text-xs font-medium uppercase ${roleStyles[profile.role] ?? roleStyles.external}`}>
                        {profile.role}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500 text-xs">Last active: {fmtLastSeen(profile.last_sign_in_at)}</span>
                      <button
                        onClick={() => sendResetLink(profile.email)}
                        disabled={status === 'sending'}
                        className="text-xs text-slate-500 hover:text-amber-400 transition-colors disabled:opacity-50"
                      >
                        {status === 'sending' ? 'Sending…' : status === 'sent' ? '✓ Sent' : status === 'error' ? '✗ Failed' : 'Send reset link'}
                      </button>
                    </div>
                  </div>
                )
              })}
              {pending.map(u => (
                <div key={u.id} className="px-4 py-3 space-y-1.5 bg-slate-800/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-slate-300 text-sm font-medium truncate">
                        {u.full_name ?? <span className="text-slate-500 italic">—</span>}
                      </div>
                      <div className="text-slate-400 text-xs truncate">{u.email}</div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      {u.role && (
                        <span className={`px-2 py-0.5 rounded border text-xs font-medium uppercase ${roleStyles[u.role] ?? roleStyles.external}`}>
                          {u.role}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded border text-xs font-medium border-yellow-700 text-yellow-500 bg-yellow-900/20">
                        pending
                      </span>
                    </div>
                  </div>
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
                </div>
              ))}
            </div>

            {/* Desktop: full table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Name</th>
                    <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Email</th>
                    <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Role</th>
                    <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Last active</th>
                    <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
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
                          <span className="text-slate-400 text-xs">{fmtLastSeen(profile.last_sign_in_at)}</span>
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
                        <span className="text-slate-600 text-xs">—</span>
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
            </div>
          </>
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

      <ImportScheduleSection />

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

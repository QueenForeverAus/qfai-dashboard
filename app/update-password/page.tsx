'use client'

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'

function UpdatePasswordForm() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [sessionWaited, setSessionWaited] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const isInviteSetup = searchParams.get('setup') === '1'
  const linkError = searchParams.get('error')

  useEffect(() => {
    const supabase = createClient()
    let settled = false

    async function markReady() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session && !settled) {
        settled = true
        setSessionReady(true)
      }
    }

    void markReady()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
        settled = true
        setSessionReady(true)
      }
    })

    const timeout = window.setTimeout(() => {
      if (!settled) setSessionWaited(true)
    }, 8000)

    return () => {
      subscription.unsubscribe()
      window.clearTimeout(timeout)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setError('This link did not create a signed-in session. Ask an admin to resend the invite.')
      setLoading(false)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setDone(true)
    setTimeout(() => router.push('/'), 2000)
  }

  const title = isInviteSetup ? 'Set your password' : 'Set new password'
  const subtitle = isInviteSetup
    ? 'Enter a password twice to finish setting up your account.'
    : 'Queen Forever Tours'

  const missingSession = (sessionWaited && !sessionReady) || linkError === 'missing_token'

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-amber-400 text-4xl">♛</span>
          <h1 className="text-white text-xl font-bold mt-2">{title}</h1>
          <p className="text-slate-400 text-sm mt-1">{subtitle}</p>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          {done ? (
            <div className="text-center py-2">
              <div className="text-green-400 text-2xl mb-2">✓</div>
              <p className="text-white font-medium">Password updated</p>
              <p className="text-slate-400 text-sm mt-1">You are signed in. Redirecting…</p>
            </div>
          ) : missingSession ? (
            <div className="space-y-3">
              <p className="text-red-400 text-sm">
                This invite or reset link is invalid or expired. Ask an admin to send a new invite.
              </p>
              <p className="text-slate-500 text-xs">
                First-time setup uses this page — not Forgot password.
              </p>
              <a href="/login" className="block text-center text-amber-400 text-sm hover:text-amber-300">
                Back to sign in
              </a>
            </div>
          ) : !sessionReady ? (
            <p className="text-slate-400 text-sm text-center py-2">Preparing your account…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4" data-testid="set-password-form">
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1.5">New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-slate-300 text-sm font-medium mb-1.5">Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  placeholder="Repeat password"
                  autoComplete="new-password"
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-900 font-semibold py-2.5 rounded-lg transition-colors"
              >
                {loading ? 'Saving…' : 'Set password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function UpdatePasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400 text-sm">
        Loading…
      </div>
    }>
      <UpdatePasswordForm />
    </Suspense>
  )
}

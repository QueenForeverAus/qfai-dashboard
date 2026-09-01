'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const router = useRouter()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault()
    setResetLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://tours.queenforever.com.au/update-password',
    })
    if (error) {
      setError(error.message)
    } else {
      setResetSent(true)
    }
    setResetLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Image src="/qf-logo.png" alt="Queen Forever" width={200} height={62} className="object-contain" priority />
          </div>
          <p className="text-slate-400 text-sm mt-1">Tour Management Portal</p>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 p-8">
          {resetMode ? (
            <>
              <h2 className="text-white text-lg font-semibold mb-2">Reset password</h2>
              <p className="text-slate-400 text-sm mb-6">Enter your email and we'll send you a reset link.</p>
              {resetSent ? (
                <div className="text-center py-2">
                  <div className="text-green-400 text-2xl mb-2">✓</div>
                  <p className="text-white font-medium">Check your email</p>
                  <p className="text-slate-400 text-sm mt-1">Reset link sent to {email}</p>
                  <button onClick={() => { setResetMode(false); setResetSent(false) }} className="text-amber-400 text-sm mt-4 hover:text-amber-300 transition-colors">
                    Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetRequest} className="space-y-4">
                  <div>
                    <label className="block text-slate-300 text-sm font-medium mb-1.5">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                      placeholder="you@queenforever.com.au"
                    />
                  </div>
                  {error && <div className="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 text-red-400 text-sm">{error}</div>}
                  <button type="submit" disabled={resetLoading} className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-900 font-semibold rounded-lg py-2.5 transition-colors">
                    {resetLoading ? 'Sending…' : 'Send reset link'}
                  </button>
                  <button type="button" onClick={() => setResetMode(false)} className="w-full text-slate-400 hover:text-white text-sm transition-colors py-1">
                    Back to sign in
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              <h2 className="text-white text-lg font-semibold mb-6">Sign in</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                    placeholder="you@queenforever.com.au"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-slate-300 text-sm font-medium">Password</label>
                    <button type="button" onClick={() => setResetMode(true)} className="text-slate-500 hover:text-amber-400 text-xs transition-colors">
                      Forgot password?
                    </button>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                    placeholder="••••••••"
                  />
                </div>
                {error && <div className="bg-red-900/30 border border-red-800 rounded-lg px-3 py-2 text-red-400 text-sm">{error}</div>}
                <button type="submit" disabled={loading} className="w-full bg-amber-400 hover:bg-amber-300 disabled:bg-amber-400/50 text-slate-900 font-semibold rounded-lg py-2.5 transition-colors">
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          Queen Forever Tours · Powered by QFAI
        </p>
      </div>
    </div>
  )
}

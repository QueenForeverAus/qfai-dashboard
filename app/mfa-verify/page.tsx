'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function MFAVerifyPage() {
  const [code, setCode] = useState('')
  const [factorId, setFactorId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    async function getFactors() {
      const supabase = createClient()
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error || !data?.totp?.length) { router.push('/mfa-enroll'); return }
      setFactorId(data.totp[0].id)
    }
    getFactors()
  }, [router])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId) return
    setError('')
    setLoading(true)
    const supabase = createClient()

    const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
    if (challengeError) { setError(challengeError.message); setLoading(false); return }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    })
    if (verifyError) { setError('Incorrect code — try again.'); setLoading(false); setCode(''); return }

    window.location.href = '/'
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-amber-400 text-4xl">♛</span>
          <h1 className="text-white text-xl font-bold mt-2">Two-factor authentication</h1>
          <p className="text-slate-400 text-sm mt-1">Enter the code from your authenticator app</p>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <form onSubmit={handleVerify} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              required
              autoFocus
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-3 text-white text-center text-2xl tracking-widest placeholder-slate-600 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
            />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading || code.length !== 6 || !factorId}
              className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-900 font-semibold py-2.5 rounded-lg transition-colors"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          Open your authenticator app to get the 6-digit code.
        </p>
      </div>
    </div>
  )
}

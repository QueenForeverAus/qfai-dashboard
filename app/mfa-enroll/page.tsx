'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function MFAEnrollPage() {
  const [qr, setQr] = useState('')
  const [secret, setSecret] = useState('')
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [enrolling, setEnrolling] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function enroll() {
      const supabase = createClient()
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Queen Forever Tours',
      })
      if (error || !data) { setError('Failed to start enrollment. Please refresh.'); setEnrolling(false); return }
      setQr(data.totp.qr_code)
      setSecret(data.totp.secret)
      setFactorId(data.id)
      setEnrolling(false)
    }
    enroll()
  }, [])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
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
          <h1 className="text-white text-xl font-bold mt-2">Set up two-factor authentication</h1>
          <p className="text-slate-400 text-sm mt-1">Required to access Queen Forever Tours</p>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          {enrolling ? (
            <p className="text-slate-400 text-sm text-center">Setting up…</p>
          ) : error && !qr ? (
            <p className="text-red-400 text-sm text-center">{error}</p>
          ) : (
            <>
              <ol className="text-slate-300 text-sm space-y-3 mb-5">
                <li><span className="text-amber-400 font-bold">1.</span> Install an authenticator app — Google Authenticator, Authy, or 1Password.</li>
                <li><span className="text-amber-400 font-bold">2.</span> Scan the QR code below.</li>
                <li><span className="text-amber-400 font-bold">3.</span> Enter the 6-digit code to confirm.</li>
              </ol>

              {qr && (
                <div className="flex flex-col items-center mb-5">
                  <div className="bg-white p-3 rounded-lg">
                    <Image src={qr} alt="MFA QR code" width={160} height={160} unoptimized />
                  </div>
                  <details className="mt-3 text-center">
                    <summary className="text-slate-500 text-xs cursor-pointer hover:text-slate-300">Can't scan? Use manual key</summary>
                    <code className="block mt-2 text-amber-400 text-xs break-all bg-slate-900 rounded px-2 py-1">{secret}</code>
                  </details>
                </div>
              )}

              <form onSubmit={handleVerify} className="space-y-3">
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit code"
                  maxLength={6}
                  required
                  autoFocus
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-center text-xl tracking-widest placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                />
                {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-900 font-semibold py-2.5 rounded-lg transition-colors"
                >
                  {loading ? 'Verifying…' : 'Activate 2FA'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

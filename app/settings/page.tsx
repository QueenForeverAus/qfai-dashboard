'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/lib/profile-context'
import {
  SEAT_PREFERENCES,
  SHIRT_SIZES,
  displayNameParts,
  MAX_HOTEL_MEMBERSHIPS,
  emptyHotelMembership,
  normalizeHotelMemberships,
  type HotelMembership,
  type ProfilePublic,
  type SeatPreference,
  type ShirtSize,
} from '@/lib/profile-self'
import { maskSensitiveLast4 } from '@/lib/profile-access'

const inputClass =
  'w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 [color-scheme:dark]'

const lockedInputClass =
  `${inputClass} read-only:text-slate-300 disabled:text-slate-300 disabled:opacity-80 cursor-default`

const labelClass = 'block text-slate-300 text-sm font-medium mb-1.5'

const SEAT_LABELS: Record<SeatPreference, string> = {
  middle: 'Middle',
  window: 'Window',
  aisle: 'Aisle',
}

type ProfileFormState = {
  first_name: string
  last_name: string
  nickname: string
  mobile: string
  email: string
  qantas_ff: string
  virgin_ff: string
  dietary_requirements: string
  seat_preference: SeatPreference | ''
  hotel_memberships: HotelMembership[]
  emergency_contact_name: string
  emergency_contact_mobile: string
  allergies_medical: string
  shirt_size: ShirtSize | ''
  passport_number: string
  nationality: string
  passport_name: string
  date_of_birth: string
  expiry_date: string
  place_of_issue: string
}

const EMPTY_FORM: ProfileFormState = {
  first_name: '',
  last_name: '',
  nickname: '',
  mobile: '',
  email: '',
  qantas_ff: '',
  virgin_ff: '',
  dietary_requirements: '',
  seat_preference: '',
  hotel_memberships: [emptyHotelMembership()],
  emergency_contact_name: '',
  emergency_contact_mobile: '',
  allergies_medical: '',
  shirt_size: '',
  passport_number: '',
  nationality: '',
  passport_name: '',
  date_of_birth: '',
  expiry_date: '',
  place_of_issue: '',
}

function formFromProfile(data: ProfilePublic): ProfileFormState {
  const names = displayNameParts(data)
  return {
    first_name: names.first,
    last_name: names.last,
    nickname: data.nickname ?? '',
    mobile: data.mobile ?? '',
    email: data.email ?? '',
    qantas_ff: data.qantas_ff ?? '',
    virgin_ff: data.virgin_ff ?? '',
    dietary_requirements: data.dietary_requirements ?? '',
    seat_preference: data.seat_preference ?? '',
    hotel_memberships: (() => {
      const rows = normalizeHotelMemberships(data.hotel_memberships)
      return rows.length > 0 ? rows : [emptyHotelMembership()]
    })(),
    emergency_contact_name: data.emergency_contact_name ?? '',
    emergency_contact_mobile: data.emergency_contact_mobile ?? '',
    allergies_medical: data.allergies_medical ?? '',
    shirt_size: data.shirt_size ?? '',
    passport_number: data.passport_number ?? '',
    nationality: data.nationality ?? '',
    passport_name: data.passport_name ?? '',
    date_of_birth: data.date_of_birth ?? '',
    expiry_date: data.expiry_date ?? '',
    place_of_issue: data.place_of_issue ?? '',
  }
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      {children}
      {hint && <p className="text-slate-500 text-xs mt-1">{hint}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
      <h2 className="text-white font-semibold mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

export default function ProfilePage() {
  const { refreshProfile } = useProfile()
  const [form, setForm] = useState<ProfileFormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me')
      .then(r => (r.ok ? r.json() : null))
      .then((data: ProfilePublic | null) => {
        if (cancelled || !data) return
        setForm(formFromProfile(data))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function set<K extends keyof ProfileFormState>(key: K, value: ProfileFormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaveError('')
    setSaving(true)
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const body = await res.json().catch(() => null)
    setSaving(false)
    if (!res.ok) {
      setSaveError(body?.error ?? 'Could not save profile.')
      return
    }
    if (body) setForm(formFromProfile(body as ProfilePublic))
    await refreshProfile()
    setEditing(false)
    setToast('Profile saved.')
    window.setTimeout(() => setToast(null), 3500)
  }

  const locked = !editing
  const fieldClass = locked ? lockedInputClass : inputClass

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwError('')
    setPwSuccess(false)

    if (password.length < 8) {
      setPwError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setPwError('Passwords do not match.')
      return
    }

    setPwLoading(true)
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) { setPwError('Not signed in.'); setPwLoading(false); return }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    })
    if (signInError) { setPwError('Current password is incorrect.'); setPwLoading(false); return }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) { setPwError(updateError.message); setPwLoading(false); return }

    setPwSuccess(true)
    setCurrent('')
    setPassword('')
    setConfirm('')
    setPwLoading(false)
  }

  if (loading) {
    return (
      <div className="p-6 max-w-2xl">
        <p className="text-slate-500 text-sm">Loading profile…</p>
      </div>
    )
  }

  return (
    <div className="relative p-6 max-w-2xl">
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg bg-emerald-900/90 border border-emerald-600 text-emerald-200 text-sm shadow-lg">
          {toast}
        </div>
      )}

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-white text-2xl font-bold">Profile</h1>
          <p className="text-slate-400 text-sm mt-1">
            Your band and crew details. Visible to you, and to Portal owners/admins for tour ops.
          </p>
        </div>
        {locked && (
          <button
            type="button"
            data-testid="profile-edit"
            onClick={() => setEditing(true)}
            className="flex-shrink-0 bg-slate-700 hover:bg-slate-600 text-white font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-5" data-testid={locked ? 'profile-locked' : 'profile-editing'}>
        <Section title="Contact">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="First name">
              <input className={fieldClass} value={form.first_name} onChange={e => set('first_name', e.target.value)} autoComplete="given-name" readOnly={locked} />
            </Field>
            <Field label="Second / last name">
              <input className={fieldClass} value={form.last_name} onChange={e => set('last_name', e.target.value)} autoComplete="family-name" readOnly={locked} />
            </Field>
          </div>
          <Field label="Nickname">
            <input className={fieldClass} value={form.nickname} onChange={e => set('nickname', e.target.value)} readOnly={locked} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Mobile">
              <input className={fieldClass} value={form.mobile} onChange={e => set('mobile', e.target.value)} type="tel" autoComplete="tel" readOnly={locked} />
            </Field>
            <Field label="Email address" hint="Contact email on file. This does not change the email you use to sign in.">
              <input className={fieldClass} value={form.email} onChange={e => set('email', e.target.value)} type="email" autoComplete="email" required readOnly={locked} />
            </Field>
          </div>
        </Section>

        <Section title="Frequent flyer">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Qantas FF#">
              <input
                className={fieldClass}
                data-testid="profile-qantas-ff"
                value={locked ? maskSensitiveLast4(form.qantas_ff) : form.qantas_ff}
                onChange={e => set('qantas_ff', e.target.value)}
                autoComplete="off"
                readOnly={locked}
              />
            </Field>
            <Field label="Virgin FF#">
              <input
                className={fieldClass}
                data-testid="profile-virgin-ff"
                value={locked ? maskSensitiveLast4(form.virgin_ff) : form.virgin_ff}
                onChange={e => set('virgin_ff', e.target.value)}
                autoComplete="off"
                readOnly={locked}
              />
            </Field>
          </div>
        </Section>

        <Section title="Travel preferences">
          <Field label="Dietary requirements">
            <textarea
              className={fieldClass}
              rows={2}
              value={form.dietary_requirements}
              onChange={e => set('dietary_requirements', e.target.value)}
              readOnly={locked}
            />
          </Field>
          <Field label="Seat preference (planes)" hint="Leave blank if you have no preference.">
            <select
              className={fieldClass}
              value={form.seat_preference}
              onChange={e => set('seat_preference', e.target.value as SeatPreference | '')}
              disabled={locked}
            >
              <option value="">No preference</option>
              {SEAT_PREFERENCES.map(value => (
                <option key={value} value={value}>{SEAT_LABELS[value]}</option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="Emergency & extras">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Emergency contact name">
              <input className={fieldClass} value={form.emergency_contact_name} onChange={e => set('emergency_contact_name', e.target.value)} readOnly={locked} />
            </Field>
            <Field label="Emergency contact mobile">
              <input className={fieldClass} value={form.emergency_contact_mobile} onChange={e => set('emergency_contact_mobile', e.target.value)} type="tel" readOnly={locked} />
            </Field>
          </div>
          <div>
            <p className={labelClass}>Hotel memberships</p>
            <p className="text-slate-500 text-xs mb-2">Programme name and membership number. Add as many as you use — no brand list.</p>
            <div className="space-y-3">
              {form.hotel_memberships.map((row, index) => (
                <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
                  <Field label="Programme name">
                    <input
                      className={fieldClass}
                      value={row.programme_name}
                      onChange={e => {
                        const next = [...form.hotel_memberships]
                        next[index] = { ...next[index], programme_name: e.target.value }
                        set('hotel_memberships', next)
                      }}
                      placeholder="e.g. Accor Plus"
                      autoComplete="off"
                      readOnly={locked}
                    />
                  </Field>
                  <Field label="Membership number">
                    <input
                      className={fieldClass}
                      value={row.membership_number}
                      onChange={e => {
                        const next = [...form.hotel_memberships]
                        next[index] = { ...next[index], membership_number: e.target.value }
                        set('hotel_memberships', next)
                      }}
                      autoComplete="off"
                      readOnly={locked}
                    />
                  </Field>
                  {!locked && form.hotel_memberships.length > 1 && (
                    <button
                      type="button"
                      onClick={() => set('hotel_memberships', form.hotel_memberships.filter((_, i) => i !== index))}
                      className="text-slate-400 hover:text-white text-sm px-2 py-2.5"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!locked && form.hotel_memberships.length < MAX_HOTEL_MEMBERSHIPS && (
              <button
                type="button"
                onClick={() => set('hotel_memberships', [...form.hotel_memberships, emptyHotelMembership()])}
                className="mt-3 text-amber-400 hover:text-amber-300 text-sm font-medium"
              >
                + Add another
              </button>
            )}
          </div>
          <Field label="Allergies / medical notes">
            <textarea
              className={fieldClass}
              rows={2}
              value={form.allergies_medical}
              onChange={e => set('allergies_medical', e.target.value)}
              readOnly={locked}
            />
          </Field>
          <Field label="Shirt size">
            <select
              className={fieldClass}
              value={form.shirt_size}
              onChange={e => set('shirt_size', e.target.value as ShirtSize | '')}
              disabled={locked}
            >
              <option value="">Select…</option>
              {SHIRT_SIZES.map(size => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="Passport">
          <p className="text-slate-500 text-xs -mt-2">
            Sensitive travel ID. Used for flights and border forms. Not written to Audit Trail.
          </p>
          <Field label="Passport number">
            <input
              className={fieldClass}
              data-testid="profile-passport-number"
              value={locked ? maskSensitiveLast4(form.passport_number) : form.passport_number}
              onChange={e => set('passport_number', e.target.value)}
              autoComplete="off"
              readOnly={locked}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Country / nationality of passport">
              <input className={fieldClass} value={form.nationality} onChange={e => set('nationality', e.target.value)} readOnly={locked} />
            </Field>
            <Field label="Place of issue" hint="Optional">
              <input className={fieldClass} value={form.place_of_issue} onChange={e => set('place_of_issue', e.target.value)} readOnly={locked} />
            </Field>
          </div>
          <Field label="Full name as on passport" hint="Leave blank if it matches your profile name.">
            <input className={fieldClass} value={form.passport_name} onChange={e => set('passport_name', e.target.value)} readOnly={locked} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Date of birth" hint="Needed for flights / NZ.">
              <input className={fieldClass} type="date" value={form.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} readOnly={locked} />
            </Field>
            <Field label="Expiry date" hint="Required if any passport field is filled. Stored for a later expiry warning — no alert in this release.">
              <input className={fieldClass} type="date" value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} readOnly={locked} />
            </Field>
          </div>
        </Section>

        {saveError && <p className="text-red-400 text-sm">{saveError}</p>}
        {!locked && (
          <button
            type="submit"
            data-testid="profile-save"
            disabled={saving}
            className="bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-900 font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        )}
      </form>

      <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mt-8">
        <h2 className="text-white font-semibold mb-4">Change password</h2>
        {pwSuccess && (
          <div className="mb-4 text-green-400 text-sm bg-green-900/20 border border-green-800 rounded-lg px-3 py-2">
            Password updated successfully.
          </div>
        )}
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className={labelClass}>Current password</label>
            <input
              type="password"
              value={current}
              onChange={e => setCurrent(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>New password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="Minimum 8 characters"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          {pwError && <p className="text-red-400 text-sm">{pwError}</p>}
          <button
            type="submit"
            disabled={pwLoading}
            className="bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-slate-900 font-semibold px-4 py-2.5 rounded-lg transition-colors"
          >
            {pwLoading ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}

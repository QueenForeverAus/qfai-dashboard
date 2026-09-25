'use client'

import { useState } from 'react'
import { isoToWallInput, MELBOURNE_TZ, type OnsaleTrackerRecord } from '@/lib/onsale-tracker'
import {
  formValuesToPatch,
  trackerToForm,
  type OnsaleFormValues,
} from '@/lib/onsale-tracker-patch'

const inputClass = 'mt-1 w-full bg-slate-900 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-amber-400'

const STAMP: Partial<Record<keyof OnsaleFormValues, { value: string; target: keyof OnsaleFormValues }>> = {
  ticket_link_state: { value: 'received', target: 'ticket_link_received_at' },
  edm_state: { value: 'draft_received', target: 'edm_received_at' },
  fb_event_state: { value: 'live', target: 'fb_event_live_at' },
  er_ad_state: { value: 'paused', target: 'er_paused_since' },
  ticket_ad_state: { value: 'paused', target: 'ticket_paused_since' },
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-400 text-xs">{label}</span>
      {children}
    </label>
  )
}

function TextInput({
  label,
  name,
  value,
  onChange,
}: {
  label: string
  name: keyof OnsaleFormValues
  value: string
  onChange: (name: keyof OnsaleFormValues, value: string) => void
}) {
  return (
    <FieldLabel label={label}>
      <input className={inputClass} name={name} value={value} onChange={event => onChange(name, event.target.value)} />
    </FieldLabel>
  )
}

function DateTimeInput({
  label,
  name,
  value,
  onChange,
}: {
  label: string
  name: keyof OnsaleFormValues
  value: string
  onChange: (name: keyof OnsaleFormValues, value: string) => void
}) {
  return (
    <FieldLabel label={label}>
      <span className="flex gap-2 items-center">
        <input
          type="datetime-local"
          step={1}
          className={inputClass}
          name={name}
          value={value}
          onChange={event => onChange(name, event.target.value)}
        />
        {value && (
          <button type="button" className="text-xs text-slate-400 hover:text-white shrink-0" onClick={() => onChange(name, '')}>
            Clear
          </button>
        )}
      </span>
    </FieldLabel>
  )
}

function StateSelect({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string
  name: keyof OnsaleFormValues
  value: string
  options: { value: string; label: string }[]
  onChange: (name: keyof OnsaleFormValues, value: string) => void
}) {
  return (
    <FieldLabel label={label}>
      <select className={inputClass} name={name} value={value} onChange={event => onChange(name, event.target.value)}>
        <option value="">unknown</option>
        {options.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </FieldLabel>
  )
}

export default function OnsaleEditDrawer({
  showId,
  title,
  tracker,
  nowIso,
  onClose,
  onSaved,
}: {
  showId: string
  title: string
  tracker: OnsaleTrackerRecord | null
  nowIso: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<OnsaleFormValues>(() => trackerToForm(tracker))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setField(name: keyof OnsaleFormValues, value: string) {
    setForm(prev => {
      const next = { ...prev, [name]: value }
      const stamp = STAMP[name]
      if (stamp && value === stamp.value && !prev[stamp.target]) {
        next[stamp.target] = isoToWallInput(nowIso, MELBOURNE_TZ)
      }
      return next
    })
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const built = formValuesToPatch(form)
    if (!built.ok) {
      setError(built.error)
      return
    }
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/ticket-sales/onsale/${showId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(built.body),
    })
    const body = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setError(typeof body.error === 'string' ? body.error : 'Could not save')
      return
    }
    onSaved()
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <button type="button" className="absolute inset-0 bg-slate-950/70" aria-label="Close editor" onClick={onClose} />
      <form
        onSubmit={event => { void onSubmit(event) }}
        className="relative h-full w-full max-w-lg bg-slate-900 border-l border-slate-700 overflow-y-auto px-4 py-5"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Edit on-sale tracker</h2>
            <p className="text-slate-400 text-sm mt-1">{title}</p>
            <p className="text-slate-500 text-xs mt-1">Times are entered in Melbourne time (AEST/AEDT). Blank means unknown.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white text-sm">Close</button>
        </div>

        {error && (
          <div className="text-red-300 text-sm bg-red-950/50 border border-red-800 rounded-lg px-3 py-2 mb-3">{error}</div>
        )}

        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mt-2 mb-2">Key dates</h3>
        <div className="space-y-3">
          <DateTimeInput label="Announce" name="announce_at" value={form.announce_at} onChange={setField} />
          <DateTimeInput label="Presale" name="presale_at" value={form.presale_at} onChange={setField} />
          <DateTimeInput label="General on-sale" name="general_onsale_at" value={form.general_onsale_at} onChange={setField} />
          <TextInput label="Show local time zone (IANA)" name="show_local_tz" value={form.show_local_tz} onChange={setField} />
        </div>

        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mt-5 mb-2">Ticket link</h3>
        <div className="space-y-3">
          <StateSelect
            label="State"
            name="ticket_link_state"
            value={form.ticket_link_state}
            onChange={setField}
            options={[
              { value: 'none', label: 'none' },
              { value: 'received', label: 'received' },
              { value: 'approved', label: 'approved' },
              { value: 'live', label: 'live' },
            ]}
          />
          <TextInput label="URL" name="ticket_link_url" value={form.ticket_link_url} onChange={setField} />
          <TextInput label="Platform" name="ticket_link_platform" value={form.ticket_link_platform} onChange={setField} />
          <DateTimeInput label="Received" name="ticket_link_received_at" value={form.ticket_link_received_at} onChange={setField} />
          <DateTimeInput label="Approved" name="ticket_link_approved_at" value={form.ticket_link_approved_at} onChange={setField} />
          <DateTimeInput label="Live" name="ticket_link_live_at" value={form.ticket_link_live_at} onChange={setField} />
        </div>

        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mt-5 mb-2">EDM</h3>
        <div className="space-y-3">
          <StateSelect
            label="State"
            name="edm_state"
            value={form.edm_state}
            onChange={setField}
            options={[
              { value: 'none', label: 'none' },
              { value: 'draft_received', label: 'draft received' },
              { value: 'approved', label: 'approved' },
              { value: 'sent_scheduled', label: 'sent-scheduled' },
            ]}
          />
          <DateTimeInput label="Draft received" name="edm_received_at" value={form.edm_received_at} onChange={setField} />
          <FieldLabel label="Send date (date only)">
            <input type="date" className={inputClass} name="edm_send_date" value={form.edm_send_date} onChange={event => setField('edm_send_date', event.target.value)} />
          </FieldLabel>
          <DateTimeInput label="Send time" name="edm_send_at" value={form.edm_send_at} onChange={setField} />
        </div>

        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mt-5 mb-2">Website</h3>
        <div className="space-y-3">
          <StateSelect
            label="State"
            name="website_state"
            value={form.website_state}
            onChange={setField}
            options={[
              { value: 'not_built', label: 'not built' },
              { value: 'scheduled', label: 'scheduled' },
              { value: 'live', label: 'live' },
            ]}
          />
          <DateTimeInput label="Go-live" name="website_go_live_at" value={form.website_go_live_at} onChange={setField} />
          <TextInput label="WP post id" name="website_wp_post_id" value={form.website_wp_post_id} onChange={setField} />
          <TextInput label="URL" name="website_url" value={form.website_url} onChange={setField} />
        </div>

        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mt-5 mb-2">FB Event</h3>
        <div className="space-y-3">
          <StateSelect
            label="State"
            name="fb_event_state"
            value={form.fb_event_state}
            onChange={setField}
            options={[
              { value: 'none', label: 'none' },
              { value: 'drafted', label: 'drafted' },
              { value: 'live', label: 'live' },
            ]}
          />
          <TextInput label="Event id" name="fb_event_id" value={form.fb_event_id} onChange={setField} />
          <TextInput label="URL" name="fb_event_url" value={form.fb_event_url} onChange={setField} />
          <DateTimeInput label="Live" name="fb_event_live_at" value={form.fb_event_live_at} onChange={setField} />
          <StateSelect
            label="Venue co-host"
            name="fb_event_venue_cohost"
            value={form.fb_event_venue_cohost}
            onChange={setField}
            options={[
              { value: 'true', label: 'yes' },
              { value: 'false', label: 'no' },
            ]}
          />
        </div>

        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mt-5 mb-2">ER ad</h3>
        <div className="space-y-3">
          <StateSelect
            label="State"
            name="er_ad_state"
            value={form.er_ad_state}
            onChange={setField}
            options={[
              { value: 'none', label: 'none' },
              { value: 'paused', label: 'paused (waiting on GO)' },
              { value: 'running', label: 'running' },
              { value: 'ended', label: 'ended' },
            ]}
          />
          <TextInput label="Campaign id" name="er_campaign_id" value={form.er_campaign_id} onChange={setField} />
          <DateTimeInput label="Paused since" name="er_paused_since" value={form.er_paused_since} onChange={setField} />
          <TextInput label="Spend to date" name="er_spend_to_date" value={form.er_spend_to_date} onChange={setField} />
          <TextInput label="Budget" name="er_budget" value={form.er_budget} onChange={setField} />
        </div>

        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mt-5 mb-2">Ticket ad</h3>
        <div className="space-y-3">
          <StateSelect
            label="State"
            name="ticket_ad_state"
            value={form.ticket_ad_state}
            onChange={setField}
            options={[
              { value: 'none', label: 'none' },
              { value: 'paused', label: 'paused (waiting on GO)' },
              { value: 'running', label: 'running' },
              { value: 'ended', label: 'ended' },
            ]}
          />
          <TextInput label="Campaign id" name="ticket_campaign_id" value={form.ticket_campaign_id} onChange={setField} />
          <DateTimeInput label="Paused since" name="ticket_paused_since" value={form.ticket_paused_since} onChange={setField} />
          <TextInput label="Spend to date" name="ticket_spend_to_date" value={form.ticket_spend_to_date} onChange={setField} />
          <TextInput label="Budget" name="ticket_budget" value={form.ticket_budget} onChange={setField} />
        </div>

        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mt-5 mb-2">Pixel</h3>
        <div className="space-y-3">
          <StateSelect
            label="State"
            name="pixel_state"
            value={form.pixel_state}
            onChange={setField}
            options={[
              { value: 'ours_added', label: 'ours added' },
              { value: 'chasing', label: 'chasing' },
              { value: 'cant_add', label: "can't add" },
            ]}
          />
          <TextInput label="Platform" name="pixel_platform" value={form.pixel_platform} onChange={setField} />
          <DateTimeInput label="Verified" name="pixel_verified_at" value={form.pixel_verified_at} onChange={setField} />
        </div>

        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mt-5 mb-2">Next action</h3>
        <div className="space-y-3">
          <TextInput label="Next action" name="next_action" value={form.next_action} onChange={setField} />
          <StateSelect
            label="Owner"
            name="next_action_owner"
            value={form.next_action_owner}
            onChange={setField}
            options={[
              { value: 'Gareth', label: 'Gareth' },
              { value: 'Comms', label: 'Comms' },
              { value: 'Website', label: 'Website' },
              { value: 'Marketing', label: 'Marketing' },
              { value: 'Harbour', label: 'Harbour' },
            ]}
          />
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={form.manual_red_flag === 'true'}
              onChange={event => setField('manual_red_flag', event.target.checked ? 'true' : 'false')}
            />
            Manual red flag
          </label>
          <TextInput label="Flag reason" name="manual_red_reason" value={form.manual_red_reason} onChange={setField} />
        </div>

        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mt-5 mb-2">Notes / Source of Data</h3>
        <div className="space-y-3">
          <FieldLabel label="Notes">
            <textarea
              name="notes"
              rows={4}
              value={form.notes}
              onChange={event => setField('notes', event.target.value)}
              className={inputClass}
            />
          </FieldLabel>
          <FieldLabel label="Source of Data">
            <textarea
              name="source_of_data"
              rows={3}
              value={form.source_of_data}
              onChange={event => setField('source_of_data', event.target.value)}
              className={inputClass}
            />
          </FieldLabel>
        </div>

        <div className="sticky bottom-0 mt-5 -mx-4 px-4 py-3 bg-slate-900 border-t border-slate-700 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-sm text-slate-300 px-3 py-2">Cancel</button>
          <button
            type="submit"
            data-testid="onsale-save"
            disabled={saving}
            className="text-sm bg-amber-400 text-slate-900 font-semibold px-3 py-2 rounded-lg hover:bg-amber-300 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}

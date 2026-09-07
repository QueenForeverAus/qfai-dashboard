'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useProfile, canAccessTab } from '@/lib/profile-context'
import AdvancementTab from './AdvancementTab'
import ShowPackTab from './ShowPackTab'
import TicketOutlookBlock from './TicketOutlookBlock'
import { formatDateShortAU } from '@/lib/dates'
import { runDateRangeFromShows } from '@/lib/run-dates'
import {
  normalizeCapacityBands,
  topBandSeats,
  modelledVenueStaffForTickets,
} from '@/lib/capacity-bands'
import {
  allEntriesConfirmed,
  allEntriesPaid,
  canMarkEntryPaid,
  CONFIRMED_FIELD_STATE,
  displayCostFieldChipLabel,
  displayCostFieldChromeState,
  entriesSum as sumEntries,
  ensureMinimumEntry,
  entryIsAttested,
  entryIsPaidLocked,
  ENTRY_EXEMPT_FIELD_KEYS,
  DEFINED_RUN_COST_FIELDS,
  DEFINED_SHOW_COST_FIELDS,
  findMissingDefinedCostFields,
  buildCreateCostFieldBody,
  hasBulkPaidSnapshot,
  lineItemsSum,
  normalizeLineItems,
  roleCanSeeCostField,
  canEditCostFields,
  productionCanEditFieldKey,
  sectionEditSelectValue,
  sectionPayableLines,
  SECTION_BULK_PAID_VALUE,
  type CostEntry,
  type CostFieldState,
  type PayableLine,
  type SectionEditValue,
  type StaffLineItem,
} from '@/lib/cost-fields'
import {
  NOTES_SOURCE_OF_DATA_LABEL,
  NOTES_INPUT_LABEL,
  enteredByLabel,
  formatNotesSource,
  staffDisplayName,
} from '@/lib/cost-entry-source'
import QuoteInvoiceStub from '@/components/QuoteInvoiceStub'
import { PnlRevenueBlock, PnlSummaryBlock, venuePnl } from './PnlOwnerChrome'
import {
  canSeeOwnerPnl,
  computePnlSummary,
  pnlSlidersUnlocked,
  type InsideFactorValues,
  type KnownInsideLine,
} from '@/lib/pnl-run-costing'

type FieldState = CostFieldState

type LineItem = StaffLineItem

type Entry = CostEntry

const PAID_BADGE = { bg: 'bg-teal-900/40', text: 'text-teal-300', border: 'border-teal-800', label: 'PAID' }

type Show = {
  id: string
  venue_name: string
  venue_city: string
  state_territory: string | null
  show_date: string | null
  capacity: number | null
  capacity_bands?: unknown | null
  ticket_price: number | null
  sell_through_pct: number | null
  show_order: number
  ticket_outlook?: string | null
  ticket_outlook_level?: 'clear' | 'watch' | 'impediment' | null
  ticket_outlook_status?: 'empty' | 'draft' | 'confirmed'
  ticket_outlook_as_of?: string | null
  ticket_outlook_sources?: unknown
  booking_fee_per_payer?: number | null
  cc_fee_pct?: number | null
}

type CostFieldRow = {
  id: string
  run_id: string
  show_id: string | null
  category: string
  field_key: string
  label: string
  value: number | null
  state: string
  source: string | null
  updated_by?: string | null
  line_items: LineItem[] | null
  entries: Entry[] | null
}

type AuditEntry = {
  id: string
  changed_at: string
  changed_by_name: string | null
  sentence: string
}

const STATE_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  known:     { bg: 'bg-green-900/30',  text: 'text-green-400',  border: 'border-green-800',  label: 'CONFIRMED' },
  estimated: { bg: 'bg-orange-900/30', text: 'text-orange-400', border: 'border-orange-800', label: 'ESTIMATE' },
  guess:     { bg: 'bg-red-900/30',    text: 'text-red-400',    border: 'border-red-800',    label: 'GUESS' },
  pending:   { bg: 'bg-red-900/20',    text: 'text-red-400',    border: 'border-red-900',    label: 'FIGURES NEEDED' },
  figures_needed: { bg: 'bg-red-900/20', text: 'text-red-400', border: 'border-red-900', label: 'FIGURES NEEDED' },
  auto_calc: { bg: 'bg-slate-800/60',  text: 'text-slate-400',  border: 'border-slate-700',  label: 'AUTO CALC' },
}

function stateStyles(state: string | null | undefined) {
  return STATE_STYLES[state ?? ''] ?? STATE_STYLES.pending
}

/** Display overlay: all-PAID uses confirmed chrome + chip. Stored state is unchanged. */
function sectionChrome(figureState: string, lines: PayableLine[]) {
  const chromeState = displayCostFieldChromeState(figureState, lines)
  const styles = stateStyles(chromeState)
  const chipLabel = displayCostFieldChipLabel(figureState, lines, styles.label)
  return {
    chromeState,
    styles,
    chipLabel,
    allPaid: allEntriesPaid(lines),
    chromeAttr: chromeState === CONFIRMED_FIELD_STATE ? 'confirmed' : chromeState,
  }
}

function figureStateFromSelect(value: SectionEditValue, fallback: FieldState): FieldState {
  return value === SECTION_BULK_PAID_VALUE ? fallback : value
}

function SectionEditSelect({
  value,
  onChange,
  canBulkPaid,
}: {
  value: SectionEditValue
  onChange: (next: SectionEditValue) => void
  canBulkPaid: boolean
}) {
  const bulkEnabled = canBulkPaid || value === SECTION_BULK_PAID_VALUE
  return (
    <select
      data-testid="cost-field-edit-select"
      value={value}
      onChange={(e) => onChange(e.target.value as SectionEditValue)}
      className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-slate-300 text-xs focus:outline-none focus:border-amber-400"
    >
      <option value="known">Confirmed</option>
      <option value="estimated">Estimate</option>
      <option value="guess">Guess</option>
      <option value="pending">Figures Needed</option>
      <option value="auto_calc">Auto Calc</option>
      <option
        value={SECTION_BULK_PAID_VALUE}
        disabled={!bulkEnabled}
        data-testid="cost-field-bulk-paid-option"
        title={bulkEnabled
          ? 'Marks every line paid and locked. Unticked lines are confirmed by this action. Undo by choosing Confirmed / Estimate / Guess (restores prior paid flags only).'
          : 'Add at least one line first'}
      >
        MARK ALL AS PAID
      </option>
    </select>
  )
}

// Fields that default to GST-not-included for new entries
const NO_GST_DEFAULTS = new Set(['per_diems', 'brad_driver_fee'])

const SHOW_FIELDS = DEFINED_SHOW_COST_FIELDS.map(f => ({
  key: f.key,
  label: f.label,
  category: f.category,
  defaultState: f.defaultState as FieldState,
}))

const RUN_FIELDS = DEFINED_RUN_COST_FIELDS.map(f => ({
  key: f.key,
  label: f.label,
  category: f.category,
  defaultState: f.defaultState as FieldState,
}))


function entriesSum(entries: Entry[] | null | undefined): number {
  return sumEntries(entries)
}

/**
 * Line total = sum(entries) when entries exist.
 * venue_staff: if planned line_items exist and entries are only a placeholder,
 * prefer line_items sum when value was set from roles; still prefer entries when
 * they carry the amount (API keeps them in sync on entry edits).
 */
function effectiveFieldValue(row: CostFieldRow | undefined): number | null {
  if (!row) return null
  const fromEntries = entriesSum(row.entries)
  if (row.entries && row.entries.length > 0) {
    // venue_staff with planned roles: value may track line_items; show value if set
    if (
      row.field_key === 'venue_staff' &&
      Array.isArray(row.line_items) &&
      row.line_items.length > 0 &&
      row.value != null
    ) {
      return row.value
    }
    return fromEntries
  }
  if (row.value !== null && row.value !== undefined) return row.value
  return null
}

async function patchCostField(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/cost-fields/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error ?? `Save failed (${res.status})`)
  }
  return data as CostFieldRow
}

async function createCostField(body: Record<string, unknown>) {
  const res = await fetch('/api/cost-fields', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error ?? `Create failed (${res.status})`)
  }
  return data as CostFieldRow
}

function fmt(n: number | null) {
  if (n === null) return '—'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
}


// ─── Entry / Receipts panel ──────────────────────────────────────────────────


function editorNameForField(
  field: CostFieldRow | undefined,
  names: Record<string, string>,
  profile: { id: string; full_name: string } | null,
): string | null {
  if (field?.updated_by && profile?.id === field.updated_by) {
    return staffDisplayName(profile.full_name)
  }
  if (field?.id && names[field.id]) return names[field.id]
  return null
}

function EntryRow({
  entry,
  onUpdate,
  onRemove,
  canRemove,
  fieldSource,
  fieldKey,
  editorDisplayName,
  onStubUpdate,
  onAttachFile,
  stubBusy,
}: {
  entry: Entry
  onUpdate: (updated: Entry) => void
  onRemove: () => void
  canRemove: boolean
  fieldSource?: string | null
  fieldKey?: string | null
  editorDisplayName?: string | null
  onStubUpdate: (updated: Entry) => void
  onAttachFile: (file: File) => void
  stubBusy?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [desc, setDesc] = useState(entry.description)
  const [notes, setNotes] = useState(entry.notes)
  const [amount, setAmount] = useState(entry.amount.toString())
  const [gst, setGst] = useState(entry.gst_included)

  const locked = entryIsPaidLocked(entry)
  const attested = entryIsAttested(entry)
  const showPaidControl = canMarkEntryPaid(entry) || entry.paid

  function save() {
    if (locked) return
    onUpdate({ ...entry, description: desc, notes, amount: parseFloat(amount) || 0, gst_included: gst })
    setEditing(false)
  }

  function toggleConfirmed() {
    if (locked) return
    onUpdate({ ...entry, confirmed: !entry.confirmed })
  }

  function togglePaid() {
    if (entry.paid) {
      onUpdate({ ...entry, paid: false, paid_at: null })
      return
    }
    if (!canMarkEntryPaid(entry)) return
    onUpdate({ ...entry, paid: true, paid_at: new Date().toISOString() })
  }

  const notesRef = formatNotesSource({
    notes: entry.notes,
    fieldSource,
    fieldKey,
    editorDisplayName,
  })

  if (editing && !locked) {
    return (
      <div className="py-1.5 border-t border-slate-700/30 first:border-0 space-y-1.5">
        <input autoFocus value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="Description"
          className="w-full bg-slate-900 border border-amber-400/50 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-400" />
        <input value={notes} onChange={e => setNotes(e.target.value)}
          placeholder={NOTES_INPUT_LABEL}
          aria-label={NOTES_INPUT_LABEL}
          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-400" />
        <div className="flex items-center gap-1.5">
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-400" />
          <label className="flex items-center gap-1 text-xs text-slate-400 whitespace-nowrap cursor-pointer select-none">
            <input type="checkbox" checked={gst} onChange={e => setGst(e.target.checked)} className="accent-amber-400" /> GST
          </label>
          <button onClick={save}
            className="ml-auto bg-amber-400 text-slate-900 text-xs font-semibold px-2.5 py-1 rounded hover:bg-amber-300 transition-colors whitespace-nowrap">
            Save
          </button>
          <button onClick={() => setEditing(false)} className="text-slate-600 hover:text-slate-300 text-xs transition-colors px-1">✕</button>
        </div>
        <QuoteInvoiceStub
          filename={entry.attachment_filename}
          quoteNote={entry.quote_note}
          busy={stubBusy}
          testIdPrefix={`cost-entry-${entry.id}`}
          onNoteCommit={note => onStubUpdate({ ...entry, quote_note: note })}
          onAttach={onAttachFile}
          onRemove={() => onStubUpdate({
            ...entry,
            attachment_path: null,
            attachment_filename: null,
            attachment_mime: null,
          })}
        />
      </div>
    )
  }

  return (
    <div
      data-testid="entry-row"
      data-paid={entry.paid ? 'true' : 'false'}
      data-locked={locked ? 'true' : 'false'}
      className={`py-1.5 border-t border-slate-700/30 first:border-0 group ${locked ? 'opacity-90' : ''}`}>
      {/* Desktop: Confirm | Paid | Description | Notes / Source of Data | Amount | GST | actions */}
      <div className="hidden sm:flex items-center gap-1.5">
        <button
          type="button"
          data-testid="entry-confirm-tick"
          aria-pressed={attested}
          aria-disabled={locked}
          disabled={locked}
          onClick={toggleConfirmed}
          title={locked ? 'Paid — un-pay to change confirmation' : attested ? 'Mark as estimate' : 'Mark as confirmed'}
          className={`flex-shrink-0 text-xs font-bold w-5 h-5 flex items-center justify-center rounded transition-colors disabled:cursor-not-allowed ${
            attested ? 'text-green-400 bg-green-900/40' : 'text-slate-600 bg-slate-800 hover:text-slate-400'
          }`}>
          {attested ? '✓' : '·'}
        </button>
        {showPaidControl ? (
          <button
            type="button"
            data-testid="entry-paid-toggle"
            aria-pressed={entry.paid}
            onClick={togglePaid}
            title={entry.paid ? 'Paid — un-pay to unlock line' : 'Mark paid (locks line)'}
            className={`flex-shrink-0 text-[10px] font-bold px-1.5 h-5 rounded border transition-colors ${
              entry.paid
                ? `${PAID_BADGE.bg} ${PAID_BADGE.text} ${PAID_BADGE.border}`
                : 'text-slate-500 bg-slate-800 border-slate-700 hover:text-teal-300 hover:border-teal-800'
            }`}>
            {entry.paid ? 'PAID' : 'Pay'}
          </button>
        ) : (
          <span className="flex-shrink-0 w-[34px]" aria-hidden />
        )}
        <span className={`flex-1 min-w-0 text-xs truncate ${attested ? 'text-white' : 'text-slate-400'}`}>
          {entry.description || '—'}
        </span>
        <span
          title={notesRef || undefined}
          className="flex-1 min-w-0 text-xs text-slate-500 truncate">
          {notesRef || '—'}
        </span>
        <span className={`flex-shrink-0 w-20 text-right text-xs font-medium tabular-nums ${attested ? 'text-white' : 'text-slate-400'}`}>
          {fmt(entry.amount)}
        </span>
        <span
          title={entry.gst_included ? 'GST included in amount' : 'GST excluded — ex-GST figure'}
          className={`flex-shrink-0 text-xs w-6 text-center ${entry.gst_included ? 'text-slate-600' : 'text-orange-500/80'}`}>
          {entry.gst_included ? 'inc' : 'ex'}
        </span>
        {locked ? (
          <span
            data-testid="entry-paid-lock"
            title="Locked — receipt recorded. Un-pay to edit."
            className="flex-shrink-0 w-4 text-teal-500/80 text-xs text-center"
            aria-label="Line locked (paid)">
            🔒
          </span>
        ) : (
          <button onClick={() => setEditing(true)}
            title="Edit entry"
            className="flex-shrink-0 w-4 text-slate-700 hover:text-amber-400 text-xs transition-colors sm:opacity-0 sm:group-hover:opacity-100">
            ✎
          </button>
        )}
        <button onClick={onRemove} disabled={!canRemove || locked}
          title={locked ? 'Paid — un-pay to remove' : canRemove ? 'Remove entry' : 'Cannot remove the last entry'}
          className="flex-shrink-0 w-4 text-slate-700 hover:text-red-400 text-xs transition-colors sm:opacity-0 sm:group-hover:opacity-100 disabled:opacity-20 disabled:hover:text-slate-700 disabled:cursor-not-allowed">
          ✕
        </button>
      </div>

      {/* Mobile: stacked — description clean; Notes / Source of Data labelled separately */}
      <div className="sm:hidden space-y-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="entry-confirm-tick-mobile"
            aria-pressed={attested}
            aria-disabled={locked}
            disabled={locked}
            onClick={toggleConfirmed}
            title={locked ? 'Paid — un-pay to change confirmation' : attested ? 'Mark as estimate' : 'Mark as confirmed'}
            className={`flex-shrink-0 text-xs font-bold w-5 h-5 flex items-center justify-center rounded transition-colors disabled:cursor-not-allowed ${
              attested ? 'text-green-400 bg-green-900/40' : 'text-slate-600 bg-slate-800 hover:text-slate-400'
            }`}>
            {attested ? '✓' : '·'}
          </button>
          <span className={`flex-1 min-w-0 text-xs truncate ${attested ? 'text-white' : 'text-slate-400'}`}>
            {entry.description || '—'}
          </span>
          <span className={`flex-shrink-0 text-xs font-medium tabular-nums ${attested ? 'text-white' : 'text-slate-400'}`}>
            {fmt(entry.amount)}
          </span>
          <span
            title={entry.gst_included ? 'GST included in amount' : 'GST excluded — ex-GST figure'}
            className={`flex-shrink-0 text-xs w-6 text-center ${entry.gst_included ? 'text-slate-600' : 'text-orange-500/80'}`}>
            {entry.gst_included ? 'inc' : 'ex'}
          </span>
          {locked ? (
            <span
              data-testid="entry-paid-lock-mobile"
              title="Locked — receipt recorded. Un-pay to edit."
              className="flex-shrink-0 text-teal-500/80 text-xs"
              aria-label="Line locked (paid)">
              🔒
            </span>
          ) : (
            <button onClick={() => setEditing(true)}
              title="Edit entry"
              className="flex-shrink-0 text-slate-700 hover:text-amber-400 text-xs transition-colors">
              ✎
            </button>
          )}
          <button onClick={onRemove} disabled={!canRemove || locked}
            title={locked ? 'Paid — un-pay to remove' : canRemove ? 'Remove entry' : 'Cannot remove the last entry'}
            className="flex-shrink-0 text-slate-700 hover:text-red-400 text-xs transition-colors disabled:opacity-20 disabled:hover:text-slate-700 disabled:cursor-not-allowed">
            ✕
          </button>
        </div>
        {showPaidControl && (
          <div className="pl-[26px]">
            <button
              type="button"
              data-testid="entry-paid-toggle-mobile"
              aria-pressed={entry.paid}
              onClick={togglePaid}
              title={entry.paid ? 'Paid — un-pay to unlock line' : 'Mark paid (locks line)'}
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                entry.paid
                  ? `${PAID_BADGE.bg} ${PAID_BADGE.text} ${PAID_BADGE.border}`
                  : 'text-slate-500 bg-slate-800 border-slate-700'
              }`}>
              {entry.paid ? 'PAID · locked' : 'Mark paid (locks line)'}
            </button>
          </div>
        )}
        {notesRef ? (
          <div className="pl-[26px]">
            <div className="text-[10px] uppercase tracking-wide text-slate-600">{NOTES_SOURCE_OF_DATA_LABEL}</div>
            <div className="text-xs text-slate-500 truncate" title={notesRef}>{notesRef}</div>
          </div>
        ) : null}
      </div>
      <QuoteInvoiceStub
        filename={entry.attachment_filename}
        quoteNote={entry.quote_note}
        busy={stubBusy}
        testIdPrefix={`cost-entry-${entry.id}`}
        onNoteCommit={note => onStubUpdate({ ...entry, quote_note: note })}
        onAttach={onAttachFile}
        onRemove={() => onStubUpdate({
          ...entry,
          attachment_path: null,
          attachment_filename: null,
          attachment_mime: null,
        })}
      />
    </div>
  )
}

function EntryPanel({
  fieldId,
  fieldKey,
  fieldLabel,
  entries,
  onEntriesUpdated,
  fieldSource,
  editorDisplayName,
  runId,
}: {
  fieldId: string
  fieldKey: string
  fieldLabel: string
  entries: Entry[]
  onEntriesUpdated: (updated: CostFieldRow) => void
  fieldSource?: string | null
  editorDisplayName?: string | null
  runId: string
}) {
  const { profile } = useProfile()
  const [desc, setDesc] = useState('')
  const [notes, setNotes] = useState('')
  const [amount, setAmount] = useState('')
  const [gst, setGst] = useState(!NO_GST_DEFAULTS.has(fieldKey))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = entries.reduce((sum, e) => sum + e.amount, 0)
  const confirmed = entries.filter(e => e.confirmed).reduce((sum, e) => sum + e.amount, 0)
  const gstContent = entries.filter(e => e.gst_included).reduce((sum, e) => sum + e.amount / 11, 0)

  async function persist(updated: Entry[]) {
    if (updated.length === 0) {
      setError('At least one entry is required')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const data = await patchCostField(fieldId, { entries: updated })
      const nextEntries = (data.entries as Entry[]) ?? updated
      const nextValue = data.value != null ? Number(data.value) : entriesSum(nextEntries)
      onEntriesUpdated({ ...data, entries: nextEntries, value: nextValue })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      setError(msg)
      console.error('Entry persist failed:', err)
    } finally {
      setSaving(false)
    }
  }

  function updateEntry(idx: number, updated: Entry) {
    const next = [...entries]
    next[idx] = updated
    persist(next)
  }

  async function attachEntryFile(idx: number, file: File) {
    setError(null)
    setSaving(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('run_id', runId)
      const res = await fetch('/api/quote-invoice-stubs', { method: 'POST', body: form })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Could not attach file')
      const next = [...entries]
      next[idx] = {
        ...next[idx],
        attachment_path: body.path,
        attachment_filename: body.filename,
        attachment_mime: body.mime,
      }
      await persist(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach file')
      setSaving(false)
    }
  }

  function removeEntry(idx: number) {
    if (entries[idx] && entryIsPaidLocked(entries[idx])) {
      setError('Paid line is locked — un-pay before removing')
      return
    }
    if (entries.length <= 1) {
      setError('Cannot remove the last entry — set amount to $0 instead')
      return
    }
    persist(entries.filter((_, i) => i !== idx))
  }

  async function addEntry() {
    if (!amount) return
    const trimmedNotes = notes.trim()
    const newEntry: Entry = {
      id: crypto.randomUUID(),
      description: desc || fieldLabel || 'Estimate',
      notes: trimmedNotes || enteredByLabel(profile?.full_name) || '',
      amount: parseFloat(amount),
      gst_included: gst,
      confirmed: false,
      paid: false,
      paid_at: null,
      attachment_path: null,
      attachment_filename: null,
      attachment_mime: null,
      quote_note: '',
      payables_document_id: null,
    }
    await persist([...entries, newEntry])
    setDesc('')
    setNotes('')
    setAmount('')
    setGst(!NO_GST_DEFAULTS.has(fieldKey))
  }

  return (
    <div className="border-t border-slate-700/40 bg-slate-900/20 rounded-b-lg px-3 pt-2 pb-3">
      {error && (
        <div className="mb-2 rounded border border-red-800 bg-red-950/50 px-2 py-1.5 text-xs text-red-300" role="alert">
          {error}
        </div>
      )}
      {entries.length > 0 && (
        <>
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-600 mb-0.5">
            <span className="w-5" />
            <span className="w-[34px]">Paid</span>
            <span className="flex-1">Description</span>
            <span className="flex-1">{NOTES_SOURCE_OF_DATA_LABEL}</span>
            <span className="w-20 text-right">Amount</span>
            <span className="w-6 text-center">GST</span>
            <span className="w-4" /><span className="w-4" />
          </div>
          <div className="mb-2">
            {entries.map((e, i) => (
              <EntryRow
                key={e.id}
                entry={e}
                onUpdate={updated => updateEntry(i, updated)}
                onRemove={() => removeEntry(i)}
                canRemove={entries.length > 1}
                fieldSource={fieldSource}
                fieldKey={fieldKey}
                editorDisplayName={editorDisplayName}
                onStubUpdate={updated => updateEntry(i, updated)}
                onAttachFile={file => { void attachEntryFile(i, file) }}
                stubBusy={saving}
              />
            ))}
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-slate-700/40 mb-2">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-500">Total: <span className="text-slate-300 font-medium">{fmt(total)}</span></span>
              {confirmed > 0 && confirmed < total && (
                <span className="text-green-600">Confirmed: <span className="text-green-400 font-medium">{fmt(confirmed)}</span></span>
              )}
              {allEntriesConfirmed(entries) && !allEntriesPaid(entries) && (
                <span className="text-green-400 font-medium">All confirmed ✓</span>
              )}
              {allEntriesPaid(entries) && (
                <span className="text-teal-300 font-medium">All paid — lines locked</span>
              )}
            </div>
            {gstContent > 0 && <span className="text-slate-600 text-xs">GST component: {fmt(gstContent)}</span>}
          </div>
        </>
      )}

      {/* Add new entry */}
      <div className="space-y-1.5">
        <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Description"
          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-400" />
        <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
          placeholder={NOTES_INPUT_LABEL}
          aria-label={NOTES_INPUT_LABEL}
          className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-400" />
        <div className="flex items-center gap-1.5">
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="$0"
            className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-400" />
          <label className="flex items-center gap-1 text-xs text-slate-400 whitespace-nowrap cursor-pointer select-none">
            <input type="checkbox" checked={gst} onChange={e => setGst(e.target.checked)} className="accent-amber-400" /> GST
          </label>
          <button onClick={addEntry} disabled={!amount || saving}
            className="ml-auto bg-amber-400/90 text-slate-900 text-xs font-semibold px-2.5 py-1 rounded hover:bg-amber-300 disabled:opacity-40 transition-colors whitespace-nowrap">
            {saving ? '…' : '+ Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Generic field row ───────────────────────────────────────────────────────

function FieldRow({
  runId,
  showId,
  fieldDef,
  existing,
  onSaved,
  onEntriesUpdated,
  editorDisplayName,
}: {
  runId: string
  showId: string | null
  fieldDef: { key: string; label: string; category: string; defaultState: FieldState }
  existing: CostFieldRow | undefined
  onSaved: (updated: CostFieldRow) => void
  onEntriesUpdated: (updated: CostFieldRow) => void
  editorDisplayName?: string | null
}) {
  const [isEditing, setIsEditing] = useState(false)
  const persistedState = (existing?.state as FieldState) ?? fieldDef.defaultState
  const entries = existing?.entries ?? []
  const persistedSelect = sectionEditSelectValue(entries, persistedState)
  const [draftSelect, setDraftSelect] = useState<SectionEditValue>(persistedSelect)
  const [saving, setSaving] = useState(false)
  const [entriesOpen, setEntriesOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const state = figureStateFromSelect(isEditing ? draftSelect : persistedSelect, persistedState)
  const { styles, chipLabel, chromeAttr, allPaid: sectionPaid } = sectionChrome(state, entries)
  const displayTotal = entries.length > 0 ? entriesSum(entries) : (existing?.value ?? null)
  const canBulkPaid = Boolean(existing?.id) && entries.length > 0 && !ENTRY_EXEMPT_FIELD_KEYS.has(fieldDef.key)

  async function handleSaveState() {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      if (existing?.id) {
        if (draftSelect === SECTION_BULK_PAID_VALUE) {
          const data = await patchCostField(existing.id, { section_payment: 'paid' })
          onSaved(data)
        } else {
          const body: Record<string, unknown> = { state: draftSelect }
          if (hasBulkPaidSnapshot(entries)) body.section_payment = 'restore'
          const data = await patchCostField(existing.id, body)
          onSaved(data)
        }
      } else {
        if (draftSelect === SECTION_BULK_PAID_VALUE) {
          throw new Error('Add a cost line before MARK ALL AS PAID')
        }
        const data = await createCostField({
          run_id: runId,
          show_id: showId,
          category: fieldDef.category,
          field_key: fieldDef.key,
          label: fieldDef.label,
          value: 0,
          state: draftSelect,
          entries: [{
            id: crypto.randomUUID(),
            description: fieldDef.label || 'Estimate',
            notes: '',
            amount: 0,
            gst_included: !NO_GST_DEFAULTS.has(fieldDef.key),
            confirmed: false,
            paid: false,
            paid_at: null,
          }],
        })
        onSaved(data)
        setEntriesOpen(true)
      }
      setIsEditing(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      setError(msg)
      console.error('Cost field update failed:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-testid={`cost-field-${fieldDef.key}`} data-chrome={chromeAttr} className={`rounded-lg border ${styles.bg} ${styles.border}`}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="text-slate-300 text-sm">{fieldDef.label}</div>
          {entries.length > 0 && (
            <div className="text-slate-500 text-xs mt-0.5">
              {entries.length} {entries.length !== 1 ? 'entries' : 'entry'} · total from sub-items
            </div>
          )}
          {error && (
            <div className="text-red-400 text-xs mt-0.5" role="alert">{error}</div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isEditing ? (
            <>
              <SectionEditSelect
                value={draftSelect}
                onChange={setDraftSelect}
                canBulkPaid={canBulkPaid}
              />
              <span className={`text-sm font-medium ${styles.text}`}>{fmt(displayTotal)}</span>
              <button
                data-testid="cost-field-edit-save"
                onClick={handleSaveState}
                disabled={saving}
                className="bg-amber-400 text-slate-900 text-xs font-semibold px-2.5 py-1 rounded hover:bg-amber-300 disabled:opacity-50 transition-colors"
              >
                {saving ? '…' : 'Save'}
              </button>
              <button
                onClick={() => { setIsEditing(false); setDraftSelect(persistedSelect); setError(null) }}
                className="text-slate-500 hover:text-slate-300 text-xs px-1 transition-colors"
              >
                ✕
              </button>
            </>
          ) : (
            <>
              <span className={`text-sm font-medium ${styles.text}`}>
                {displayTotal != null ? fmt(displayTotal) : '—'}
              </span>
              <span
                data-testid="cost-field-state"
                title={sectionPaid
                  ? 'All lines PAID — shown as CONFIRMED. Figure-source accuracy is unchanged.'
                  : undefined}
                className={`text-xs px-1.5 py-0.5 rounded ${styles.text} opacity-70 whitespace-nowrap`}
              >{chipLabel}</span>
              {sectionPaid && (
                <span
                  data-testid="cost-field-paid"
                  title="Payment/receipt status — lines locked. Distinct from CONFIRMED (operator attestation)."
                  className={`text-xs px-1.5 py-0.5 rounded border ${PAID_BADGE.bg} ${PAID_BADGE.text} ${PAID_BADGE.border} whitespace-nowrap`}
                >
                  {PAID_BADGE.label}
                </span>
              )}
              <button onClick={() => { setDraftSelect(persistedSelect); setIsEditing(true) }} data-testid="cost-field-edit" className="text-slate-600 hover:text-amber-400 text-xs transition-colors">Edit</button>
            </>
          )}
          {/* Receipts toggle — show for all fields that have an ID */}
          {existing?.id && fieldDef.key !== 'gross_box_office' && fieldDef.key !== 'social_ads_var' && (
            <button
              onClick={() => setEntriesOpen(o => !o)}
              className={`text-xs transition-colors ${entriesOpen ? 'text-amber-400' : 'text-slate-600 hover:text-slate-300'}`}
              title="Show receipts / actuals"
            >
              {entriesOpen ? '▲' : '▼'}{entries.length > 0 ? ` ${entries.length}` : ''}
            </button>
          )}
        </div>
      </div>

      {/* Entry panel */}
      {entriesOpen && existing?.id && (
        <EntryPanel
          fieldId={existing.id}
          fieldKey={fieldDef.key}
          fieldLabel={fieldDef.label}
          entries={entries}
          fieldSource={existing.source}
          editorDisplayName={editorDisplayName}
          onEntriesUpdated={onEntriesUpdated}
          runId={runId}
        />
      )}
    </div>
  )
}

const STAFF_GRID = 'sm:grid-cols-[20px_40px_minmax(0,1.1fr)_minmax(0,1.2fr)_64px_44px_56px_56px_18px_18px]'

// ─── Venue staff line-items row ──────────────────────────────────────────────

function VenueStaffRow({
  runId,
  showId,
  existing,
  onSaved,
  onEntriesUpdated,
  editorDisplayName,
}: {
  runId: string
  showId: string
  existing: CostFieldRow | undefined
  onSaved: (updated: CostFieldRow) => void
  onEntriesUpdated: (updated: CostFieldRow) => void
  editorDisplayName?: string | null
}) {
  const { profile } = useProfile()
  const [open, setOpen] = useState(false)
  const [entriesOpen, setEntriesOpen] = useState(false)
  const [items, setItems] = useState<LineItem[]>(() => normalizeLineItems(existing?.line_items) ?? [])
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const persistedState = (existing?.state as FieldState) ?? 'guess'
  const entries = existing?.entries ?? []
  const payableLines = sectionPayableLines('venue_staff', entries, items)
  const persistedSelect = sectionEditSelectValue(payableLines, persistedState)
  const [draftSelect, setDraftSelect] = useState<SectionEditValue>(persistedSelect)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const state = figureStateFromSelect(draftSelect, persistedState)
  const { styles, chipLabel, chromeAttr, allPaid: sectionPaid } = sectionChrome(state, payableLines)
  const total = lineItemsSum(items)
  const enteredTotal = entries.reduce((s, e) => s + e.amount, 0)
  const canBulkPaid = Boolean(existing?.id) && items.length > 0

  function updateItem(idx: number, field: keyof LineItem, raw: string) {
    setItems(prev => {
      const current = prev[idx]
      if (!current || entryIsPaidLocked(current)) return prev
      const next = [...prev]
      next[idx] = { ...current, [field]: (field === 'role' || field === 'source') ? raw : (parseFloat(raw) || 0) }
      return next
    })
  }

  function addItem() {
    setItems(prev => {
      const next = [...prev, {
        id: crypto.randomUUID(),
        role: '',
        rate: 0,
        hours: 1,
        headcount: 1,
        source: enteredByLabel(profile?.full_name) ?? '',
        confirmed: false,
        paid: false,
        paid_at: null,
      }]
      setEditingIdx(next.length - 1)
      return next
    })
  }

  function removeItem(idx: number) {
    const current = items[idx]
    if (current && entryIsPaidLocked(current)) {
      setError('Paid role is locked — un-pay before removing')
      return
    }
    setItems(prev => prev.filter((_, i) => i !== idx))
    setEditingIdx(prev => (prev == null ? null : prev === idx ? null : prev > idx ? prev - 1 : prev))
  }

  async function persistRoles(next: LineItem[], extra: Record<string, unknown> = {}) {
    if (!existing?.id) {
      setItems(next)
      return null
    }
    setItems(next)
    setError(null)
    setSaving(true)
    try {
      const data = await patchCostField(existing.id, {
        line_items: next,
        ...extra,
      })
      const saved = normalizeLineItems(data.line_items) ?? next
      setItems(saved)
      onSaved(data)
      setDraftSelect(sectionEditSelectValue(
        sectionPayableLines('venue_staff', data.entries as Entry[] | null, saved),
        (data.state as FieldState) ?? persistedState,
      ))
      return data
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      setError(msg)
      console.error('Venue staff role persist failed:', err)
      return null
    } finally {
      setSaving(false)
    }
  }

  function toggleRoleConfirmed(idx: number) {
    const current = items[idx]
    if (!current || entryIsPaidLocked(current)) return
    const next = [...items]
    next[idx] = { ...current, confirmed: !current.confirmed }
    void persistRoles(next)
  }

  function toggleRolePaid(idx: number) {
    const current = items[idx]
    if (!current) return
    if (current.paid) {
      const next = [...items]
      next[idx] = { ...current, paid: false, paid_at: null }
      void persistRoles(next)
      return
    }
    if (!canMarkEntryPaid(current)) return
    const next = [...items]
    next[idx] = { ...current, paid: true, paid_at: new Date().toISOString() }
    void persistRoles(next)
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError(null)
    const numVal = total === 0 ? null : total
    try {
      if (existing?.id) {
        if (draftSelect === SECTION_BULK_PAID_VALUE) {
          const data = await patchCostField(existing.id, {
            section_payment: 'paid',
            line_items: items,
          })
          const saved = normalizeLineItems(data.line_items) ?? items
          setItems(saved)
          onSaved(data)
          setDraftSelect(sectionEditSelectValue(
            sectionPayableLines('venue_staff', data.entries as Entry[] | null, saved),
            (data.state as FieldState) ?? persistedState,
          ))
        } else {
          const body: Record<string, unknown> = {
            value: numVal,
            state: draftSelect,
            line_items: items,
          }
          if (hasBulkPaidSnapshot(payableLines)) body.section_payment = 'restore'
          const data = await patchCostField(existing.id, body)
          const saved = normalizeLineItems(data.line_items) ?? items
          setItems(saved)
          onSaved(data)
          setDraftSelect(sectionEditSelectValue(
            sectionPayableLines('venue_staff', data.entries as Entry[] | null, saved),
            (data.state as FieldState) ?? draftSelect,
          ))
        }
      } else {
        if (draftSelect === SECTION_BULK_PAID_VALUE) {
          throw new Error('Add a cost line before MARK ALL AS PAID')
        }
        const data = await createCostField({
          run_id: runId,
          show_id: showId,
          category: 'Venue Costs',
          field_key: 'venue_staff',
          label: 'Venue Staff / On-costs',
          value: numVal,
          state: draftSelect,
          line_items: items,
          entries: [{
            id: crypto.randomUUID(),
            description: 'Venue Staff / On-costs',
            notes: 'Estimate from planned roles',
            amount: numVal ?? 0,
            gst_included: true,
            confirmed: false,
            paid: false,
            paid_at: null,
          }],
        })
        const saved = normalizeLineItems(data.line_items) ?? items
        setItems(saved)
        onSaved(data)
        setDraftSelect(sectionEditSelectValue(
          sectionPayableLines('venue_staff', data.entries as Entry[] | null, saved),
          (data.state as FieldState) ?? draftSelect,
        ))
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      setError(msg)
      console.error('Venue staff save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-testid="cost-field-venue_staff" data-chrome={chromeAttr} className={`rounded-lg border ${styles.bg} ${styles.border}`}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="text-slate-300 text-sm">Venue Staff / On-costs</div>
          {enteredTotal > 0 && (
            <div className="text-slate-500 text-xs mt-0.5">{fmt(enteredTotal)} in actuals / entries</div>
          )}
          {error && (
            <div className="text-red-400 text-xs mt-0.5" role="alert">{error}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${styles.text}`}>{total > 0 ? fmt(total) : '—'}</span>
          <span
            data-testid="cost-field-state"
            title={sectionPaid
              ? (items.length > 0
                ? 'All planned roles PAID — shown as CONFIRMED. Figure-source accuracy is unchanged.'
                : 'All lines PAID — shown as CONFIRMED. Figure-source accuracy is unchanged.')
              : undefined}
            className={`text-xs px-1.5 py-0.5 rounded ${styles.text} opacity-70 whitespace-nowrap`}
          >{chipLabel}</span>
          {sectionPaid && (
            <span
              data-testid="cost-field-paid"
              title="Payment/receipt status — lines locked. Distinct from CONFIRMED (operator attestation)."
              className={`text-xs px-1.5 py-0.5 rounded border ${PAID_BADGE.bg} ${PAID_BADGE.text} ${PAID_BADGE.border} whitespace-nowrap`}
            >
              {PAID_BADGE.label}
            </span>
          )}
          {!open && (
            <button onClick={() => setOpen(true)} className="text-slate-600 hover:text-amber-400 text-xs transition-colors">Edit</button>
          )}
          <button
            onClick={() => setOpen(o => !o)}
            className={`text-xs transition-colors ${open ? 'text-amber-400' : 'text-slate-600 hover:text-slate-300'}`}
            title="Show / edit planned roles"
          >
            {open ? '▲' : '▼'}{items.length > 0 ? ` ${items.length}` : ''}
          </button>
        </div>
      </div>

      {/* Expanded: item list + edit controls */}
      {open && (
        <div className="border-t border-slate-700/60 px-3 pt-2.5 pb-3">
          {items.length > 0 ? (
            <div className="mb-3">
              {/* Desktop header — Role | Notes / Source of Data | rates (EntryRow-style notes column) */}
              <div className={`hidden sm:grid ${STAFF_GRID} gap-1.5 mb-1.5 text-xs text-slate-500 px-0.5`}>
                <span />
                <span>Paid</span>
                <span>Role / Description</span>
                <span>{NOTES_SOURCE_OF_DATA_LABEL}</span>
                <span>Rate $/hr</span>
                <span>Hrs</span>
                <span>Headcount</span>
                <span className="text-right pr-1">Total</span>
                <span />
                <span />
              </div>
              <div className="space-y-3">
                {items.map((item, idx) => {
                  const rowTotal = (item.rate || 0) * (item.hours || 0) * (item.headcount || 0)
                  const locked = entryIsPaidLocked(item)
                  const attested = entryIsAttested(item)
                  const showPaidControl = canMarkEntryPaid(item) || Boolean(item.paid)
                  const isEditing = editingIdx === idx && !locked
                  const sourceLabel = formatNotesSource({
                    notes: item.source,
                    fieldKey: 'venue_staff',
                    editorDisplayName,
                    allowFieldSourceFallback: false,
                  })
                  const tickBtn = (
                    <button
                      type="button"
                      data-testid="role-confirm-tick"
                      aria-pressed={attested}
                      aria-disabled={locked}
                      disabled={locked}
                      onClick={() => toggleRoleConfirmed(idx)}
                      title={locked ? 'Paid — un-pay to change confirmation' : attested ? 'Mark as estimate' : 'Mark as confirmed'}
                      className={`flex-shrink-0 text-xs font-bold w-5 h-5 flex items-center justify-center rounded transition-colors disabled:cursor-not-allowed ${
                        attested ? 'text-green-400 bg-green-900/40' : 'text-slate-600 bg-slate-800 hover:text-slate-400'
                      }`}
                    >
                      {attested ? '✓' : '·'}
                    </button>
                  )
                  const payBtn = showPaidControl ? (
                    <button
                      type="button"
                      data-testid="role-paid-toggle"
                      aria-pressed={Boolean(item.paid)}
                      onClick={() => toggleRolePaid(idx)}
                      title={item.paid ? 'Paid — un-pay to unlock role' : 'Mark paid (locks role)'}
                      className={`flex-shrink-0 text-[10px] font-bold px-1.5 h-5 rounded border transition-colors ${
                        item.paid
                          ? `${PAID_BADGE.bg} ${PAID_BADGE.text} ${PAID_BADGE.border}`
                          : 'text-slate-500 bg-slate-800 border-slate-700 hover:text-teal-300 hover:border-teal-800'
                      }`}
                    >
                      {item.paid ? 'PAID' : 'Pay'}
                    </button>
                  ) : (
                    <span className="flex-shrink-0 w-[34px]" aria-hidden />
                  )
                  return (
                    <div
                      key={item.id || idx}
                      data-testid="role-row"
                      data-paid={item.paid ? 'true' : 'false'}
                      data-locked={locked ? 'true' : 'false'}
                      className={`bg-slate-900/40 sm:bg-transparent rounded-lg sm:rounded-none p-2 sm:p-0 border border-slate-700/40 sm:border-0 group/role ${locked ? 'opacity-90' : ''}`}
                    >
                      {isEditing ? (
                        <>
                          {/* Mobile edit card */}
                          <div className="flex items-start gap-2 sm:hidden mb-2">
                            {tickBtn}
                            <input type="text" value={item.role} onChange={e => updateItem(idx, 'role', e.target.value)} placeholder="Role title (e.g. Usher)" autoFocus
                              className="flex-1 bg-slate-900 border border-amber-400/50 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-amber-400 min-w-0" />
                            <button onClick={() => removeItem(idx)} className="text-slate-600 hover:text-red-400 text-sm transition-colors pt-1.5 shrink-0">✕</button>
                          </div>
                          <div className="sm:hidden mb-2 pl-[26px]">{payBtn}</div>
                          <div className="sm:hidden mb-2">
                            <div className="text-slate-500 text-xs mb-0.5">{NOTES_INPUT_LABEL}</div>
                            <input type="text" value={item.source || ''} onChange={e => updateItem(idx, 'source', e.target.value)}
                              placeholder={NOTES_INPUT_LABEL}
                              aria-label={NOTES_INPUT_LABEL}
                              className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-amber-400 w-full" />
                          </div>
                          <div className="grid grid-cols-3 gap-2 sm:hidden">
                            <div>
                              <div className="text-slate-500 text-xs mb-0.5">Rate $/hr</div>
                              <input type="number" value={item.rate || ''} onChange={e => updateItem(idx, 'rate', e.target.value)} placeholder="0"
                                className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-amber-400 w-full" />
                            </div>
                            <div>
                              <div className="text-slate-500 text-xs mb-0.5">Hours</div>
                              <input type="number" value={item.hours || ''} onChange={e => updateItem(idx, 'hours', e.target.value)} placeholder="1"
                                className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-amber-400 w-full" />
                            </div>
                            <div>
                              <div className="text-slate-500 text-xs mb-0.5">Headcount</div>
                              <input type="number" value={item.headcount || ''} onChange={e => updateItem(idx, 'headcount', e.target.value)} placeholder="1"
                                className="bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-amber-400 w-full" />
                            </div>
                          </div>
                          {rowTotal > 0 && <div className="text-amber-400/80 text-xs font-medium mt-1.5 sm:hidden">{fmt(rowTotal)}</div>}

                          {/* Desktop edit grid */}
                          <div className={`hidden sm:grid ${STAFF_GRID} gap-1.5 items-center`}>
                            {tickBtn}
                            {payBtn}
                            <input type="text" value={item.role} onChange={e => updateItem(idx, 'role', e.target.value)} placeholder="e.g. Usher" autoFocus
                              className="bg-slate-900 border border-amber-400/50 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-400 min-w-0" />
                            <input type="text" value={item.source || ''} onChange={e => updateItem(idx, 'source', e.target.value)}
                              placeholder={NOTES_INPUT_LABEL}
                              aria-label={NOTES_INPUT_LABEL}
                              className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-slate-300 text-xs focus:outline-none focus:border-amber-400 min-w-0" />
                            <input type="number" value={item.rate || ''} onChange={e => updateItem(idx, 'rate', e.target.value)} placeholder="0"
                              className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-400 w-full" />
                            <input type="number" value={item.hours || ''} onChange={e => updateItem(idx, 'hours', e.target.value)} placeholder="1"
                              className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-400 w-full" />
                            <input type="number" value={item.headcount || ''} onChange={e => updateItem(idx, 'headcount', e.target.value)} placeholder="1"
                              className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-400 w-full" />
                            <div className="text-right text-slate-300 text-xs font-medium pr-1">{rowTotal > 0 ? fmt(rowTotal) : '—'}</div>
                            <button onClick={() => setEditingIdx(null)} title="Done editing title/fields" className="text-amber-400 hover:text-amber-300 text-xs transition-colors text-center">✓</button>
                            <button onClick={() => removeItem(idx)} className="text-slate-600 hover:text-red-400 text-xs transition-colors text-center">✕</button>
                          </div>
                          <div className="sm:hidden mt-1.5 flex justify-end">
                            <button onClick={() => setEditingIdx(null)} className="text-amber-400 hover:text-amber-300 text-xs">Done</button>
                          </div>
                        </>
                      ) : (
                        <>
                          {/* Read-only — pencil required to edit title */}
                          <div className="flex items-start gap-2 sm:hidden mb-1">
                            {tickBtn}
                            <div className="flex-1 min-w-0">
                              <div className={`text-sm truncate ${attested ? 'text-white' : 'text-slate-400'}`}>{item.role || 'Untitled role'}</div>
                            </div>
                            {locked ? (
                              <span data-testid="role-paid-lock-mobile" title="Locked — receipt recorded. Un-pay to edit." className="text-teal-500/80 text-sm" aria-label="Role locked (paid)">🔒</span>
                            ) : (
                              <button onClick={() => setEditingIdx(idx)} title="Edit role" className="text-slate-600 hover:text-amber-400 text-sm transition-colors pt-0.5 shrink-0">✎</button>
                            )}
                            <button onClick={() => removeItem(idx)} disabled={locked} className="text-slate-600 hover:text-red-400 text-sm transition-colors pt-0.5 shrink-0 disabled:opacity-20 disabled:cursor-not-allowed">✕</button>
                          </div>
                          {showPaidControl && (
                            <div className="sm:hidden mb-1.5 pl-[26px]">
                              <button
                                type="button"
                                data-testid="role-paid-toggle-mobile"
                                aria-pressed={Boolean(item.paid)}
                                onClick={() => toggleRolePaid(idx)}
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                                  item.paid
                                    ? `${PAID_BADGE.bg} ${PAID_BADGE.text} ${PAID_BADGE.border}`
                                    : 'text-slate-500 bg-slate-800 border-slate-700'
                                }`}
                              >
                                {item.paid ? 'PAID · locked' : 'Mark paid (locks role)'}
                              </button>
                            </div>
                          )}
                          {sourceLabel ? (
                            <div className="sm:hidden mb-1.5">
                              <div className="text-[10px] uppercase tracking-wide text-slate-600">{NOTES_SOURCE_OF_DATA_LABEL}</div>
                              <div className="text-xs text-slate-500 truncate" title={sourceLabel}>{sourceLabel}</div>
                            </div>
                          ) : null}
                          <div className="grid grid-cols-3 gap-2 sm:hidden text-xs text-slate-400">
                            <div><span className="text-slate-600">Rate </span>${item.rate || 0}/hr</div>
                            <div><span className="text-slate-600">Hrs </span>{item.hours || 0}</div>
                            <div><span className="text-slate-600">HC </span>{item.headcount || 0}</div>
                          </div>
                          {rowTotal > 0 && <div className="text-amber-400/80 text-xs font-medium mt-1 sm:hidden">{fmt(rowTotal)}</div>}

                          <div className={`hidden sm:grid ${STAFF_GRID} gap-1.5 items-center`}>
                            {tickBtn}
                            {payBtn}
                            <div className={`text-xs truncate ${attested ? 'text-white' : 'text-slate-400'}`}>{item.role || 'Untitled role'}</div>
                            <div className="text-xs text-slate-500 truncate" title={sourceLabel || undefined}>{sourceLabel || '—'}</div>
                            <div className="text-xs text-slate-400 tabular-nums">{item.rate || 0}</div>
                            <div className="text-xs text-slate-400 tabular-nums">{item.hours || 0}</div>
                            <div className="text-xs text-slate-400 tabular-nums">{item.headcount || 0}</div>
                            <div className="text-right text-slate-300 text-xs font-medium pr-1">{rowTotal > 0 ? fmt(rowTotal) : '—'}</div>
                            {locked ? (
                              <span data-testid="role-paid-lock" title="Locked — receipt recorded. Un-pay to edit." className="text-teal-500/80 text-xs text-center" aria-label="Role locked (paid)">🔒</span>
                            ) : (
                              <button onClick={() => setEditingIdx(idx)} title="Edit role" className="text-slate-600 hover:text-amber-400 text-xs transition-colors text-center opacity-0 group-hover/role:opacity-100">✎</button>
                            )}
                            <button onClick={() => removeItem(idx)} disabled={locked} title={locked ? 'Paid — un-pay to remove' : 'Remove role'} className="text-slate-600 hover:text-red-400 text-xs transition-colors text-center opacity-0 group-hover/role:opacity-100 disabled:opacity-20 disabled:cursor-not-allowed">✕</button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-slate-600 text-xs mb-3">No planned roles yet — add one below.</p>
          )}

          <div className="flex items-center justify-between gap-3">
            <button onClick={addItem} className="text-amber-400 hover:text-amber-300 text-xs transition-colors shrink-0">+ Add role</button>
            <div className="flex items-center gap-3">
              <SectionEditSelect
                value={draftSelect}
                onChange={setDraftSelect}
                canBulkPaid={canBulkPaid}
              />
              {total > 0 && <span className="text-slate-400 text-xs whitespace-nowrap">Total: <span className="text-white font-medium">{fmt(total)}</span></span>}
              <button onClick={handleSave} disabled={saving}
                className="bg-amber-400 text-slate-900 text-xs font-semibold px-3 py-1.5 rounded hover:bg-amber-300 disabled:opacity-50 transition-colors shrink-0">
                {saving ? '…' : 'Save'}
              </button>
            </div>
          </div>

          {/* Actuals / receipts toggle inline */}
          {existing?.id && (
            <div className="mt-3 border-t border-slate-700/40 pt-2.5">
              <button
                onClick={() => setEntriesOpen(o => !o)}
                className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
              >
                {entriesOpen ? '▲ Hide actuals' : `▼ Actuals / entries${entries.length > 0 ? ` (${entries.length})` : ''}`}
              </button>
              {entriesOpen && (
                <div className="mt-2">
                  <EntryPanel
                    fieldId={existing.id}
                    fieldKey="venue_staff"
                    fieldLabel="Venue Staff / On-costs"
                    entries={entries}
                    fieldSource={existing.source}
                    editorDisplayName={editorDisplayName}
                    onEntriesUpdated={onEntriesUpdated}
                    runId={runId}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Inline show details editor ─────────────────────────────────────────────

function ShowDetailsEditor({
  show,
  isOwner,
  onUpdated,
}: {
  show: Show
  isOwner: boolean
  onUpdated: (updated: Show) => void
}) {
  const [editing, setEditing] = useState(false)
  const [venueName, setVenueName] = useState(show.venue_name)
  const [venueCity, setVenueCity] = useState(show.venue_city)
  const [state, setState_] = useState(show.state_territory ?? '')
  const [showDate, setShowDate] = useState(show.show_date ?? '')
  const [capacity, setCapacity] = useState(show.capacity?.toString() ?? '')
  const [ticketPrice, setTicketPrice] = useState(show.ticket_price?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    const res = await fetch(`/api/shows/${show.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venue_name: venueName,
        venue_city: venueCity,
        state_territory: state || null,
        show_date: showDate || null,
        capacity: capacity ? parseInt(capacity) : null,
        ticket_price: ticketPrice ? parseFloat(ticketPrice) : null,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error ?? 'Save failed'); return }
    onUpdated(data as Show)
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="flex items-start gap-2 group">
        <div>
          <div className="text-white font-semibold text-sm">{show.venue_name}</div>
          <div className="text-slate-500 text-xs mt-0.5">
            {show.venue_city}{show.state_territory ? `, ${show.state_territory}` : ''} · {formatDateShortAU(show.show_date)}
            {show.capacity ? ` · Cap ${show.capacity.toLocaleString()}` : ''}
            {show.ticket_price ? ` · $${show.ticket_price}/ticket` : ''}
          </div>
        </div>
        {isOwner && (
          <button
            onClick={() => setEditing(true)}
            className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-amber-400 text-xs transition-all ml-1 mt-0.5"
            title="Edit show details"
          >
            ✎
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="bg-slate-900/60 border border-amber-400/30 rounded-lg px-3 py-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-slate-500 text-xs block mb-0.5">Venue name</label>
          <input value={venueName} onChange={e => setVenueName(e.target.value)} autoFocus
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-400" />
        </div>
        <div>
          <label className="text-slate-500 text-xs block mb-0.5">City</label>
          <input value={venueCity} onChange={e => setVenueCity(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-400" />
        </div>
        <div>
          <label className="text-slate-500 text-xs block mb-0.5">State</label>
          <input value={state} onChange={e => setState_(e.target.value)} placeholder="VIC"
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-400" />
        </div>
        <div>
          <label className="text-slate-500 text-xs block mb-0.5">Show date</label>
          <input type="date" value={showDate?.slice(0, 10) ?? ''} onChange={e => setShowDate(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-400" />
        </div>
        <div>
          <label className="text-slate-500 text-xs block mb-0.5">Capacity</label>
          <input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="0"
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-400" />
        </div>
        <div>
          <label className="text-slate-500 text-xs block mb-0.5">Ticket price ($)</label>
          <input type="number" value={ticketPrice} onChange={e => setTicketPrice(e.target.value)} placeholder="0.00" step="0.01"
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-400" />
        </div>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="flex items-center gap-2 pt-1">
        <button onClick={save} disabled={saving}
          className="bg-amber-400 text-slate-900 text-xs font-semibold px-3 py-1 rounded hover:bg-amber-300 disabled:opacity-50 transition-colors">
          {saving ? '…' : 'Save'}
        </button>
        <button onClick={() => { setEditing(false); setError(null) }}
          className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}

// ─── Groups run-level fields by category ────────────────────────────────────
const RUN_CATEGORIES = [...new Set(RUN_FIELDS.map(f => f.category))]

/** Physical max / top band for sell-slider modelling. */
function modelCapacity(show: Show): number | null {
  const bands = normalizeCapacityBands(show.capacity_bands)
  return topBandSeats(bands, show.capacity)
}

/** Calc-only venue staff $ — never writes back to cost_fields. */
function calcVenueStaff(show: Show, pct: number, row: CostFieldRow | undefined): number | null {
  const base = effectiveFieldValue(row)
  const bands = normalizeCapacityBands(show.capacity_bands)
  if (!bands.length) return base
  const cap = modelCapacity(show)
  const tickets = cap ? Math.round(cap * (pct / 100)) : 0
  const lineItems = Array.isArray(row?.line_items) ? row!.line_items : null
  return modelledVenueStaffForTickets({
    bands,
    tickets,
    baseTotal: base,
    lineItems,
  })
}


export default function CostFieldsTab({
  runId,
  runCode,
  runName,
  region,
  startDate,
  endDate,
  synopsis,
  shows,
  initialFields,
  auditRows,
  isOwnerOrAdmin = false,
  ticketOutlookSummary = null,
  editorDisplayNameByFieldId = {},
  insideFactors = {},
  remittanceLines = [],
}: {
  runId: string
  runCode: string
  runName: string
  region: string
  startDate: string | null
  endDate: string | null
  synopsis: string | null
  shows: Show[]
  initialFields: CostFieldRow[]
  auditRows: AuditEntry[]
  isOwnerOrAdmin?: boolean
  ticketOutlookSummary?: string | null
  editorDisplayNameByFieldId?: Record<string, string>
  insideFactors?: InsideFactorValues
  remittanceLines?: KnownInsideLine[]
}) {
  const { effectiveRole, profile } = useProfile()
  const hasTabAccess = canAccessTab(effectiveRole, 'costs')
  const hasAdvancement = canAccessTab(effectiveRole, 'advancement')
  const hasShowPack = canAccessTab(effectiveRole, 'show_pack')
  const hasOutlook = canAccessTab(effectiveRole, 'outlook')
  const defaultTab = hasTabAccess ? 'costs' : hasOutlook ? 'outlook' : hasAdvancement ? 'advancement' : hasShowPack ? 'show_pack' : 'costs'
  const [activeTab, setActiveTab] = useState<'costs' | 'outlook' | 'audit' | 'advancement' | 'show_pack'>(
    defaultTab === 'overview' ? 'costs' : defaultTab as 'costs' | 'outlook' | 'audit' | 'advancement' | 'show_pack',
  )
  const showOwnerPnl = canSeeOwnerPnl(effectiveRole)
  const isProduction = effectiveRole === 'production'
  // Which per-show fields production can see (no revenue, no venue hire)
  const visibleShowFields = isProduction
    ? SHOW_FIELDS.filter(f => productionCanEditFieldKey(f.key))
    : SHOW_FIELDS.filter(f => f.category !== 'Revenue')
  // Which run-level categories production can see (only Production = lighting_hire)
  const visibleRunCategories = isProduction
    ? ['Production']
    : RUN_CATEGORIES
  const [showsState, setShowsState] = useState<Show[]>(shows)
  const derivedRunDates = runDateRangeFromShows(showsState)
  const effectiveStartDate = derivedRunDates.start ?? startDate
  const effectiveEndDate = derivedRunDates.end ?? endDate
  const [fields, setFields] = useState<CostFieldRow[]>(initialFields)
  const [sellThrough, setSellThrough] = useState<Record<string, number>>(() =>
    Object.fromEntries(showsState.map(s => [s.id, s.sell_through_pct ?? 75]))
  )
  const ensureOnceRef = useRef(false)

  // On open: create missing defined rows + seed ≥1 entry via /api/cost-fields
  // (production can write; covers backline_hire when seed skipped the row).
  useEffect(() => {
    if (ensureOnceRef.current) return
    if (!hasTabAccess) return
    if (!canEditCostFields(effectiveRole)) return
    ensureOnceRef.current = true

    let cancelled = false

    async function ensureDefinedFields() {
      const role = effectiveRole ?? undefined
      const missing = findMissingDefinedCostFields(
        fields.map(f => ({ show_id: f.show_id, field_key: f.field_key })),
        showsState.map(s => s.id),
        { role, onlyVisibleToRole: true },
      )

      const created: CostFieldRow[] = []
      for (const spec of missing) {
        try {
          const body = buildCreateCostFieldBody(runId, spec)
          const data = await createCostField(body)
          created.push(data)
        } catch (err) {
          // Race / already exists — ignore; page SSR or refresh will reconcile.
          console.warn('ensure cost field create skipped:', spec.fieldDef.key, err)
        }
      }

      // Existing rows with empty entries → PATCH seed (non-exempt).
      const emptyRows = fields.filter(f => {
        if (!roleCanSeeCostField(role, f.field_key)) return false
        if (ENTRY_EXEMPT_FIELD_KEYS.has(f.field_key)) return false
        return f.entries === null || (Array.isArray(f.entries) && f.entries.length === 0)
      })

      const patched: CostFieldRow[] = []
      for (const row of emptyRows) {
        try {
          const entries = ensureMinimumEntry(row.entries, row.label, row.value)
          const data = await patchCostField(row.id, { entries })
          patched.push(data)
        } catch (err) {
          console.warn('ensure cost field entries skipped:', row.field_key, err)
        }
      }

      if (cancelled) return
      if (created.length === 0 && patched.length === 0) return

      setFields(prev => {
        const byId = new Map(prev.map(f => [f.id, f]))
        for (const row of [...created, ...patched]) byId.set(row.id, row)
        // Drop duplicates for same field_key + show_id (prefer newest created)
        const seen = new Set<string>()
        const out: CostFieldRow[] = []
        for (const row of [...byId.values()].reverse()) {
          const k = `${row.show_id ?? 'run'}:${row.field_key}`
          if (seen.has(k)) continue
          seen.add(k)
          out.push(row)
        }
        return out.reverse()
      })
    }

    void ensureDefinedFields()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on open for this run
  }, [runId, hasTabAccess, effectiveRole])

  function handleShowUpdated(updated: Show) {
    setShowsState(prev => prev.map(s => s.id === updated.id ? updated : s))
  }

  function handleSaved(updated: CostFieldRow) {
    setFields(prev => {
      const idx = prev.findIndex(f => f.id === updated.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next }
      return [...prev, updated]
    })
  }

  function handleEntriesUpdated(updated: CostFieldRow) {
    handleSaved(updated)
  }

  function showFieldKey(showId: string, key: string) { return `${showId}:${key}` }
  function runFieldKey(key: string) { return `run:${key}` }

  const fieldMap = new Map<string, CostFieldRow>()
  for (const f of fields) {
    if (f.show_id) fieldMap.set(showFieldKey(f.show_id, f.field_key), f)
    else fieldMap.set(runFieldKey(f.field_key), f)
  }

  const mergedFactors: InsideFactorValues = insideFactors

  // social_ads_var is AUTO-CALC: tickets × $1.10 — computed live from sliders, not from stored value
  const dynamicSocialAds = showsState.reduce((sum, s) => {
    const cap = modelCapacity(s); const tickets = cap ? Math.round(cap * (sellThrough[s.id] ?? 75) / 100) : 0
    return sum + Math.round(tickets * 1.10)
  }, 0)

  const runCostTotal = RUN_FIELDS.reduce((sum, f) => {
    if (f.key === 'social_ads_var') return sum + dynamicSocialAds
    const row = fieldMap.get(runFieldKey(f.key))
    return sum + (effectiveFieldValue(row) ?? 0)
  }, 0)

  const showCostTotal = showsState.reduce((sum, show) => {
    const pct = sellThrough[show.id] ?? 75
    return sum + SHOW_FIELDS.filter(f => f.category !== 'Revenue').reduce((s2, f) => {
      const row = fieldMap.get(showFieldKey(show.id, f.key))
      if (f.key === 'venue_staff') return s2 + (calcVenueStaff(show, pct, row) ?? 0)
      return s2 + (effectiveFieldValue(row) ?? 0)
    }, 0)
  }, 0)

  const totalCosts = runCostTotal + showCostTotal

  const unlockLines = [
    ...RUN_FIELDS.map(f => {
      const row = fieldMap.get(runFieldKey(f.key))
      return {
        fieldKey: f.key,
        category: f.category,
        state: row?.state ?? null,
        allPaid: row ? allEntriesPaid(sectionPayableLines(f.key, row.entries, row.line_items)) : false,
        label: f.label,
      }
    }),
    ...showsState.flatMap(show =>
      SHOW_FIELDS.map(sf => {
        const row = fieldMap.get(showFieldKey(show.id, sf.key))
        return {
          fieldKey: sf.key,
          category: sf.category,
          state: row?.state ?? null,
          allPaid: row ? allEntriesPaid(sectionPayableLines(sf.key, row.entries, row.line_items)) : false,
          label: `${show.venue_city} – ${sf.label}`,
        }
      }),
    ),
  ]
  const unlock = pnlSlidersUnlocked(unlockLines)
  const slidersUnlocked = unlock.unlocked
  const incompleteFields = unlock.blocking.map(b => {
    const labelled = unlockLines.find(l => l.fieldKey === b.fieldKey && l.category === b.category && l.state === b.state)
    return labelled?.label ?? b.fieldKey
  })
  const isDataComplete = slidersUnlocked
  const ownerVenuePnls = showsState.map(show =>
    venuePnl({
      show,
      pct: sellThrough[show.id] ?? 75,
      factors: mergedFactors,
      remittanceLines,
    }),
  )
  const ownerNetRevenue = ownerVenuePnls.reduce((s, v) => s + v.waterfall.netRevenue, 0)
  const ownerPnlSummary = computePnlSummary({ netRevenue: ownerNetRevenue, totalCosts })
  const hasGuessFields = !isDataComplete ? false : (() => {
    for (const f of RUN_FIELDS) {
      if (COMPLETENESS_EXCLUDED.has(f.key)) continue
      const row = fieldMap.get(runFieldKey(f.key))
      if (row && (row.state === 'guess' || row.state === 'estimated')) return true
    }
    for (const show of showsState) {
      for (const sf of SHOW_FIELDS.filter(sf => sf.category !== 'Revenue')) {
        const row = fieldMap.get(showFieldKey(show.id, sf.key))
        if (row && (row.state === 'guess' || row.state === 'estimated')) return true
      }
    }
    return false
  })()

  async function updateSellThrough(showId: string, pct: number) {
    const newSellThrough = { ...sellThrough, [showId]: pct }
    setSellThrough(newSellThrough)
    const supabase = createClient()
    await supabase.from('shows').update({ sell_through_pct: pct }).eq('id', showId)
    // Keep stored social_ads_var in sync so Costs tab matches
    const newSocialAds = showsState.reduce((sum, s) => {
      const cap = modelCapacity(s); const tickets = cap ? Math.round(cap * (newSellThrough[s.id] ?? 75) / 100) : 0
      return sum + Math.round(tickets * 1.10)
    }, 0)
    const socialAdsField = fieldMap.get(runFieldKey('social_ads_var'))
    if (socialAdsField) {
      await supabase.from('cost_fields').update({ value: newSocialAds }).eq('id', socialAdsField.id)
      setFields(prev => prev.map(f => f.id === socialAdsField.id ? { ...f, value: newSocialAds } : f))
    }
  }

  return (
    <>
      {!hasTabAccess && !hasAdvancement && !hasShowPack && (
        <div className="rounded-xl p-6 mb-6 text-center" style={{ background: 'var(--surface, #1e293b)', border: '1px solid #334155' }}>
          <div className="text-2xl mb-2">🔒</div>
          <div className="text-slate-300 font-medium mb-1">Financial data restricted</div>
          <div className="text-slate-500 text-sm">Run costing and P&L information is available to owners and administrators only.</div>
        </div>
      )}

      {(hasTabAccess || hasOutlook || hasAdvancement || hasShowPack) && (
      <div className="relative mb-6">
        <div className="flex gap-1 border-b border-slate-700 items-end overflow-x-auto scrollbar-thin pb-px pr-6">
          {(['costs', 'outlook', 'audit'] as const).filter(tab => canAccessTab(effectiveRole, tab)).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium whitespace-nowrap flex-shrink-0 border-b-2 transition-colors -mb-px ${
                activeTab === tab ? 'border-amber-400 text-amber-400' : 'border-transparent text-slate-400 hover:text-white'
              }`}>
              {tab === 'costs' ? 'Run Costing' : tab === 'audit' ? 'Audit Trail' : 'Ticket Outlook'}
            </button>
          ))}
          {hasAdvancement && (
            <button onClick={() => setActiveTab('advancement')}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium whitespace-nowrap flex-shrink-0 border-b-2 transition-colors -mb-px ${
                activeTab === 'advancement' ? 'border-amber-400 text-amber-400' : 'border-transparent text-slate-400 hover:text-white'
              }`}>
              Advancing Shows
            </button>
          )}
          {hasShowPack && (
            <button onClick={() => setActiveTab('show_pack')}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium whitespace-nowrap flex-shrink-0 border-b-2 transition-colors -mb-px ${
                activeTab === 'show_pack' ? 'border-amber-400 text-amber-400' : 'border-transparent text-slate-400 hover:text-white'
              }`}>
              Worksheet
            </button>
          )}
          <span className="ml-auto text-slate-800 text-xs pb-2 select-none flex-shrink-0">v3</span>
        </div>
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-900 to-transparent sm:hidden" aria-hidden />
      </div>
      )}

      {/* TICKET SALES OUTLOOK TAB */}
      {hasOutlook && activeTab === 'outlook' && (
        <TicketOutlookBlock
          shows={showsState.map(s => ({
            id: s.id,
            venue_name: s.venue_name,
            venue_city: s.venue_city,
            state_territory: s.state_territory,
            show_date: s.show_date,
            ticket_outlook: s.ticket_outlook ?? null,
            ticket_outlook_level: s.ticket_outlook_level ?? null,
            ticket_outlook_status: s.ticket_outlook_status ?? 'empty',
            ticket_outlook_as_of: s.ticket_outlook_as_of ?? null,
            ticket_outlook_sources: s.ticket_outlook_sources ?? [],
          }))}
          runSummary={ticketOutlookSummary}
          isOwnerOrAdmin={isOwnerOrAdmin}
        />
      )}

      {/* ADVANCING SHOWS TAB */}
      {hasAdvancement && activeTab === 'advancement' && (
        <AdvancementTab
          runId={runId}
          region={region}
          shows={showsState.map(s => ({
            id: s.id,
            venue_name: s.venue_name,
            venue_city: s.venue_city,
            show_date: s.show_date,
            show_order: s.show_order,
          }))}
        />
      )}

      {/* WORKSHEET TAB */}
      {hasShowPack && activeTab === 'show_pack' && (
        <ShowPackTab
          runId={runId}
          runCode={runCode}
          runName={runName}
          region={region}
          startDate={effectiveStartDate}
          endDate={effectiveEndDate}
          synopsis={synopsis}
          initialShows={showsState.map(s => ({
            id: s.id,
            venue_name: s.venue_name,
            venue_city: s.venue_city,
            state_territory: s.state_territory,
            show_date: s.show_date,
            capacity: s.capacity,
            show_order: s.show_order,
          }))}
        />
      )}

      {/* COST FIELDS TAB — one sheet: owners get revenue top + P&L bottom; middle costing unchanged */}
      {hasTabAccess && activeTab === 'costs' && (
        <div className="space-y-6">
          {showOwnerPnl && (
            <PnlRevenueBlock
              shows={showsState}
              sellThrough={sellThrough}
              slidersUnlocked={slidersUnlocked}
              incompleteFields={incompleteFields}
              hasGuessFields={hasGuessFields}
              factors={mergedFactors}
              remittanceLines={remittanceLines}
              onSellThrough={updateSellThrough}
              onShowUpdated={handleShowUpdated}
            />
          )}

          {/* Legend */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs mb-1">
            {([
              { key: 'known',     desc: 'CONFIRMED — figure accuracy / lines attested. Not payment.' },
              { key: 'estimated', desc: 'Rough figure known; update to CONFIRMED when ready' },
              { key: 'pending',   desc: 'Income-dependent: box office, Harbour commission, per-ticket fees' },
              { key: 'guess',     desc: 'External data still needed before run go/no-go decision' },
            ] as const).map(({ key, desc }) => {
              const style = STATE_STYLES[key]
              return (
                <div key={key} className="flex items-start gap-2">
                  <span className={`px-1.5 py-0.5 rounded border shrink-0 ${style.bg} ${style.text} ${style.border}`}>{style.label}</span>
                  <span className="text-slate-500 leading-snug pt-0.5">{desc}</span>
                </div>
              )
            })}
          </div>
          <div className="flex items-start gap-2 text-xs -mt-1 mb-1">
            <span className={`px-1.5 py-0.5 rounded border shrink-0 ${PAID_BADGE.bg} ${PAID_BADGE.text} ${PAID_BADGE.border}`}>{PAID_BADGE.label}</span>
            <span className="text-slate-500 leading-snug pt-0.5">Receipt recorded — locks the line or planned role. Per-line / per-role Pay still needs a confirm tick. Edit → MARK ALL AS PAID marks every line (or role) paid (unticked rows are confirmed by that action). Un-pay or undo via the dropdown to unlock.</span>
          </div>
          <p className="text-slate-600 text-xs -mt-2">Use ▼ on any cost field to drill into the breakdown and add individual line items as they come in.</p>

          {/* Per-show sections */}
          {showsState.map((show, idx) => (
            <div key={show.id} className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-400 text-xs font-bold shrink-0 self-start mt-0.5">{idx + 1}</div>
                <div className="flex-1 min-w-0">
                  <ShowDetailsEditor
                    show={show}
                    isOwner={!isProduction}
                    onUpdated={handleShowUpdated}
                  />
                </div>
              </div>

              {['Venue Costs'].map(cat => {
                const catFields = visibleShowFields.filter(f => f.category === cat)
                return (
                  <div key={cat}>
                    <h4 className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1.5 ml-9">{cat}</h4>
                    <div className="space-y-1.5 ml-9">
                      {catFields.map(fieldDef =>
                        fieldDef.key === 'venue_staff' ? (
                          <VenueStaffRow
                            key={fieldDef.key}
                            runId={runId}
                            showId={show.id}
                            existing={fieldMap.get(showFieldKey(show.id, fieldDef.key))}
                            onSaved={handleSaved}
                            onEntriesUpdated={handleEntriesUpdated}
                            editorDisplayName={editorNameForField(
                              fieldMap.get(showFieldKey(show.id, fieldDef.key)),
                              editorDisplayNameByFieldId,
                              profile,
                            )}
                          />
                        ) : (
                          <FieldRow
                            key={fieldDef.key}
                            runId={runId}
                            showId={show.id}
                            fieldDef={fieldDef}
                            existing={fieldMap.get(showFieldKey(show.id, fieldDef.key))}
                            onSaved={handleSaved}
                            onEntriesUpdated={handleEntriesUpdated}
                            editorDisplayName={editorNameForField(
                              fieldMap.get(showFieldKey(show.id, fieldDef.key)),
                              editorDisplayNameByFieldId,
                              profile,
                            )}
                          />
                        )
                      )}
                    </div>
                  </div>
                )
              })}

              {idx < showsState.length - 1 && <div className="border-b border-slate-800 mt-4" />}
            </div>
          ))}

          {/* Run-level shared costs */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-6 h-6 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center shrink-0">
                <span className="text-slate-400 text-xs">∑</span>
              </div>
              <div>
                <div className="text-white font-semibold text-sm">{isProduction ? 'Production — Run Level' : 'Run-Level Costs'}</div>
                <div className="text-slate-500 text-xs">{isProduction ? 'Equipment hire shared across all shows' : 'Shared across all shows'}</div>
              </div>
            </div>

            {visibleRunCategories.map(cat => (
              <div key={cat} className="mb-4">
                <h4 className="text-slate-500 text-xs font-medium uppercase tracking-wider mb-1.5 ml-9">{cat}</h4>
                <div className="space-y-1.5 ml-9">
                  {RUN_FIELDS.filter(f => f.category === cat).map(fieldDef => (
                    <FieldRow
                      key={fieldDef.key}
                      runId={runId}
                      showId={null}
                      fieldDef={fieldDef}
                      existing={fieldMap.get(runFieldKey(fieldDef.key))}
                      onSaved={handleSaved}
                      onEntriesUpdated={handleEntriesUpdated}
                      editorDisplayName={editorNameForField(
                        fieldMap.get(runFieldKey(fieldDef.key)),
                        editorDisplayNameByFieldId,
                        profile,
                      )}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {showOwnerPnl && (
            <PnlSummaryBlock summary={ownerPnlSummary} slidersUnlocked={slidersUnlocked} />
          )}
        </div>
      )}

      {/* AUDIT TRAIL TAB */}
      {hasTabAccess && activeTab === 'audit' && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          {auditRows.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-slate-500 text-sm">No changes recorded yet.</p>
              <p className="text-slate-600 text-xs mt-1">Consequential edits appear here as plain-language sentences.</p>
            </div>
          ) : (
            <table data-testid="audit-trail-table" className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">When</th>
                  <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">What happened</th>
                  <th className="text-left text-slate-400 text-xs font-medium px-4 py-3">By</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((row, i) => (
                  <tr key={row.id} className={`border-b border-slate-700/50 ${i === auditRows.length - 1 ? 'border-0' : ''}`}>
                    <td className="px-4 py-2.5 text-slate-500 text-xs whitespace-nowrap align-top">{row.changed_at}</td>
                    <td className="px-4 py-2.5 text-slate-200 text-sm leading-snug max-w-2xl">
                      <span data-testid="audit-trail-sentence">{row.sentence}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs whitespace-nowrap align-top">{row.changed_by_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  )
}

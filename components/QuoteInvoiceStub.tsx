'use client'

import { useEffect, useRef, useState } from 'react'
import {
  QUOTE_INVOICE_NOTE_LABEL,
  QUOTE_INVOICE_NOTE_PLACEHOLDER,
  QUOTE_INVOICE_STUB_HELP,
} from '@/lib/quote-invoice-stub'

export default function QuoteInvoiceStub({
  filename,
  quoteNote,
  disabled,
  busy,
  testIdPrefix = 'quote-invoice',
  onNoteCommit,
  onAttach,
  onRemove,
}: {
  filename?: string | null
  quoteNote?: string | null
  disabled?: boolean
  busy?: boolean
  testIdPrefix?: string
  onNoteCommit: (note: string) => void
  onAttach: (file: File) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(quoteNote ?? '')
  const attached = Boolean((filename ?? '').trim())

  useEffect(() => {
    setDraft(quoteNote ?? '')
  }, [quoteNote])

  function commitNote() {
    const next = draft.trim()
    const prev = (quoteNote ?? '').trim()
    if (next === prev) return
    onNoteCommit(next)
  }

  return (
    <div className="mt-2 space-y-1.5" data-testid={`${testIdPrefix}-stub`}>
      <div className="flex flex-wrap items-center gap-1.5">
        {attached ? (
          <span
            data-testid={`${testIdPrefix}-chip`}
            title={QUOTE_INVOICE_STUB_HELP}
            className="inline-flex items-center gap-1 max-w-full text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-slate-800 text-slate-300 border-slate-600"
          >
            <span className="truncate">{filename}</span>
            <button
              type="button"
              data-testid={`${testIdPrefix}-remove`}
              disabled={disabled || busy}
              onClick={onRemove}
              className="text-slate-500 hover:text-red-300 disabled:opacity-40"
              aria-label="Remove quote/invoice file"
            >
              ×
            </button>
          </span>
        ) : (
          <>
            <input
              ref={inputRef}
              data-testid={`${testIdPrefix}-attach`}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/gif,.pdf,.jpg,.jpeg,.png,.webp,.gif"
              className="sr-only"
              disabled={disabled || busy}
              onChange={e => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) onAttach(file)
              }}
            />
            <button
              type="button"
              data-testid={`${testIdPrefix}-attach-btn`}
              disabled={disabled || busy}
              onClick={() => inputRef.current?.click()}
              className="text-[10px] font-semibold text-slate-400 hover:text-amber-300 disabled:opacity-40"
            >
              Attach quote/invoice
            </button>
          </>
        )}
      </div>
      <input
        data-testid={`${testIdPrefix}-note`}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commitNote}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ;(e.target as HTMLInputElement).blur()
          }
        }}
        disabled={disabled || busy}
        placeholder={QUOTE_INVOICE_NOTE_PLACEHOLDER}
        aria-label={QUOTE_INVOICE_NOTE_LABEL}
        className="w-full px-2 py-1 rounded text-xs bg-slate-900 border border-slate-700 text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400 disabled:opacity-50"
      />
    </div>
  )
}

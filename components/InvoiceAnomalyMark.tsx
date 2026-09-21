'use client'

/** Red/amber ⚠ for a flagged money_entry. Tooltip / aria = anomaly_note. */
export function InvoiceAnomalyMark({
  note,
  testId = 'anomaly-mark',
}: {
  note?: string | null
  testId?: string
}) {
  const title = String(note ?? '').trim() || 'Anomaly — review this invoice line'
  return (
    <span
      data-testid={testId}
      title={title}
      aria-label={title}
      className="inline-flex items-center justify-center text-red-400 text-sm font-bold leading-none drop-shadow-[0_0_5px_rgba(251,191,36,0.65)]"
    >
      ⚠
    </span>
  )
}

export function InvoicedChip({ testId = 'invoiced-chip' }: { testId?: string }) {
  return (
    <span
      data-testid={testId}
      title="Invoice received. INVOICED ≠ PAID."
      className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-sky-900/30 text-sky-300 border-sky-800 whitespace-nowrap"
    >
      INVOICED
    </span>
  )
}

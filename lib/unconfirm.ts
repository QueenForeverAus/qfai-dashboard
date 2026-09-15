/**
 * Wave A Unconfirm (Topic 11).
 *
 * Owners/admins only + warning:
 *   - Costings becomes editable again
 *   - Run stays BOOKED (`runs.status = confirmed`) — do not drop to proposed
 *   - Advancing workspace is retained and stays editable
 *   - Factors stay irrelevant (run is still BOOKED)
 *
 * On Accept / BOOK again: sure? → freeze Costings → copy Costings→Advancing
 * preserving PAID / INVOICED / paid travel money_entries / Band Comps hooks.
 */

import { isBookedBookingStatus } from './booked-cost-freeze.ts'

export const AUDIT_FIELD_UNCONFIRM = 'Unconfirm Costings' as const
export const AUDIT_FIELD_REBOOK = 'Re-BOOK after Unconfirm' as const

export const UNCONFIRM_WARNING =
  'Unconfirm unlocks Run Costings for edits. The run stays BOOKED. Advancing is kept and stays editable. Factors will not refresh this run. Re-BOOK when Costings is ready — that freezes Costings again and recopies into Advancing, keeping PAID / INVOICED / paid travel / Band Comps.'

export const BOOK_SURE_WARNING =
  'BOOK this run? Costings will freeze and copy exactly into Advancing. Live money edits after BOOK happen on Advancing only. Factors will no longer change this run.'

export const REBOOK_SURE_WARNING =
  'Re-BOOK this run? Costings will freeze again and copy into Advancing. PAID, INVOICED, paid travel money, and Band Comps already on Advancing are preserved.'

export const UNCONFIRM_FORBIDDEN =
  'Only owners and admins can Unconfirm a BOOKED run.'

export const UNCONFIRM_NOT_BOOKED =
  'Unconfirm is only available while the run is BOOKED.'

export const UNCONFIRM_ALREADY =
  'Costings is already unconfirmed on this BOOKED run.'

export const REBOOK_NOT_UNCONFIRMED =
  'Re-BOOK is only available after Unconfirm on a BOOKED run.'

export function isOwnerOrAdminRole(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export function isCostingsUnconfirmed(
  run: { costings_unconfirmed_at?: string | null } | null | undefined,
): boolean {
  return Boolean(run?.costings_unconfirmed_at)
}

/**
 * BOOKED freeze is off while Unconfirm is open, even though status stays confirmed.
 */
export function costingsEditableAfterUnconfirm(run: {
  status?: string | null
  costings_unconfirmed_at?: string | null
} | null | undefined): boolean {
  return isBookedBookingStatus(run?.status) && isCostingsUnconfirmed(run)
}

export function canUnconfirmRun(opts: {
  role: string | null | undefined
  status: string | null | undefined
  costingsUnconfirmedAt?: string | null
}): { ok: true } | { ok: false; error: string } {
  if (!isOwnerOrAdminRole(opts.role)) return { ok: false, error: UNCONFIRM_FORBIDDEN }
  if (!isBookedBookingStatus(opts.status)) return { ok: false, error: UNCONFIRM_NOT_BOOKED }
  if (opts.costingsUnconfirmedAt) return { ok: false, error: UNCONFIRM_ALREADY }
  return { ok: true }
}

export function canRebookAfterUnconfirm(opts: {
  role: string | null | undefined
  status: string | null | undefined
  costingsUnconfirmedAt?: string | null
}): { ok: true } | { ok: false; error: string } {
  if (!isOwnerOrAdminRole(opts.role)) return { ok: false, error: UNCONFIRM_FORBIDDEN }
  if (!isBookedBookingStatus(opts.status)) return { ok: false, error: UNCONFIRM_NOT_BOOKED }
  if (!opts.costingsUnconfirmedAt) return { ok: false, error: REBOOK_NOT_UNCONFIRMED }
  return { ok: true }
}

/** Unconfirm must never change booking status. */
export function unconfirmKeepsBookedStatus(nextStatus: string, prevStatus: string): boolean {
  return isBookedBookingStatus(prevStatus) && isBookedBookingStatus(nextStatus)
}

export function shouldArchiveAdvancingOnUnconfirm(): boolean {
  return false
}

export function formatUnconfirmAuditCopy(opts: {
  actorName: string
  runCode: string
  reason?: string | null
}): { fieldName: string; oldValue: string; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  const why = (opts.reason ?? '').trim()
  const reasonBit = why ? ` Why: ${why}` : ''
  return {
    fieldName: AUDIT_FIELD_UNCONFIRM,
    oldValue: 'BOOKED · Costings frozen',
    newValue: `${actor} unconfirmed Costings for ${opts.runCode}. Run stays BOOKED. Advancing retained.${reasonBit}`,
  }
}

export function formatRebookAuditCopy(opts: {
  actorName: string
  runCode: string
  fieldCount: number
}): { fieldName: string; oldValue: string; newValue: string } {
  const actor = opts.actorName.trim() || 'Someone'
  return {
    fieldName: AUDIT_FIELD_REBOOK,
    oldValue: 'BOOKED · Costings unconfirmed',
    newValue: `${actor} re-BOOKED ${opts.runCode}: Costings frozen and copied to Advancing (${opts.fieldCount} line${opts.fieldCount === 1 ? '' : 's'}), preserving PAID / INVOICED / paid travel / Band Comps.`,
  }
}

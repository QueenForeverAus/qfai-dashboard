/**
 * Harbour Import Schedule allowlist.
 *
 * Canonical rule: `docs/import-schedule-harbour-fields-v1.md`
 * Later autoload must obey the same rule: `docs/harbour-draft-autoload-later-v1.md`
 *
 * HARD standing rule (Gareth 2026-09-10): across import — new shows, same-date,
 * OR date moves — preserve all team-entered Portal data. Harbour must not
 * overwrite or wipe QF-entered fields.
 *
 * Today matching is by `show_date` only. Date-move UPDATE of the same
 * `shows.id` (changing `show_date` + Harbour-sourced venue fields) is reserved
 * and is not applied by this allowlist until that migrate lands.
 */

export const HARBOUR_PATCHABLE_SHOW_KEYS = [
  'venue_name',
  'capacity',
  'state_territory',
  'ticket_price',
] as const

export type HarbourPatchableShowKey = (typeof HARBOUR_PATCHABLE_SHOW_KEYS)[number]

/** Run columns Harbour may change on Import Schedule apply. */
export const HARBOUR_PATCHABLE_RUN_KEYS = ['status'] as const

export type HarbourPatchableRunKey = (typeof HARBOUR_PATCHABLE_RUN_KEYS)[number]

/**
 * Reserved for a same-`shows.id` date-move UPDATE (Harbour-sourced date only).
 * Not in today's apply allowlist — POST matches by `show_date`, so a date
 * change currently surfaces as new_in_sheet + removed_from_sheet and PUT
 * neither creates nor deletes those rows.
 */
export const HARBOUR_DATE_MOVE_SHOW_KEYS = ['show_date'] as const

/**
 * Team-entered Portal surfaces Harbour must never write on import.
 * Names are columns / tables, not an exhaustive schema dump.
 */
export const HARBOUR_IMPORT_NEVER_WRITE = [
  'michael_notes',
  'travel_access_notes',
  'hotel_notes',
  'hospitality_merch_notes',
  'advancement_items',
  'worksheet_fields',
  'travel_blocks',
  'cost_fields',
  'settlements',
] as const

export type HarbourShowChangeMap = Record<string, { from: unknown; to: unknown }>

/** Keep only Harbour-sourced show keys from a preview `changes` map. */
export function pickHarbourShowPatch(changes: HarbourShowChangeMap | null | undefined): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (!changes) return patch
  for (const key of HARBOUR_PATCHABLE_SHOW_KEYS) {
    if (key in changes) patch[key] = changes[key].to
  }
  return patch
}

export function isHarbourPatchableShowKey(key: string): key is HarbourPatchableShowKey {
  return (HARBOUR_PATCHABLE_SHOW_KEYS as readonly string[]).includes(key)
}

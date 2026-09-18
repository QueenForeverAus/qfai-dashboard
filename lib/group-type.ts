/**
 * Wave B — first-class Group Type (G1–G4) on Costings.
 *
 * `runs.region` is the stored Group Type. Classifier seeds a default;
 * operators override on Costings only. Advancing never owns the change.
 */

import type { RunRegion } from './types.ts'
import { isBookedBookingStatus } from './booked-cost-freeze.ts'
import { isCostingsUnconfirmed, isOwnerOrAdminRole } from './unconfirm.ts'

export const GROUP_TYPES = ['group1', 'group2', 'group3', 'group4'] as const
export type GroupType = (typeof GROUP_TYPES)[number]

export const GROUP_TYPE_LABELS: Record<RunRegion, string> = {
  group1: 'Group 1 · Self-drive',
  group2: 'Group 2 · Fly + Van',
  group3: 'Group 3 · Fly + Local Backline',
  group4: 'Group 4 · International / Overseas',
}

export const GROUP_TYPE_SHORT_LABELS: Record<RunRegion, string> = {
  group1: 'G1 · Self-drive',
  group2: 'G2 · Fly+Van',
  group3: 'G3 · Fly+Local',
  group4: 'G4 · Overseas',
}

export const KEYBOARD_STAND_HIRE_LABEL = 'Keyboard + stand hire'
export const CARNIVAL_1_LABEL = 'Kia Carnival 1'
export const CARNIVAL_2_LABEL = 'Kia Carnival 2'

/** G4 NZ whole-party return ESTIMATE (ex-GST). Used when Factors key is empty. */
export const G4_FLIGHTS_NZ_FALLBACK = 6000
/** G4 Asia whole-party return ESTIMATE (ex-GST). Used when Factors key is empty. */
export const G4_FLIGHTS_ASIA_FALLBACK = 10000

export const GROUP_SEED_FIELD_KEYS = [
  'lighting_hire',
  'backline_hire',
  'flights',
  'ground_transport',
  'crew_travel_day',
] as const

export type GroupSeedFieldKey = (typeof GROUP_SEED_FIELD_KEYS)[number]

export const GROUP_CHANGE_LOCKED =
  'Group Type is locked while the run is BOOKED. Unconfirm Costings first, then change Group and review seeds.'

export const GROUP_CHANGE_ADVANCING =
  'Group Type can only be changed on Costings, not Advancing.'

export const GROUP_CHANGE_FORBIDDEN =
  'Only owners and admins can change Group Type on Costings.'

export const GROUP_CHANGE_SAME =
  'Group Type is already set to this value.'

export const GROUP_CHANGE_REVIEW_INTRO =
  'Changing Group Type applies that group’s seeds. Lines that are CONFIRMED, INVOICED, or PAID must be kept or replaced — they are never wiped silently.'

export function isGroupType(value: unknown): value is RunRegion {
  return value === 'group1' || value === 'group2' || value === 'group3' || value === 'group4'
}

export function groupTypeLabel(region: string | null | undefined): string {
  if (isGroupType(region)) return GROUP_TYPE_LABELS[region]
  return region?.trim() || 'Group Type'
}

/** G1/G2 may seed standing $330 Michael lighting. G3/G4 never do. */
export function allowsStandingLightingHire(region: RunRegion | string | null | undefined): boolean {
  return region === 'group1' || region === 'group2'
}

/** G4 always hires keyboard + stand. G3 brings own keyboard (no KB hire seed). */
export function seedsKeyboardStandHire(region: RunRegion | string | null | undefined): boolean {
  return region === 'group4'
}

export function needsLocalBackline(region: RunRegion | string | null | undefined): boolean {
  return region === 'group3' || region === 'group4'
}

export function isOverseasGroup(region: RunRegion | string | null | undefined): boolean {
  return region === 'group4'
}

export function isGroupSeedFieldKey(fieldKey: string | null | undefined): boolean {
  return (GROUP_SEED_FIELD_KEYS as readonly string[]).includes(String(fieldKey ?? ''))
}

/**
 * Costings-only. BOOKED stays locked until Unconfirm.
 * Advancing callers must pass `workspace: 'advancing'` (always locked).
 */
export function canEditGroupType(opts: {
  role?: string | null
  status?: string | null
  costingsUnconfirmedAt?: string | null
  workspace?: 'costing' | 'advancing'
}): { ok: true } | { ok: false; error: string } {
  if (opts.workspace === 'advancing') return { ok: false, error: GROUP_CHANGE_ADVANCING }
  if (!isOwnerOrAdminRole(opts.role)) return { ok: false, error: GROUP_CHANGE_FORBIDDEN }
  if (isBookedBookingStatus(opts.status) && !isCostingsUnconfirmed({
    costings_unconfirmed_at: opts.costingsUnconfirmedAt,
  })) {
    return { ok: false, error: GROUP_CHANGE_LOCKED }
  }
  return { ok: true }
}

export function groupSeedLineKey(fieldKey: string, showId?: string | null): string {
  return `${showId ?? 'run'}:${fieldKey}`
}

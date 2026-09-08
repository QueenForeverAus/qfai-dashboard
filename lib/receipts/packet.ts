/**
 * Tour Desk v2 Phase 3 — receipt extract packet schema.
 *
 * Hotel is the first implemented kind. Flight / car are typed stubs so email
 * scrape (later) can emit the same envelope without a schema break.
 * Manual paste / fixture apply only in this PR — no email watcher.
 */

export const RECEIPT_PACKET_VERSION = 1 as const

export const RECEIPT_KINDS = ['hotel', 'flight', 'car', 'other'] as const
export type ReceiptKind = (typeof RECEIPT_KINDS)[number]

export const RECEIPT_CHARGE_KINDS = ['charge', 'refund'] as const
export type ReceiptChargeKind = (typeof RECEIPT_CHARGE_KINDS)[number]

export type ReceiptPacketBase = {
  version: typeof RECEIPT_PACKET_VERSION
  kind: ReceiptKind
  vendor: string
  confirmation_id: string
  currency: 'AUD'
  total_paid: number
  /** Booking confirm with payment → true. Draft-known quotes stay false. */
  paid: boolean
  charge_kind?: ReceiptChargeKind
  guest_names?: string[]
  notes?: string
}

export type HotelReceiptPacket = ReceiptPacketBase & {
  kind: 'hotel'
  check_in: string
  check_out: string
  /** Suburb / property locality (may differ from show city — Thornton / Maitland). */
  locality: string
  city?: string
  address?: string
}

/** Stub — apply not implemented this phase. */
export type FlightReceiptPacket = ReceiptPacketBase & {
  kind: 'flight'
  depart_date?: string
  from?: string
  to?: string
}

/** Stub — apply not implemented this phase. */
export type CarReceiptPacket = ReceiptPacketBase & {
  kind: 'car'
  pickup_date?: string
  return_date?: string
  locality?: string
}

export type OtherReceiptPacket = ReceiptPacketBase & {
  kind: 'other'
}

export type ReceiptExtractPacket =
  | HotelReceiptPacket
  | FlightReceiptPacket
  | CarReceiptPacket
  | OtherReceiptPacket

export type PacketParseResult =
  | { ok: true; packet: ReceiptExtractPacket }
  | { ok: false; error: string }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readString(row: Record<string, unknown>, key: string): string {
  const raw = row[key]
  return typeof raw === 'string' ? raw.trim() : ''
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function readGuestNames(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const names = raw.map(v => String(v ?? '').trim()).filter(Boolean)
  return names.length ? names : undefined
}

export function parseReceiptExtractPacket(input: unknown): PacketParseResult {
  const row = typeof input === 'string'
    ? (() => {
        try {
          return asRecord(JSON.parse(input))
        } catch {
          return null
        }
      })()
    : asRecord(input)

  if (!row) return { ok: false, error: 'Receipt packet must be a JSON object.' }

  const version = Number(row.version)
  if (version !== RECEIPT_PACKET_VERSION) {
    return { ok: false, error: `Unsupported packet version (expected ${RECEIPT_PACKET_VERSION}).` }
  }

  const kind = readString(row, 'kind')
  if (!(RECEIPT_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, error: 'Packet kind must be hotel, flight, car, or other.' }
  }

  const vendor = readString(row, 'vendor')
  const confirmationId = readString(row, 'confirmation_id')
  if (!vendor) return { ok: false, error: 'Packet is missing vendor.' }
  if (!confirmationId) return { ok: false, error: 'Packet is missing confirmation_id.' }

  const currency = readString(row, 'currency').toUpperCase()
  if (currency !== 'AUD') return { ok: false, error: 'Packet currency must be AUD.' }

  const totalPaid = Number(row.total_paid)
  if (!Number.isFinite(totalPaid)) {
    return { ok: false, error: 'Packet total_paid must be a number.' }
  }

  const chargeKindRaw = readString(row, 'charge_kind')
  const charge_kind: ReceiptChargeKind = chargeKindRaw === 'refund' ? 'refund' : 'charge'

  const base: ReceiptPacketBase = {
    version: RECEIPT_PACKET_VERSION,
    kind: kind as ReceiptKind,
    vendor,
    confirmation_id: confirmationId,
    currency: 'AUD',
    total_paid: totalPaid,
    paid: row.paid === undefined ? charge_kind === 'charge' : Boolean(row.paid),
    charge_kind,
    guest_names: readGuestNames(row.guest_names),
    notes: readString(row, 'notes') || undefined,
  }

  if (kind === 'hotel') {
    const check_in = readString(row, 'check_in')
    const check_out = readString(row, 'check_out')
    const locality = readString(row, 'locality') || readString(row, 'city')
    if (!isIsoDate(check_in) || !isIsoDate(check_out)) {
      return { ok: false, error: 'Hotel packet needs check_in and check_out as YYYY-MM-DD.' }
    }
    if (check_out <= check_in) {
      return { ok: false, error: 'Hotel check_out must be after check_in.' }
    }
    if (!locality) return { ok: false, error: 'Hotel packet needs locality or city.' }
    const packet: HotelReceiptPacket = {
      ...base,
      kind: 'hotel',
      check_in,
      check_out,
      locality,
      city: readString(row, 'city') || undefined,
      address: readString(row, 'address') || undefined,
    }
    return { ok: true, packet }
  }

  if (kind === 'flight') {
    const packet: FlightReceiptPacket = {
      ...base,
      kind: 'flight',
      depart_date: readString(row, 'depart_date') || undefined,
      from: readString(row, 'from') || undefined,
      to: readString(row, 'to') || undefined,
    }
    return { ok: true, packet }
  }

  if (kind === 'car') {
    const packet: CarReceiptPacket = {
      ...base,
      kind: 'car',
      pickup_date: readString(row, 'pickup_date') || undefined,
      return_date: readString(row, 'return_date') || undefined,
      locality: readString(row, 'locality') || undefined,
    }
    return { ok: true, packet }
  }

  return { ok: true, packet: { ...base, kind: 'other' } }
}

export function isHotelReceiptPacket(packet: ReceiptExtractPacket): packet is HotelReceiptPacket {
  return packet.kind === 'hotel'
}

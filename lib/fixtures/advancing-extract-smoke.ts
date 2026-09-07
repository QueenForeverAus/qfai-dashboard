/**
 * Smoke fixture — advancing-packet-v1 (Comms-locked contract).
 * High-confidence Civic batch: AV, crew (incl. over-target), rider-as-staff, backline.
 * Hire + lighting stay put; lone FOH is planner-skipped (no blocking inbound flag).
 */

const PACKET_BASE = {
  schema: 'advancing-packet-v1' as const,
  apply_env: 'staging' as const,
  action: 'apply' as const,
  confidence: 'high' as const,
  venue_short_name: 'Civic',
  email_date: '07/09/26',
  message_id: '<smoke-michael-civic-20260907@queenforever.test>',
  thread_ref: 'thread-smoke-civic-advancing',
  evidence_snippet: 'Michael confirmed tech package $1,100, 2 ushers + 1 duty tech, rider as staff $180.',
}

export const SMOKE_ADVANCING_EXTRACT = {
  schema: 'advancing-packet-v1' as const,
  apply_env: 'staging' as const,
  action: 'apply' as const,
  force: false,
  packets: [
    {
      ...PACKET_BASE,
      id: 'av-package',
      category: 'production_av',
      description: 'Venue tech / AV package',
      amount: 1100,
      gst_included: true,
      soft_flags: [] as string[],
    },
    {
      ...PACKET_BASE,
      id: 'ushers',
      category: 'venue_staff',
      description: 'Ushers',
      role: 'Ushers',
      rate: 56.5,
      hours: 4,
      headcount: 2,
      amount: 452,
      gst_included: true,
      soft_flags: [] as string[],
    },
    {
      ...PACKET_BASE,
      id: 'duty-tech',
      category: 'venue_staff',
      description: 'Duty technician',
      role: 'Duty technician',
      rate: 78,
      hours: 8,
      headcount: 1,
      amount: 624,
      gst_included: true,
      soft_flags: [] as string[],
    },
    {
      ...PACKET_BASE,
      id: 'extra-ushers',
      category: 'venue_staff',
      description: 'FOH ushers (agreed count)',
      role: 'FOH ushers',
      rate: 56.5,
      hours: 3,
      headcount: 4,
      amount: 678,
      gst_included: true,
      soft_flags: ['crew_over_target'],
    },
    {
      ...PACKET_BASE,
      id: 'rider',
      category: 'catering',
      description: 'Band rider (venue staff)',
      role: 'Rider (as staff)',
      amount: 180,
      rate: 180,
      hours: 1,
      headcount: 1,
      rider_as_staff: true,
      gst_included: true,
      soft_flags: [] as string[],
    },
    {
      ...PACKET_BASE,
      id: 'backline',
      category: 'backline',
      description: 'House backline / drum riser',
      amount: 220,
      gst_included: true,
      band_side: false,
      soft_flags: [] as string[],
    },
    {
      ...PACKET_BASE,
      id: 'hire-skip',
      category: 'venue_hire',
      description: 'Venue hire (Harbour deal)',
      amount: 1560,
      hire_renegotiated: false,
      gst_included: true,
      soft_flags: [] as string[],
    },
    {
      ...PACKET_BASE,
      id: 'lighting-skip',
      category: 'lighting',
      description: 'Lighting equipment hire',
      amount: 0,
      lighting_replaced_by_venue_package: false,
      gst_included: true,
      soft_flags: ['lighting_330_keep_separate'],
    },
    {
      ...PACKET_BASE,
      id: 'lone-foh',
      category: 'venue_staff',
      description: 'FOH',
      role: 'FOH',
      rate: 66,
      hours: 4,
      headcount: 1,
      amount: 264,
      gst_included: true,
      // No inbound blocking flag — planner still skips lone FOH.
      soft_flags: [] as string[],
    },
  ],
}

/** Second apply — newer figures for supersede smoke. */
export const SMOKE_ADVANCING_EXTRACT_SUPERSEDE = {
  ...SMOKE_ADVANCING_EXTRACT,
  packets: SMOKE_ADVANCING_EXTRACT.packets.map(packet => {
    if (packet.id === 'av-package') {
      return {
        ...packet,
        email_date: '08/09/26',
        message_id: '<smoke-michael-civic-20260908@queenforever.test>',
        evidence_snippet: 'Michael revised AV package to $1,250 and ushers to 2 × 4h @ $60.',
        amount: 1250,
      }
    }
    if (packet.id === 'ushers') {
      return {
        ...packet,
        email_date: '08/09/26',
        message_id: '<smoke-michael-civic-20260908@queenforever.test>',
        evidence_snippet: 'Michael revised AV package to $1,250 and ushers to 2 × 4h @ $60.',
        rate: 60,
        amount: 480,
      }
    }
    return {
      ...packet,
      email_date: '08/09/26',
      message_id: '<smoke-michael-civic-20260908@queenforever.test>',
    }
  }),
}

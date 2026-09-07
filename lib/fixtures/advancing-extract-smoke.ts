/**
 * Smoke fixture — Michael advancing extract (Portal slice A).
 * High-confidence Civic packet: AV package, crew roles, rider-as-staff,
 * plus lines that must NOT auto-write (hire, lighting, lone FOH).
 */
export const SMOKE_ADVANCING_EXTRACT = {
  version: 'michael-advancing-email-costings-v1',
  venue_short_name: 'Civic',
  email_date: '07/09/26',
  message_id: '<smoke-michael-civic-20260907@queenforever.test>',
  thread_ref: 'thread-smoke-civic-advancing',
  confidence: 'high',
  evidence_snippet: 'Michael confirmed tech package $1,100, 2 ushers + 1 duty tech, rider as staff $180.',
  hire_renegotiated: false,
  lighting_replaced_by_venue_package: false,
  run_group: 'group1',
  soft_flags: [],
  lines: [
    {
      id: 'av-package',
      kind: 'production_av',
      description: 'Venue tech / AV package',
      amount: 1100,
      gst_included: true,
      confidence: 'high',
    },
    {
      id: 'ushers',
      kind: 'venue_staff',
      description: 'Ushers',
      role: 'Ushers',
      rate: 56.5,
      hours: 4,
      headcount: 2,
      confidence: 'high',
    },
    {
      id: 'duty-tech',
      kind: 'venue_staff',
      description: 'Duty technician',
      role: 'Duty technician',
      rate: 78,
      hours: 8,
      headcount: 1,
      confidence: 'high',
    },
    {
      id: 'extra-ushers',
      kind: 'venue_staff',
      description: 'FOH ushers (agreed count)',
      role: 'FOH ushers',
      rate: 56.5,
      hours: 3,
      headcount: 4,
      confidence: 'high',
    },
    {
      id: 'rider',
      kind: 'catering',
      description: 'Band rider (venue staff)',
      role: 'Rider (as staff)',
      amount: 180,
      rate: 180,
      hours: 1,
      headcount: 1,
      rider_as_staff: true,
      confidence: 'high',
    },
    {
      id: 'backline',
      kind: 'backline',
      description: 'House backline / drum riser',
      amount: 220,
      gst_included: true,
      band_side: false,
      confidence: 'high',
    },
    {
      id: 'hire-skip',
      kind: 'venue_hire',
      description: 'Venue hire (Harbour deal)',
      amount: 1560,
      confidence: 'high',
    },
    {
      id: 'lighting-skip',
      kind: 'lighting',
      description: 'Lighting equipment hire',
      amount: 0,
      confidence: 'high',
    },
    {
      id: 'lone-foh',
      kind: 'venue_staff',
      description: 'FOH',
      role: 'FOH',
      rate: 66,
      hours: 4,
      headcount: 1,
      confidence: 'high',
    },
  ],
} as const

/** Second apply — newer figures for supersede smoke. */
export const SMOKE_ADVANCING_EXTRACT_SUPERSEDE = {
  ...SMOKE_ADVANCING_EXTRACT,
  email_date: '08/09/26',
  message_id: '<smoke-michael-civic-20260908@queenforever.test>',
  evidence_snippet: 'Michael revised AV package to $1,250 and ushers to 2 × 4h @ $60.',
  lines: SMOKE_ADVANCING_EXTRACT.lines.map(line => {
    if (line.id === 'av-package') return { ...line, amount: 1250 }
    if (line.id === 'ushers') return { ...line, rate: 60 }
    return line
  }),
}

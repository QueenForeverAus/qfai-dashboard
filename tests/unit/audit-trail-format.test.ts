import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  formatAuditEvent,
  formatAuditMoney,
  formatAuditTrailEvents,
  formatFigureState,
  parseAuditFieldName,
  truncateAuditText,
} from '../../lib/audit-trail-format.ts'
import { auditEntryDiffs, auditLineItemDiffs } from '../../lib/audit-log.ts'
import {
  AUDIT_FIELD_BULK_PAID,
  AUDIT_FIELD_LINE_MOVED,
  AUDIT_FIELD_PAID_ALSO_CONFIRMED,
  AUDIT_FIELD_PAID_RESTORE,
  AUDIT_FIELD_SECTION_CONFIRMED,
} from '../../lib/cost-fields.ts'

const ctx = {
  costFields: [
    {
      id: 'cf-staff',
      field_key: 'venue_staff',
      label: 'Venue Staff',
      show_id: 'show-1',
      entries: [
        { id: 'line-ushers', description: 'Ushers' },
        { id: 'line-rider', description: 'Rider' },
      ],
      line_items: [
        { id: 'role-ushers', role: 'Ushers' },
        { id: 'role-sec', role: 'Security' },
      ],
    },
    {
      id: 'cf-light',
      field_key: 'lighting_hire',
      label: 'Lighting Equipment Hire',
      entries: [{ id: 'line-lx', description: 'Lighting Equipment Hire' }],
    },
    {
      id: 'cf-ground',
      field_key: 'ground_transport',
      label: 'Ground Transport',
    },
  ],
  shows: [{ id: 'show-1', venue_name: 'Broken Hill Civic' }],
}

function row(partial: {
  field_name: string
  old_value?: string | null
  new_value?: string | null
  changed_by_name?: string | null
  table_name?: string
  record_id?: string
  change_type?: string
  changed_at?: string
  id?: string
}) {
  return {
    id: partial.id ?? 'evt-1',
    table_name: partial.table_name ?? 'cost_fields',
    record_id: partial.record_id ?? 'cf-staff',
    field_name: partial.field_name,
    old_value: partial.old_value ?? null,
    new_value: partial.new_value ?? null,
    change_type: partial.change_type ?? 'update',
    changed_at: partial.changed_at ?? '2026-09-07T02:00:00.000Z',
    changed_by_name: partial.changed_by_name === undefined ? 'Michael Chen' : partial.changed_by_name,
  }
}

function sentence(partial: Parameters<typeof row>[0]): string {
  const formatted = formatAuditEvent(row(partial), ctx)
  assert.ok(formatted, `expected a sentence for ${partial.field_name}`)
  return formatted!.sentence
}

test('formatAuditMoney uses $1,200 style without forced cents', () => {
  assert.equal(formatAuditMoney(1200), '$1,200')
  assert.equal(formatAuditMoney(1450.5), '$1,450.50')
})

test('formatFigureState uses plain caps and keeps KNOWN distinct from PAID', () => {
  assert.equal(formatFigureState('known'), 'KNOWN')
  assert.equal(formatFigureState('estimated'), 'ESTIMATE')
  assert.equal(formatFigureState('guess'), 'GUESS')
  assert.notEqual(formatFigureState('known'), 'PAID')
  assert.notEqual(formatFigureState('known'), 'CONFIRMED')
})

test('truncateAuditText shortens long source / notes', () => {
  const long = 'A'.repeat(120)
  assert.equal(truncateAuditText(long).endsWith('…'), true)
  assert.ok(truncateAuditText(long).length <= 80)
})

test('amount edit is a readable from→to sentence', () => {
  assert.equal(
    sentence({
      field_name: 'entries[line-ushers].amount',
      old_value: '1200',
      new_value: '1450',
    }),
    'Michael edited Ushers from $1,200 to $1,450.',
  )
})

test('trigger-prefixed amount rows humanize without showing field keys', () => {
  assert.equal(
    sentence({
      field_name: 'venue_staff.entries[line-ush].amount',
      old_value: '1200',
      new_value: '1450',
      record_id: 'cf-staff',
    }),
    'Michael edited Ushers from $1,200 to $1,450.',
  )
})

test('state change uses ESTIMATE / KNOWN plain caps', () => {
  assert.equal(
    sentence({
      field_name: 'state',
      old_value: 'known',
      new_value: 'estimated',
    }),
    'Michael marked Venue Staff as ESTIMATE (was KNOWN).',
  )
})

test('confirm tick and section roll-up stay distinct from PAID', () => {
  assert.equal(
    sentence({
      field_name: 'entries[line-ushers].confirmed',
      old_value: 'false',
      new_value: 'true',
    }),
    'Michael confirm-ticked Ushers in Venue Staff.',
  )
  assert.equal(
    sentence({
      field_name: AUDIT_FIELD_SECTION_CONFIRMED,
      new_value: 'Gareth confirmed the Venue Staff section (all 8 lines ticked).',
      changed_by_name: 'Gareth',
    }),
    'Gareth confirmed the Venue Staff section (all 8 lines ticked).',
  )
  assert.doesNotMatch(
    sentence({
      field_name: AUDIT_FIELD_SECTION_CONFIRMED,
      new_value: 'Gareth confirmed the Venue Staff section (all 8 lines ticked).',
      changed_by_name: 'Gareth',
    }),
    /PAID/,
  )
})

test('per-line PAID describes the lock', () => {
  assert.equal(
    sentence({
      field_name: 'entries[line-lx].paid',
      old_value: 'false',
      new_value: 'true',
      record_id: 'cf-light',
      changed_by_name: 'Gareth',
    }),
    'Gareth marked Lighting Equipment Hire as PAID (line locked).',
  )
})

test('MARK ALL AS PAID and restore reuse W1.2b sentences', () => {
  assert.match(
    sentence({
      field_name: AUDIT_FIELD_BULK_PAID,
      old_value: '0 of 12 lines already paid',
      new_value: "Gareth marked all lines in Ground Transport as PAID (12 lines; 2 were not confirm-ticked). Gareth's MARK ALL AS PAID also confirmed 2 lines in Ground Transport.",
      record_id: 'cf-ground',
      changed_by_name: 'Gareth',
    }),
    /Gareth marked all lines in Ground Transport as PAID/,
  )
  assert.match(
    sentence({
      field_name: AUDIT_FIELD_BULK_PAID,
      new_value: "Gareth marked all lines in Venue Hire as PAID (2 lines; 1 was not confirm-ticked). Gareth's MARK ALL AS PAID also confirmed 1 line in Venue Hire.",
      record_id: 'cf-ground',
      changed_by_name: 'Gareth',
    }),
    /also confirmed 1 line in Venue Hire/,
  )
  assert.equal(
    sentence({
      field_name: AUDIT_FIELD_PAID_ALSO_CONFIRMED,
      new_value: "Gareth's Pay also confirmed 1 line in Venue Hire.",
      record_id: 'cf-ground',
      changed_by_name: 'Gareth',
    }),
    "Gareth's Pay also confirmed 1 line in Venue Hire.",
  )
  assert.equal(
    sentence({
      field_name: AUDIT_FIELD_PAID_RESTORE,
      new_value: 'Gareth restored prior PAID snapshot for Ground Transport (3 lines unpaid again).',
      record_id: 'cf-ground',
      changed_by_name: 'Gareth',
    }),
    'Gareth restored the prior PAID snapshot for Ground Transport (3 lines unpaid again).',
  )
})

test('rename / notes / GST / add / remove humanize', () => {
  assert.equal(
    sentence({
      field_name: 'entries[line-ushers].description',
      old_value: 'Staff — FOH',
      new_value: 'FOH ushers',
    }),
    'Michael renamed “Staff — FOH” to “FOH ushers”.',
  )
  assert.match(
    sentence({
      field_name: 'entries[line-ushers].notes',
      old_value: 'quote',
      new_value: 'Harbour invoice 12',
    }),
    /updated Notes on Ushers/,
  )
  assert.equal(
    sentence({
      field_name: 'entries[line-ushers].gst_included',
      old_value: 'true',
      new_value: 'false',
    }),
    'Michael set GST on Ushers to excluded (was included).',
  )
  assert.match(
    sentence({
      field_name: 'entries[new-1]',
      new_value: JSON.stringify({ id: 'new-1', description: 'Security', amount: 400 }),
    }),
    /added “Security” \(\$400\) to Venue Staff/,
  )
  assert.match(
    sentence({
      field_name: 'entries[line-rider]',
      old_value: JSON.stringify({ id: 'line-rider', description: 'Rider', amount: 90 }),
      new_value: null,
    }),
    /removed “Rider” from Venue Staff/,
  )
})

test('source text truncates in the sentence', () => {
  const long = 'Harbour sent a very long explanation of the quote that goes on and on for more than eighty characters easily'
  const out = sentence({
    field_name: 'source',
    old_value: 'email',
    new_value: long,
  })
  assert.match(out, /updated Source of Data on Venue Staff/)
  assert.ok(out.includes('…'))
  assert.doesNotMatch(out, /source\./)
})

test('classifier move and run status', () => {
  assert.equal(
    sentence({
      field_name: AUDIT_FIELD_LINE_MOVED,
      old_value: JSON.stringify({ line: 'Ushers', from: 'Venue Staff' }),
      new_value: JSON.stringify({ line: 'Ushers', to: 'Venue Marketing' }),
      changed_by_name: 'Michael',
    }),
    'Michael moved “Ushers” from Venue Staff to Venue Marketing.',
  )
  assert.equal(
    sentence({
      table_name: 'runs',
      field_name: 'status',
      old_value: 'proposed',
      new_value: 'confirmed',
      changed_by_name: 'Gareth',
      record_id: 'run-1',
    }),
    'Gareth changed run status from PROPOSED to BOOKED.',
  )
})

test('show identity and ticket outlook', () => {
  assert.match(
    sentence({
      table_name: 'shows',
      record_id: 'show-1',
      field_name: 'venue_name',
      old_value: 'Old Hall',
      new_value: 'Broken Hill Civic',
      changed_by_name: 'Gareth',
    }),
    /changed venue/,
  )
  assert.equal(
    sentence({
      table_name: 'shows',
      record_id: 'show-1',
      field_name: 'ticket_outlook_status',
      old_value: 'draft',
      new_value: 'confirmed',
      changed_by_name: 'Gareth',
    }),
    'Gareth set Ticket Outlook status on Broken Hill Civic to CONFIRMED (was DRAFT).',
  )
})

test('advancement and show-pack humanize', () => {
  assert.match(
    sentence({
      table_name: 'advancement_items',
      field_name: 'advancement.venue_deal_locked.status',
      old_value: 'pending',
      new_value: 'done',
      changed_by_name: 'Gareth',
    }),
    /marked advancement item “venue deal locked/,
  )
  assert.equal(
    sentence({
      table_name: 'runs',
      field_name: 'show_pack_status',
      old_value: 'draft',
      new_value: 'published',
      changed_by_name: 'Gareth',
    }),
    'Gareth published the show-pack.',
  )
})

test('does not invent who for old rows without an actor', () => {
  const out = sentence({
    field_name: 'state',
    old_value: 'guess',
    new_value: 'estimated',
    changed_by_name: null,
  })
  assert.equal(out, 'Marked Venue Staff as ESTIMATE (was GUESS).')
  assert.doesNotMatch(out, /System|Someone|Unknown/)
})

test('skips seed inserts with no actor and updated_at noise', () => {
  assert.equal(
    formatAuditEvent(row({
      field_name: 'venue_hire.value',
      new_value: '0',
      change_type: 'insert',
      changed_by_name: null,
    }), ctx),
    null,
  )
  assert.equal(
    formatAuditEvent(row({ field_name: 'updated_at', old_value: 'a', new_value: 'b' }), ctx),
    null,
  )
})

test('dedupes section total when a line amount exists for the same edit', () => {
  const events = formatAuditTrailEvents([
    row({
      id: 'a',
      field_name: 'entries[line-ushers].amount',
      old_value: '1200',
      new_value: '1450',
    }),
    row({
      id: 'b',
      field_name: 'value',
      old_value: '1200',
      new_value: '1450',
    }),
  ], ctx)
  assert.equal(events.length, 1)
  assert.equal(events[0].sentence, 'Michael edited Ushers from $1,200 to $1,450.')
})

test('dedupes raw entries JSON next to MARK ALL AS PAID', () => {
  const events = formatAuditTrailEvents([
    row({
      id: 'n',
      field_name: AUDIT_FIELD_BULK_PAID,
      new_value: 'Gareth marked all lines in Ground Transport as PAID (12 lines; 2 were not confirm-ticked).',
      record_id: 'cf-ground',
      changed_by_name: 'Gareth',
    }),
    row({
      id: 'e',
      field_name: 'entries',
      record_id: 'cf-ground',
      old_value: JSON.stringify([{ id: '1', description: 'Van', amount: 10, paid: false, confirmed: false }]),
      new_value: JSON.stringify([{ id: '1', description: 'Van', amount: 10, paid: true, confirmed: true }]),
      changed_by_name: 'Gareth',
    }),
  ], ctx)
  assert.equal(events.length, 1)
  assert.match(events[0].sentence, /marked all lines in Ground Transport as PAID/)
})

test('trigger whole-entry JSON (paid/gst fallback) becomes a sentence, not a field key', () => {
  const out = sentence({
    field_name: 'venue_hire.entries[6ac5cd1f]',
    old_value: JSON.stringify({
      id: '6ac5cd1f-5d87-46e7-ad51-4dc40b030dee',
      description: 'Venue Hire',
      amount: 1000,
      notes: '',
      gst_included: true,
      confirmed: true,
      paid: false,
    }),
    new_value: JSON.stringify({
      id: '6ac5cd1f-5d87-46e7-ad51-4dc40b030dee',
      description: 'Venue Hire',
      amount: 1451,
      notes: '',
      gst_included: true,
      confirmed: true,
      paid: false,
    }),
    changed_by_name: 'Test Admin',
  })
  assert.equal(out, 'Test edited Venue Hire from $1,000 to $1,451.')
  assert.doesNotMatch(out, /entries\[|updated venue hire/i)
})

test('paid_snapshot-only trigger dumps are hidden', () => {
  const ev = formatAuditEvent(row({
    field_name: 'venue_hire.entries[6ac5cd1f]',
    old_value: JSON.stringify({
      id: '6ac5cd1f', description: 'Venue Hire', amount: 100, paid: true, confirmed: true,
      paid_snapshot: null,
    }),
    new_value: JSON.stringify({
      id: '6ac5cd1f', description: 'Venue Hire', amount: 100, paid: true, confirmed: true,
      paid_snapshot: { paid: false, paid_at: null, confirmed: false },
    }),
  }), ctx)
  assert.equal(ev, null)
})

test('parseAuditFieldName understands trigger and writeAuditLog names', () => {
  assert.deepEqual(parseAuditFieldName('state'), { kind: 'state' })
  assert.equal(parseAuditFieldName('flights.state').kind, 'state')
  assert.equal(parseAuditFieldName('flights.state').fieldKey, 'flights')
  assert.equal(parseAuditFieldName('venue_hire.entries[abc].amount').entryField, 'amount')
  assert.equal(parseAuditFieldName('line_items[role-1].paid').kind, 'line_item')
  assert.equal(parseAuditFieldName('venue_staff.line_items[role-1].confirmed').entryField, 'confirmed')
  assert.equal(parseAuditFieldName('shows.capacity').showField, 'capacity')
  assert.equal(parseAuditFieldName('runs.status').runField, 'status')
})

test('planned-role confirm / PAID sentences stay distinct from figure-source KNOWN', () => {
  assert.equal(
    sentence({
      field_name: 'line_items[role-ushers].confirmed',
      old_value: 'false',
      new_value: 'true',
    }),
    'Michael confirm-ticked Ushers in Venue Staff.',
  )
  assert.equal(
    sentence({
      field_name: 'line_items[role-sec].paid',
      old_value: 'false',
      new_value: 'true',
    }),
    'Michael marked Security as PAID (role locked).',
  )
  assert.equal(
    sentence({
      field_name: 'line_items[role-sec].paid',
      old_value: 'true',
      new_value: 'false',
    }),
    'Michael marked Security unpaid (role unlocked).',
  )
  assert.doesNotMatch(
    sentence({
      field_name: 'line_items[role-ushers].confirmed',
      old_value: 'false',
      new_value: 'true',
    }),
    /PAID|KNOWN/,
  )
})

test('auditLineItemDiffs writes per-role confirm / paid / add', () => {
  const diffs = auditLineItemDiffs(
    'cost_fields',
    'cf-staff',
    'run-1',
    [{ id: 'role-ushers', role: 'Ushers', rate: 50, hours: 3, headcount: 2, confirmed: false, paid: false }],
    [
      { id: 'role-ushers', role: 'Ushers', rate: 50, hours: 3, headcount: 2, confirmed: true, paid: true },
      { id: 'role-new', role: 'Security', rate: 70, hours: 5, headcount: 1, confirmed: false, paid: false },
    ],
  )
  const names = diffs.map(d => d.field_name)
  assert.ok(names.includes('line_items[role-ushers].confirmed'))
  assert.ok(names.includes('line_items[role-ushers].paid'))
  assert.ok(names.includes('line_items[role-new]'))
  assert.ok(!names.includes('line_items'))
})

test('auditEntryDiffs writes per-line amount / GST / paid / add', () => {
  const diffs = auditEntryDiffs(
    'cost_fields',
    'cf-staff',
    'run-1',
    [{ id: 'line-ushers', description: 'Ushers', amount: 1200, gst_included: true, confirmed: true, paid: false, notes: '' }],
    [
      { id: 'line-ushers', description: 'Ushers', amount: 1450, gst_included: false, confirmed: true, paid: true, notes: '' },
      { id: 'line-new', description: 'Security', amount: 400, gst_included: true, confirmed: false, paid: false, notes: '' },
    ],
  )
  const names = diffs.map(d => d.field_name)
  assert.ok(names.includes('entries[line-ushers].amount'))
  assert.ok(names.includes('entries[line-ushers].gst_included'))
  assert.ok(names.includes('entries[line-ushers].paid'))
  assert.ok(names.includes('entries[line-new]'))
  assert.ok(!names.includes('entries'))
})

test('Finalise Costing narrative is a plain sentence', () => {
  assert.equal(
    sentence({
      table_name: 'run_settlements',
      record_id: 'run-1',
      field_name: 'Finalise Costing',
      old_value: 'live Run Costing',
      new_value: 'Gareth finalised Run Costing for R12 (snapshot locked, 12 sections). Early Finalise — snapshot still locked.',
    }),
    'Gareth finalised Run Costing for R12 (snapshot locked, 12 sections). Early Finalise — snapshot still locked.',
  )
})

test('Band Cost added narrative is a plain sentence', () => {
  assert.equal(
    sentence({
      table_name: 'band_cost_lines',
      record_id: 'bc-1',
      field_name: 'Band Cost added',
      new_value: 'Gareth added band cost Uber $45.00 on Concourse (run R12).',
    }),
    'Gareth added band cost Uber $45.00 on Concourse (run R12).',
  )
})

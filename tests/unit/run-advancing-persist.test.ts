import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ensureAdvancingWorkspaceForBookedRun } from '../../lib/run-advancing-persist.ts'

const VENUE_HIRE = {
  id: 'cf-hire',
  run_id: 'run-r12',
  show_id: 'show-1',
  category: 'Venue Costs',
  field_key: 'venue_hire',
  label: 'Venue Hire',
  value: 1451,
  state: 'guess',
  source: 'Draft',
  entries: [{ id: 'e1', description: 'Hire', notes: '', amount: 1451, gst_included: true, confirmed: true, paid: false }],
  line_items: [],
}

const SHOW = {
  id: 'show-1',
  ticket_price: 89,
  capacity: 400,
  capacity_bands: [{ seats: 400, label: 'Full' }],
  booking_fee_per_payer: 4.5,
  cc_fee_pct: 1.5,
}

const ACTIVE_WORKSPACE = {
  id: 'ws-active',
  run_id: 'run-r12',
  copied_at: '2026-09-01T00:00:00.000Z',
  copied_by: null,
  archived_at: null,
  archived_by: null,
  shows_chrome: [{ show_id: 'show-1', ticket_price: 89 }],
  travel_blocks: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
}

const NEW_WORKSPACE = {
  id: 'ws-new',
  run_id: 'run-r12',
  copied_at: '2026-09-12T00:00:00.000Z',
  copied_by: null,
  archived_at: null,
  archived_by: null,
  shows_chrome: [],
  travel_blocks: null,
  created_at: '2026-09-12T00:00:00.000Z',
  updated_at: '2026-09-12T00:00:00.000Z',
}

type Write = { table: string; op: string; payload?: unknown }

function fakeAdvancingAdmin(opts: {
  activeWorkspace?: typeof ACTIVE_WORKSPACE | null
  costFields?: typeof VENUE_HIRE[]
  shows?: typeof SHOW[]
  writes: Write[]
}) {
  const resultFor = (table: string, op: string) => {
    if (table === 'run_advancing_workspaces' && op === 'select') {
      return { data: opts.activeWorkspace ?? null, error: null }
    }
    if (table === 'run_advancing_workspaces' && op === 'insert') {
      return { data: { ...NEW_WORKSPACE, shows_chrome: [] }, error: null }
    }
    if (table === 'cost_fields') return { data: opts.costFields ?? [VENUE_HIRE], error: null }
    if (table === 'shows') return { data: opts.shows ?? [SHOW], error: null }
    if (table === 'advancing_cost_fields') return { data: null, error: null }
    return { data: null, error: null }
  }

  return {
    from(table: string) {
      let op = 'select'
      const api: Record<string, unknown> = {}
      const chain = () => api
      api.select = () => {
        op = op === 'insert' ? 'insert' : 'select'
        return api
      }
      api.eq = chain
      api.is = chain
      api.order = chain
      api.limit = chain
      api.maybeSingle = async () => resultFor(table, 'select')
      api.single = async () => resultFor(table, op)
      api.insert = (payload: unknown) => {
        op = 'insert'
        opts.writes.push({ table, op: 'insert', payload })
        return api
      }
      api.update = (payload: unknown) => {
        op = 'update'
        opts.writes.push({ table, op: 'update', payload })
        return api
      }
      api.delete = () => {
        op = 'delete'
        opts.writes.push({ table, op: 'delete' })
        return api
      }
      Object.assign(api, {
        then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
          Promise.resolve(resultFor(table, op)).then(resolve, reject),
      })
      return api
    },
  }
}

async function ensure(opts: {
  status: string
  activeWorkspace?: typeof ACTIVE_WORKSPACE | null
  writes?: Write[]
}) {
  const writes = opts.writes ?? []
  const admin = fakeAdvancingAdmin({
    activeWorkspace: opts.activeWorkspace === undefined ? null : opts.activeWorkspace,
    writes,
  })
  const result = await ensureAdvancingWorkspaceForBookedRun({
    admin: admin as never,
    runId: 'run-r12',
    runCode: 'R12',
    status: opts.status,
  })
  return { result, writes }
}

describe('ensureAdvancingWorkspaceForBookedRun', () => {
  it('confirmed + no workspace → copies Costings into a new Advancing workspace', async () => {
    const { result, writes } = await ensure({ status: 'confirmed', activeWorkspace: null })
    assert.equal(result.copied, true)
    assert.equal(result.workspace?.id, 'ws-new')
    const wsInsert = writes.find(w => w.table === 'run_advancing_workspaces' && w.op === 'insert')
    assert.ok(wsInsert)
    const payload = wsInsert.payload as { run_id: string; shows_chrome: Array<{ show_id: string; ticket_price: number }> }
    assert.equal(payload.run_id, 'run-r12')
    assert.equal(payload.shows_chrome[0]?.show_id, 'show-1')
    assert.equal(payload.shows_chrome[0]?.ticket_price, 89)
    const fieldInsert = writes.find(w => w.table === 'advancing_cost_fields' && w.op === 'insert')
    assert.ok(fieldInsert)
    const copies = fieldInsert.payload as Array<{ field_key: string; value: number; workspace_id: string }>
    assert.equal(copies.length, 1)
    assert.equal(copies[0].field_key, 'venue_hire')
    assert.equal(copies[0].value, 1451)
    assert.equal(copies[0].workspace_id, 'ws-new')
    assert.equal(writes.some(w => w.table === 'advancing_cost_fields' && w.op !== 'insert'), false)
    assert.equal(writes.some(w => w.op === 'delete'), false)
  })

  it('confirmed + active workspace → no-op (never overwrite or wipe advancing_cost_fields)', async () => {
    const { result, writes } = await ensure({
      status: 'confirmed',
      activeWorkspace: ACTIVE_WORKSPACE,
    })
    assert.equal(result.copied, false)
    assert.equal(result.workspace?.id, 'ws-active')
    assert.deepEqual(writes, [])
  })

  it('proposed → no-op even when no workspace exists', async () => {
    const { result, writes } = await ensure({ status: 'proposed', activeWorkspace: null })
    assert.equal(result.copied, false)
    assert.equal(result.workspace, null)
    assert.deepEqual(writes, [])
  })

  it('archived workspace + confirmed → creates a new active workspace (does not revive/wipe the archive)', async () => {
    // loadActiveAdvancingWorkspace only returns archived_at IS NULL rows,
    // so an archived-only run looks like "no active workspace".
    const { result, writes } = await ensure({ status: 'confirmed', activeWorkspace: null })
    assert.equal(result.copied, true)
    assert.equal(result.workspace?.id, 'ws-new')
    assert.ok(writes.some(w => w.table === 'run_advancing_workspaces' && w.op === 'insert'))
    assert.equal(writes.some(w => w.table === 'run_advancing_workspaces' && w.op === 'update'), false)
    assert.equal(writes.some(w => w.op === 'delete'), false)
  })
})

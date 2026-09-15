import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  computeDanielChampagne,
  computeMusicRights,
  DANIEL_CHAMPAGNE_DEFAULT_PER_TICKET,
  modelledTickets,
} from '../../lib/show-auto-calc.ts'

const show = {
  capacity: 400,
  ticket_price: 80,
  sell_through_pct: 75,
}

describe('Music Rights + Daniel Champagne AUTO-CALC', () => {
  it('uses tickets_sold when set, else capacity × sell-through', () => {
    assert.equal(modelledTickets({ ...show, tickets_sold: 210 }), 210)
    assert.equal(modelledTickets(show), 300)
    assert.equal(modelledTickets({ capacity: null, ticket_price: 80 }), 0)
  })

  it('Music Rights = Factors % × tickets × ticket_price; empty % is FIGURES_NEEDED', () => {
    const needed = computeMusicRights({ show, musicRightsPct: null })
    assert.equal(needed.state, 'pending')
    assert.equal(needed.amount, null)
    assert.equal(needed.tickets, 300)
    assert.equal(needed.base, 24000)

    const calc = computeMusicRights({ show, musicRightsPct: 2 })
    assert.equal(calc.state, 'auto_calc')
    assert.equal(calc.amount, 480)
    assert.equal(calc.base, 24000)
  })

  it('Daniel Champagne = tickets × Factors $/ticket, default $1+GST', () => {
    const def = computeDanielChampagne({ show })
    assert.equal(def.perTicket, DANIEL_CHAMPAGNE_DEFAULT_PER_TICKET)
    assert.equal(def.perTicket, 1.10)
    assert.equal(def.state, 'auto_calc')
    assert.equal(def.amount, 330)

    const custom = computeDanielChampagne({ show, perTicket: 1.5, sellThroughPct: 50 })
    assert.equal(custom.tickets, 200)
    assert.equal(custom.amount, 300)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { holding, tx, D } from '../test/factories'

const db = vi.hoisted(() => ({
  holding: { findMany: vi.fn() },
  transaction: { findMany: vi.fn() },
}))
vi.mock('./prisma', () => ({ default: db }))

import { buildLots, computeGains, isTaxableAccount } from './gains'

describe('buildLots', () => {
  it('forms an opening lot for shares not covered by transactions and sells FIFO', () => {
    const h = holding({ quantity: 60, openingCostPerShare: 100, openingAcquiredAt: D('2020-01-01') })
    const r = buildLots(h, [tx(h.id, 'BUY', 10, 150, '2025-06-01'), tx(h.id, 'SELL', 50, 200, '2026-03-01')])
    expect(r.realized).toHaveLength(1)
    expect(r.realized[0]).toMatchObject({ qty: 50, proceeds: 10000, cost: 5000, gain: 5000, term: 'LONG' })
    expect(r.lots.map((l) => [l.qty, l.costPerShare])).toEqual([
      [50, 100],
      [10, 150],
    ])
  })

  it('splits a sale across lots in acquisition order', () => {
    const h = holding({ quantity: 5 })
    const r = buildLots(h, [tx(h.id, 'BUY', 5, 10, '2024-01-01'), tx(h.id, 'BUY', 5, 20, '2025-12-01'), tx(h.id, 'SELL', 5, 30, '2026-06-01')])
    expect(r.realized.map((e) => [e.qty, e.gain, e.term])).toEqual([[5, 100, 'LONG']])
    expect(r.lots).toEqual([expect.objectContaining({ qty: 5, costPerShare: 20 })])
  })

  it('treats exactly one year as short-term and longer as long-term', () => {
    const h = holding({ quantity: 0 })
    expect(buildLots(h, [tx(h.id, 'BUY', 5, 10, '2025-03-01'), tx(h.id, 'SELL', 5, 12, '2026-03-01')]).realized[0].term).toBe('SHORT')
    expect(buildLots(h, [tx(h.id, 'BUY', 5, 10, '2025-03-01'), tx(h.id, 'SELL', 5, 12, '2026-03-02')]).realized[0].term).toBe('LONG')
  })

  it('reports unknown basis and term when the opening lot has no cost', () => {
    const h = holding({ quantity: 6 })
    const r = buildLots(h, [tx(h.id, 'SELL', 4, 50, '2026-01-10')])
    expect(r.realized[0]).toMatchObject({ gain: null, cost: null, term: 'UNKNOWN', proceeds: 200 })
    expect(r.lots[0].qty).toBe(6)
  })

  it('records proceeds without basis when selling more than the known lots', () => {
    const h = holding({ quantity: 0 })
    // Buy 2, sell 5: 2 matched, 3 unmatched (quantity edited to 0 elsewhere).
    const r = buildLots({ ...h, quantity: -3 }, [tx(h.id, 'BUY', 2, 10, '2026-01-01'), tx(h.id, 'SELL', 5, 12, '2026-02-01')])
    expect(r.realized.map((e) => [e.qty, e.gain])).toEqual([
      [2, 4],
      [3, null],
    ])
  })

  it('trims the oldest lots when quantity is edited below the transactions', () => {
    const h = holding({ quantity: 3, openingCostPerShare: 1, openingAcquiredAt: D('2024-01-01') })
    const r = buildLots(h, [tx(h.id, 'BUY', 5, 20, '2025-01-01')])
    expect(r.realized).toHaveLength(0)
    expect(r.lots.map((l) => [l.qty, l.costPerShare])).toEqual([[3, 20]])
  })
})

describe('computeGains', () => {
  const now = D('2026-09-16')
  beforeEach(() => vi.clearAllMocks())

  it('computes unrealized gains split by holding period and basis coverage', async () => {
    const nvda = holding({ symbol: 'NVDA', quantity: 70, price: 178.3, openingCostPerShare: 92.4, openingAcquiredAt: D('2024-10-17') })
    const partial = holding({ symbol: 'VXUS', quantity: 50, price: 72 })
    db.holding.findMany.mockResolvedValue([nvda, partial])
    db.transaction.findMany.mockResolvedValue([tx(nvda.id, 'BUY', 10, 120, '2025-11-20'), tx(partial.id, 'BUY', 10, 60, '2026-01-02')])

    const g = await computeGains('u1', now)
    const n = g.holdings.find((x) => x.symbol === 'NVDA')!
    expect(n.costBasis).toBeCloseTo(60 * 92.4 + 1200, 8)
    expect(n.unrealized).toBeCloseTo(70 * 178.3 - 6744, 8)
    expect(n.longTermUnrealized).toBeCloseTo(60 * (178.3 - 92.4), 8)
    expect(n.shortTermUnrealized).toBeCloseTo(10 * (178.3 - 120), 8)
    expect(n.basisStatus).toBe('FULL')

    const v = g.holdings.find((x) => x.symbol === 'VXUS')!
    expect(v.basisStatus).toBe('PARTIAL')
    expect(v.knownQty).toBe(10)
    expect(v.openingQty).toBe(40)
    expect(v.unrealized).toBeCloseTo(120, 8)
  })

  it('suggests harvesting only meaningful losses in taxable accounts', async () => {
    const eth = holding({ symbol: 'ETH', category: 'CRYPTO', quantity: 6.2, price: 4120, openingCostPerShare: 4700, openingAcquiredAt: D('2026-02-28') })
    const roth = holding({ symbol: 'ARKK', accountType: 'ROTH_IRA', quantity: 100, price: 40, openingCostPerShare: 60, openingAcquiredAt: D('2024-01-01') })
    const tiny = holding({ symbol: 'TINY', quantity: 10, price: 95, openingCostPerShare: 100, openingAcquiredAt: D('2024-01-01') }) // −$50
    const shallow = holding({ symbol: 'BIG', quantity: 1000, price: 98, openingCostPerShare: 100, openingAcquiredAt: D('2024-01-01') }) // −$2,000 but −2%
    db.holding.findMany.mockResolvedValue([eth, roth, tiny, shallow])
    db.transaction.findMany.mockResolvedValue([])

    const g = await computeGains('u1', now)
    expect(g.harvest.map((h) => h.symbol)).toEqual(['ETH'])
    expect(g.harvest[0]).toMatchObject({ category: 'CRYPTO', washSaleRisk: null })
    expect(g.harvest[0].harvestableLoss).toBeCloseTo(-3596, 6)
    expect(g.harvest[0].shortTermLoss).toBeCloseTo(-3596, 6)
  })

  it('warns about wash sales from recent buys in any account or upcoming auto-invest', async () => {
    const taxable = holding({ symbol: 'VTI', quantity: 10, price: 200, openingCostPerShare: 250, openingAcquiredAt: D('2024-01-01') })
    const ira = holding({ symbol: 'VTI', accountType: 'TRADITIONAL_IRA', quantity: 1, price: 200 })
    const auto = holding({ symbol: 'QQQ', quantity: 10, price: 400, openingCostPerShare: 500, openingAcquiredAt: D('2024-01-01'), autoAmount: 100, autoFrequency: 'MONTHLY', autoNextAt: D('2026-10-01') })
    db.holding.findMany.mockResolvedValue([taxable, ira, auto])
    db.transaction.findMany.mockResolvedValue([tx(ira.id, 'BUY', 1, 200, '2026-09-01')])

    const g = await computeGains('u1', now)
    expect(g.harvest.find((h) => h.symbol === 'VTI')!.washSaleRisk).toMatch(/bought VTI on 2026-09-01/)
    expect(g.harvest.find((h) => h.symbol === 'QQQ')!.washSaleRisk).toMatch(/auto-invest/)
  })

  it('treats taxable and "other" accounts as taxable', () => {
    expect(isTaxableAccount('TAXABLE')).toBe(true)
    expect(isTaxableAccount('OTHER')).toBe(true)
    expect(isTaxableAccount('ROTH_IRA')).toBe(false)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { holding, liability, D } from '../test/factories'

const db = vi.hoisted(() => ({
  holding: { findMany: vi.fn() },
  liability: { findMany: vi.fn() },
  netWorthSnapshot: { upsert: vi.fn() },
}))
vi.mock('./prisma', () => ({ default: db }))

const market = vi.hoisted(() => ({
  history: {} as Record<string, { date: string; price: number }[]>,
  intraday: {} as Record<string, { t: number; price: number }[]>,
}))
vi.mock('./prices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./prices')>()),
  getHistory: vi.fn(async (symbol: string) => market.history[symbol] ?? []),
  getIntraday: vi.fn(async (symbol: string) => market.intraday[symbol] ?? []),
}))

import { computeBalances, backfillHistory, intradayNetWorth } from './networth'
import { estimateValue } from './assets'

beforeEach(() => {
  vi.clearAllMocks()
  market.history = {}
  market.intraday = {}
})

describe('computeBalances', () => {
  it('subtracts debts and excludes property from investable assets', async () => {
    db.holding.findMany.mockResolvedValue([
      holding({ quantity: 10, price: 100 }),
      holding({ category: 'REAL_ESTATE', quantity: 1, price: 500000 }),
      holding({ category: 'VEHICLE', quantity: 1, price: 20000 }),
    ])
    db.liability.findMany.mockResolvedValue([liability({ balance: 300000 }), liability({ balance: 15000 })])
    expect(await computeBalances('u1')).toEqual({ assets: 521000, liabilities: 315000, netWorth: 206000, investable: 1000 })
  })
})

describe('backfillHistory', () => {
  it('writes one snapshot per market date: priced holdings + flat manual assets − debts + estimates', async () => {
    const house = holding({ category: 'REAL_ESTATE', quantity: 1, appreciationPct: 4, openingCostPerShare: 300000, openingAcquiredAt: D('2020-01-01') })
    db.holding.findMany.mockResolvedValue([
      holding({ symbol: 'AAA', quantity: 10, price: 120 }),
      holding({ symbol: 'CASH', category: 'CASH', quantity: 1, price: 5000 }),
      holding({ symbol: 'NOHIST', quantity: 2, price: 50 }), // no history → flat
      house,
    ])
    db.liability.findMany.mockResolvedValue([liability({ balance: 1000 })])
    market.history.AAA = [
      { date: '2026-09-14', price: 100 },
      { date: '2026-09-15', price: 110 },
    ]

    expect(await backfillHistory('u1', 365)).toBe(2)
    const writes = db.netWorthSnapshot.upsert.mock.calls.map(([arg]) => [arg.create.date.toISOString().slice(0, 10), arg.create.netWorth])
    const flat = 5000 + 100 - 1000
    expect(writes[0][0]).toBe('2026-09-14')
    expect(writes[0][1]).toBeCloseTo(flat + 1000 + estimateValue(300000, D('2020-01-01'), 4, D('2026-09-14')), 6)
    expect(writes[1][1]).toBeCloseTo(flat + 1100 + estimateValue(300000, D('2020-01-01'), 4, D('2026-09-15')), 6)
  })

  it('does nothing without holdings', async () => {
    db.holding.findMany.mockResolvedValue([])
    db.liability.findMany.mockResolvedValue([])
    expect(await backfillHistory('u1')).toBe(0)
    expect(db.netWorthSnapshot.upsert).not.toHaveBeenCalled()
  })
})

describe('intradayNetWorth', () => {
  const now = D('2026-09-16T20:00:00Z')
  const bar = (iso: string, price: number) => ({ t: D(iso).getTime(), price })

  it('starts at the previous-close baseline and ends at live net worth', async () => {
    const stock = holding({ symbol: 'AAA', quantity: 10, price: 105, prevClose: 100 })
    const coin = holding({ symbol: 'BTC', category: 'CRYPTO', quantity: 1, price: 900, prevClose: 1000 })
    const cash = holding({ symbol: 'CASH', category: 'CASH', quantity: 1, price: 2000, prevClose: 2000 })
    db.holding.findMany.mockResolvedValue([stock, coin, cash])
    db.liability.findMany.mockResolvedValue([liability({ balance: 500 })])
    market.intraday.AAA = [bar('2026-09-16T13:30:00Z', 101), bar('2026-09-16T19:55:00Z', 104)]
    market.intraday.BTC = [bar('2026-09-15T20:05:00Z', 1000), bar('2026-09-16T12:00:00Z', 950)]

    const pts = await intradayNetWorth('u1', now)
    expect(pts[0].netWorth).toBe(10 * 100 + 1000 + 2000 - 500)
    expect(pts[pts.length - 1]).toEqual({ t: now.getTime(), netWorth: 10 * 105 + 900 + 2000 - 500 })
    // Times are sorted and on a 5-minute grid (except the live end point).
    pts.slice(0, -1).forEach((p, i) => {
      expect(p.t % (5 * 60 * 1000)).toBe(0)
      if (i) expect(p.t).toBeGreaterThan(pts[i - 1].t)
    })
    // At noon BTC has moved to 950 while the stock (session not open) sits at its previous close.
    const noon = pts.find((p) => p.t === D('2026-09-16T12:00:00Z').getTime())!
    expect(noon.netWorth).toBe(10 * 100 + 950 + 2000 - 500)
    // After the open the stock follows its bars.
    const open = pts.find((p) => p.t === D('2026-09-16T13:30:00Z').getTime())!
    expect(open.netWorth).toBe(10 * 101 + 950 + 2000 - 500)
  })

  it('moves assets without intraday data linearly from previous close to current value', async () => {
    db.holding.findMany.mockResolvedValue([holding({ symbol: 'NODATA', quantity: 1, price: 200, prevClose: 100 })])
    db.liability.findMany.mockResolvedValue([])
    const pts = await intradayNetWorth('u1', now)
    expect(pts).toHaveLength(2) // 24h window, just the endpoints
    expect(pts[0]).toEqual({ t: now.getTime() - 86_400_000, netWorth: 100 })
    expect(pts[1].netWorth).toBe(200)
  })
})

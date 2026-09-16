import { describe, it, expect, vi, beforeEach } from 'vitest'
import { holding, tx, D } from '../test/factories'

const db = vi.hoisted(() => ({
  holding: { findMany: vi.fn() },
  transaction: { findMany: vi.fn() },
}))
vi.mock('./prisma', () => ({ default: db }))

const history = vi.hoisted(() => ({ series: {} as Record<string, { date: string; price: number }[]> }))
vi.mock('./prices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./prices')>()),
  getHistory: vi.fn(async (symbol: string) => history.series[symbol] ?? []),
}))

import { xirr, computePerformance } from './performance'

describe('xirr', () => {
  it('solves known cash flows', () => {
    expect(xirr([{ date: D('2025-01-01'), amount: -1000 }, { date: D('2026-01-01'), amount: 1100 }])!).toBeCloseTo(0.1, 8)
    expect(xirr([{ date: D('2025-01-01'), amount: -1000 }, { date: D('2026-01-01'), amount: 800 }])!).toBeCloseTo(-0.2, 8)
  })

  it('needs money in and out', () => {
    expect(xirr([{ date: D('2025-01-01'), amount: -1 }])).toBeNull()
    expect(xirr([{ date: D('2025-01-01'), amount: -1 }, { date: D('2026-01-01'), amount: -1 }])).toBeNull()
  })
})

describe('computePerformance', () => {
  const now = D('2026-09-16T12:00:00Z')
  beforeEach(() => {
    vi.clearAllMocks()
    history.series = {
      SPY: [
        { date: '2026-03-16', price: 400 },
        { date: '2026-06-16', price: 400 },
        { date: '2026-09-16', price: 440 },
      ],
    }
  })

  it('keeps deposits out of the time-weighted return but not the money-weighted one', async () => {
    // Own 10 shares; buy 10 more at $100 in June; price rises 10% afterwards.
    const h = holding({ symbol: 'AAA', quantity: 20, price: 110 })
    db.holding.findMany.mockResolvedValue([h])
    db.transaction.findMany.mockResolvedValue([tx(h.id, 'BUY', 10, 100, '2026-06-16')])
    history.series.AAA = [
      { date: '2026-03-16', price: 100 },
      { date: '2026-06-16', price: 100 },
      { date: '2026-09-16', price: 110 },
    ]

    const r = await computePerformance('u1', 'SPY', now)
    const y1 = r.periods.find((p) => p.period === '1Y')!
    expect(y1.twr).toBeCloseTo(0.1, 10)
    expect(y1.benchmark).toBeCloseTo(0.1, 10)
    expect(y1.startValue).toBe(1000)
    expect(y1.endValue).toBe(2200)
    expect(y1.netContributions).toBe(1000)
    expect(y1.gain).toBe(200)
    // −1000, −1000 at the midpoint, +2200 at the end: v² + v − 2.2 = 0 per half.
    const v = (-1 + Math.sqrt(1 + 4 * 2.2)) / 2
    expect(y1.mwr!).toBeCloseTo(v * v - 1, 4)

    // 1M starts after the deposit: no flows, so both returns are the 10% move.
    const m1 = r.periods.find((p) => p.period === '1M')!
    expect(m1.startDate).toBe('2026-06-16')
    expect(m1.twr).toBeCloseTo(0.1, 10)
    expect(m1.mwr!).toBeCloseTo(0.1, 6)
    expect(m1.netContributions).toBe(0)
  })

  it('values holdings whose history starts later at their first price', async () => {
    const a = holding({ symbol: 'AAA', quantity: 10 })
    const b = holding({ symbol: 'BBB', quantity: 1 })
    db.holding.findMany.mockResolvedValue([a, b])
    db.transaction.findMany.mockResolvedValue([])
    history.series.AAA = [
      { date: '2026-03-16', price: 100 },
      { date: '2026-09-16', price: 100 },
    ]
    history.series.BBB = [{ date: '2026-09-16', price: 50 }]

    const r = await computePerformance('u1', 'SPY', now)
    const y1 = r.periods.find((p) => p.period === '1Y')!
    expect(y1.startValue).toBe(1050) // not 1000
    expect(y1.twr).toBeCloseTo(0, 10)
    expect(y1.gain).toBeCloseTo(0, 10)
  })

  it('lists holdings without price history and ignores non-market assets', async () => {
    const a = holding({ symbol: 'AAA', quantity: 1 })
    const ghost = holding({ symbol: 'GHOST', quantity: 1 })
    const cash = holding({ symbol: 'CASH', category: 'CASH', quantity: 1, price: 5000 })
    db.holding.findMany.mockResolvedValue([a, ghost, cash])
    db.transaction.findMany.mockResolvedValue([])
    history.series.AAA = [
      { date: '2026-03-16', price: 10 },
      { date: '2026-09-16', price: 12 },
    ]
    const r = await computePerformance('u1', 'SPY', now)
    expect(r.included).toBe(1)
    expect(r.excluded).toEqual(['GHOST'])
    expect(r.periods.find((p) => p.period === '1Y')!.twr).toBeCloseTo(0.2, 10)
  })

  it('falls back to SPY for unknown benchmarks and returns empty periods without data', async () => {
    db.holding.findMany.mockResolvedValue([])
    db.transaction.findMany.mockResolvedValue([])
    history.series = {}
    const r = await computePerformance('u1', 'NOPE', now)
    expect(r.benchmark.symbol).toBe('SPY')
    expect(r.periods).toEqual([])
  })
})

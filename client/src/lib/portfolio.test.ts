import { describe, it, expect } from 'vitest'
import {
  fmtUSD,
  fmtCompact,
  signedUSD,
  signedPct,
  computeTotals,
  computeTaxBreakdown,
  computeBrokerageBreakdown,
  computeAllocationSlices,
  computeProjection,
  investableTotal,
  isEstimatedAsset,
  totalDebt,
} from './portfolio'
import type { Holding, Liability } from './portfolio'

function holding(p: Partial<Holding>): Holding {
  return {
    id: Math.random().toString(36).slice(2),
    symbol: 'X',
    name: '',
    category: 'STOCKS',
    accountType: 'TAXABLE',
    institution: '',
    quantity: 1,
    price: 0,
    prevClose: 0,
    autoAmount: null,
    autoFrequency: null,
    autoNextAt: null,
    openingCostPerShare: null,
    openingAcquiredAt: null,
    providerId: null,
    appreciationPct: null,
    ...p,
  }
}

describe('formatters', () => {
  it('formats dollars with a real minus sign', () => {
    expect(fmtUSD(1234.5)).toBe('$1,235')
    expect(fmtUSD(-1234)).toBe('−$1,234')
    expect(fmtUSD(0.000012, 6)).toBe('$0.000012')
    expect(fmtUSD(-0.2)).toBe('$0') // rounds to zero → no sign
  })

  it('compacts large numbers', () => {
    expect(fmtCompact(1_250_000)).toBe('$1.25M')
    expect(fmtCompact(12_500_000)).toBe('$12.5M')
    expect(fmtCompact(-312_400)).toBe('−$312k')
    expect(fmtCompact(999)).toBe('$999')
  })

  it('signs changes', () => {
    expect(signedUSD(80)).toBe('+$80')
    expect(signedUSD(-80)).toBe('−$80')
    expect(signedPct(0.0123)).toBe('+1.23%')
    expect(signedPct(-0.5)).toBe('−50.00%')
  })
})

describe('computeTotals', () => {
  it('sums value and day change, and computes allocation', () => {
    const t = computeTotals([
      holding({ symbol: 'A', quantity: 10, price: 110, prevClose: 100 }),
      holding({ symbol: 'B', category: 'CASH', quantity: 1, price: 900, prevClose: 900 }),
    ])
    expect(t.total).toBe(2000)
    expect(t.day).toBe(100)
    expect(t.dayPct).toBeCloseTo(100 / 1900, 12)
    expect(t.en[0].symbol).toBe('A') // sorted by value
    expect(t.en[0].alloc).toBeCloseTo(0.55, 12)
  })
})

describe('investable vs. illiquid assets', () => {
  const hs = [
    holding({ category: 'STOCKS', accountType: 'ROTH_IRA', quantity: 1, price: 100 }),
    holding({ category: 'STOCKS', accountType: 'TRADITIONAL_401K', quantity: 1, price: 300 }),
    holding({ category: 'REAL_ESTATE', accountType: 'OTHER', quantity: 1, price: 500000 }),
    holding({ category: 'VEHICLE', accountType: 'OTHER', quantity: 1, price: 20000 }),
  ]

  it('excludes real estate and vehicles from investable totals and tax buckets', () => {
    expect(investableTotal(hs)).toBe(400)
    const tax = computeTaxBreakdown(hs)
    expect(tax.map((t) => t.treatment).sort()).toEqual(['PRE_TAX', 'ROTH'])
    expect(tax.find((t) => t.treatment === 'PRE_TAX')!.pct).toBeCloseTo(0.75, 12)
    expect(computeBrokerageBreakdown(hs).reduce((s, b) => s + b.value, 0)).toBe(400)
  })

  it('recognizes estimated property only when fully specified', () => {
    const est = { category: 'REAL_ESTATE' as const, appreciationPct: 3, openingCostPerShare: 1, openingAcquiredAt: '2020-01-01' }
    expect(isEstimatedAsset(est)).toBe(true)
    expect(isEstimatedAsset({ ...est, appreciationPct: null })).toBe(false)
    expect(isEstimatedAsset({ ...est, category: 'STOCKS' })).toBe(false)
  })

  it('totals debts', () => {
    expect(totalDebt([{ balance: 100 }, { balance: 250.5 }] as Liability[])).toBe(350.5)
  })
})

describe('computeAllocationSlices', () => {
  it('groups S&P 500 and Nasdaq funds and caps the slice count', () => {
    const hs = ['VOO', 'SPY', 'QQQ', 'A', 'B', 'C'].map((s, i) => holding({ symbol: s, quantity: 1, price: 100 + i }))
    const grouped = computeAllocationSlices(hs, 'ticker', true)
    expect(grouped.find((s) => s.key === 'S&P 500')!.value).toBe(201)
    expect(grouped.find((s) => s.key === 'Nasdaq 100')!.value).toBe(102)
    const capped = computeAllocationSlices(hs, 'ticker', false, 3)
    expect(capped).toHaveLength(3)
    expect(capped[2].key).toBe('Other')
    expect(capped.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(1, 12)
  })
})

describe('computeProjection', () => {
  it('compounds monthly', () => {
    const p = computeProjection({ start: 1000, monthly: 0, ret: 12, years: 1, infl: 0 })
    expect(p.finalNom).toBeCloseTo(1000 * Math.pow(1.01, 12), 8)
  })

  it('handles a zero return and splits contributions from growth', () => {
    const p = computeProjection({ start: 10000, monthly: 500, ret: 0, years: 30, infl: 3 })
    expect(p.finalNom).toBe(10000 + 500 * 360)
    expect(p.growth).toBe(0)
    expect(p.real[30]).toBeCloseTo(p.finalNom / Math.pow(1.03, 30), 6)
  })

  it('matches the calculator page example (year 15)', () => {
    const p = computeProjection({ start: 10000, monthly: 500, ret: 7, years: 30, infl: 3 })
    expect(Math.round(p.nominal[15])).toBe(186971)
    expect(p.contributed[15]).toBe(100000)
  })
})

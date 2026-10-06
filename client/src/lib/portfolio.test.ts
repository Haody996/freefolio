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
  planStart,
  marginCollateral,
  marginStatus,
  payoffDebts,
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

  it('groups bitcoin with bitcoin ETFs, but only when grouping is on', () => {
    const hs = [
      holding({ symbol: 'BTC', category: 'CRYPTO', quantity: 0.5, price: 100000 }),
      holding({ symbol: 'ibit', quantity: 100, price: 60 }),
      holding({ symbol: 'FBTC', quantity: 50, price: 90 }),
      holding({ symbol: 'ETH', category: 'CRYPTO', quantity: 2, price: 4000 }),
      holding({ symbol: 'MSTR', quantity: 10, price: 300 }),
    ]
    const grouped = computeAllocationSlices(hs, 'ticker', true)
    expect(grouped.map((s) => s.key)).toEqual(['Bitcoin', 'ETH', 'MSTR'])
    expect(grouped[0].value).toBe(50000 + 6000 + 4500)
    expect(computeAllocationSlices(hs, 'ticker', false).map((s) => s.key)).toEqual(['BTC', 'ETH', 'IBIT', 'FBTC', 'MSTR'])
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

  it('matches the closed-form future value without changes', () => {
    const p = computeProjection({ start: 10000, monthly: 500, ret: 7, years: 30, infl: 3 })
    const r = 0.07 / 12
    const g = Math.pow(1 + r, 360)
    expect(p.finalNom).toBeCloseTo(10000 * g + 500 * ((g - 1) / r), 6)
    expect(p.monthlyByYear.every((m) => m === 500)).toBe(true)
  })

  it('switches contributions at the start of the given year', () => {
    // Age 30: $500/mo until 50 (20 years), then $0 for the last 10.
    const p = computeProjection({ start: 0, monthly: 500, ret: 6, years: 30, infl: 0, changes: [{ year: 20, monthly: 0 }] })
    const r = 0.005
    const at20 = 500 * ((Math.pow(1 + r, 240) - 1) / r)
    expect(p.nominal[20]).toBeCloseTo(at20, 6)
    expect(p.finalNom).toBeCloseTo(at20 * Math.pow(1 + r, 120), 6)
    expect(p.totalContrib).toBe(500 * 240)
    expect(p.monthlyByYear[19]).toBe(500)
    expect(p.monthlyByYear[20]).toBe(0)
  })

  it('applies several changes in age order, whatever order they were entered', () => {
    const p = computeProjection({ start: 0, monthly: 100, ret: 0, years: 10, infl: 0, changes: [{ year: 6, monthly: 0 }, { year: 3, monthly: 300 }] })
    expect(p.monthlyByYear).toEqual([100, 100, 100, 300, 300, 300, 0, 0, 0, 0])
    expect(p.totalContrib).toBe(100 * 36 + 300 * 36)
  })

  it('matches the calculator page example (year 15)', () => {
    const p = computeProjection({ start: 10000, monthly: 500, ret: 7, years: 30, infl: 3 })
    expect(Math.round(p.nominal[15])).toBe(186971)
    expect(p.contributed[15]).toBe(100000)
  })
})

describe('margin loans', () => {
  const liability = (p: Partial<Liability>): Liability => ({ id: 'l', name: 'Debt', type: 'OTHER', institution: '', balance: 0, interestRatePct: 0, minPayment: 0, holdingId: null, ...p })
  const hs = [
    holding({ symbol: 'VTI', institution: 'Fidelity', quantity: 100, price: 1000 }), // 100k taxable at Fidelity
    holding({ symbol: 'BND', category: 'BONDS', institution: 'fidelity ', quantity: 10, price: 1000 }), // 10k
    holding({ symbol: 'VOO', institution: 'Schwab', quantity: 50, price: 1000 }), // 50k taxable at Schwab
    holding({ symbol: 'BTC', category: 'CRYPTO', institution: 'Fidelity', quantity: 1, price: 90000 }), // not marginable
    holding({ symbol: 'FXAIX', accountType: 'ROTH_IRA', institution: 'Fidelity', quantity: 1, price: 40000 }), // retirement account
  ]

  it('borrow against taxable stocks and bonds at the named brokerage', () => {
    expect(marginCollateral(hs, 'Fidelity')).toEqual({ value: 110000, atInstitution: true })
    expect(marginCollateral(hs, '')).toEqual({ value: 160000, atInstitution: false })
    expect(marginCollateral(hs, 'Vanguard')).toEqual({ value: 160000, atInstitution: false })
  })

  it('measure the buffer before a margin call', () => {
    // $40k borrowed on $100k: call when value < 40k / 0.7 = 57,142.86 → a 42.86% drop.
    const s = marginStatus(40000, 100000)!
    expect(s.ltv).toBeCloseTo(0.4, 12)
    expect(s.equityPct).toBeCloseTo(0.6, 12)
    expect(s.callDropPct).toBeCloseTo(1 - 40000 / 70000, 12)
    expect(marginStatus(80000, 100000)!.callDropPct).toBe(0) // already under 30% equity
    expect(marginStatus(1000, 0)).toBeNull()
  })

  it('come off investable assets in plans, and out of payoff plans', () => {
    const debts = [liability({ type: 'MARGIN', balance: 30000 }), liability({ type: 'CREDIT_CARD', balance: 5000 })]
    const start = planStart(hs, debts)
    expect(start.margin).toBe(30000)
    expect(start.capital).toBe(investableTotal(hs) - 30000)
    expect(start.rothPct * start.capital).toBeCloseTo(40000, 6)
    expect(payoffDebts(debts).map((d) => d.type)).toEqual(['CREDIT_CARD'])
    expect(planStart(hs, [liability({ type: 'MARGIN', balance: 1e9 })]).capital).toBe(0)
  })
})

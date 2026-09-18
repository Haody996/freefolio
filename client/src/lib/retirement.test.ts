import { describe, it, expect } from 'vitest'
import { simulateRetirement, backtestRetirement, ssClaimFactor, retirementInputFromSettings, debtScheduleFromSettings } from './retirement'
import type { RetirementInput } from './retirement'
import type { Liability } from './portfolio'

// Zero real return, no taxes/fees/income: balances are simple sums.
const flat: RetirementInput = {
  currentAge: 30,
  retirementAge: 35,
  endAge: 40,
  startingCapital: 100000,
  monthlyContribution: 1000,
  expectedReturnPct: 3,
  inflationPct: 3,
  annualSpending: 20000,
  vacationBudget: 0,
  vacationYears: 0,
  taxRatePct: 0,
  socialSecurityAnnual: 0,
  ssStartAge: 67,
  pensionAnnual: 0,
  pensionStartAge: 65,
  aumFeePct: 0,
  withdrawalStrategy: 'FIXED',
  spendingSmile: false,
  applyRmd: false,
  healthcareAnnual: 0,
  healthcareInflationPct: 3,
  preTaxPct: 0,
  rothPct: 0,
}

const debt = (p: Partial<Liability>): Liability => ({ id: 'd', name: 'Debt', type: 'OTHER', institution: '', balance: 0, interestRatePct: 0, minPayment: 0, holdingId: null, ...p })

describe('ssClaimFactor', () => {
  it('follows Social Security reductions and delayed credits', () => {
    expect(ssClaimFactor(67)).toBe(1)
    expect(ssClaimFactor(62)).toBeCloseTo(0.7, 10)
    expect(ssClaimFactor(70)).toBeCloseTo(1.24, 10)
    expect(ssClaimFactor(55)).toBeCloseTo(0.7, 10) // clamped
  })
})

describe('simulateRetirement', () => {
  it('accumulates contributions then draws down spending', () => {
    const r = simulateRetirement(flat)
    expect(r.realReturnPct).toBeCloseTo(0, 12)
    expect(r.balanceAtRetirement).toBeCloseTo(100000 + 5 * 12000, 6)
    expect(r.endBalance).toBeCloseTo(160000 - 5 * 20000, 6)
    expect(r.lasts).toBe(true)
  })

  it('reports the depletion age when money runs out', () => {
    const r = simulateRetirement({ ...flat, annualSpending: 70000 })
    expect(r.depletedAge).toBe(38) // 160k covers 2 full years + part of the 3rd
    expect(r.lasts).toBe(false)
  })

  it('draws taxable before pre-tax and grosses up for taxes', () => {
    const r = simulateRetirement({ ...flat, retirementAge: 30, currentAge: 30, endAge: 31, monthlyContribution: 0, taxRatePct: 20, preTaxPct: 1 })
    const year = r.series[1]
    expect(year.netWithdrawal).toBeCloseTo(20000, 6)
    expect(year.gross).toBeCloseTo(25000, 6) // 20k net at 20% tax
    expect(year.taxes).toBeCloseTo(5000, 6)
  })
})

describe('debts in the retirement plan', () => {
  // $12k/yr loan for 2 years at 0% interest ($24k).
  const loan = [debt({ balance: 24000, minPayment: 1000 })]
  // Loan payments are fixed in nominal dollars; the sim works in today's
  // dollars, so plan-year i (1-based) is deflated by inflation^(i − 1).
  const today = (nominal: number, yearsOut: number) => nominal / Math.pow(1.03, yearsOut)

  it('redirects paid-off debt payments into savings', () => {
    const schedule = debtScheduleFromSettings(loan, { redirectDebtPayments: true })
    expect(schedule.debtFreeMonths).toBe(24)
    expect(schedule.debtAnnualBudget).toBe(12000)
    const withDebt = simulateRetirement({ ...flat, ...schedule })
    const without = simulateRetirement(flat)
    // Years 3–5 each add the freed $12k/yr, in today's dollars.
    expect(withDebt.balanceAtRetirement - without.balanceAtRetirement).toBeCloseTo(today(12000, 2) + today(12000, 3) + today(12000, 4), 6)
    expect(withDebt.series[2].contribution).toBeCloseTo(12000, 6) // still paying the loan
    expect(withDebt.series[3].contribution).toBeCloseTo(12000 + today(12000, 2), 6)
  })

  it('leaves savings unchanged when redirect is off', () => {
    const schedule = debtScheduleFromSettings(loan, { redirectDebtPayments: false })
    expect(simulateRetirement({ ...flat, ...schedule }).balanceAtRetirement).toBeCloseTo(simulateRetirement(flat).balanceAtRetirement, 6)
  })

  it('adds payments still due after retiring to spending', () => {
    const long = [debt({ balance: 120000, minPayment: 1000 })] // 10 years
    const schedule = debtScheduleFromSettings(long, { redirectDebtPayments: false })
    const r = simulateRetirement({ ...flat, ...schedule })
    const firstRetiredYear = r.series.find((y) => y.phase === 'draw')! // plan year 6
    expect(firstRetiredYear.debtPayment).toBeCloseTo(today(12000, 5), 6)
    expect(firstRetiredYear.spend).toBeCloseTo(20000 + today(12000, 5), 6)
  })

  it('offsets the schedule for the post-retirement analysis', () => {
    const long = [debt({ balance: 120000, minPayment: 1000 })]
    const schedule = debtScheduleFromSettings(long, { redirectDebtPayments: false })
    const analysis = simulateRetirement({ ...flat, ...schedule, currentAge: 35, endAge: 45, monthlyContribution: 0, startingCapital: 160000, debtYearOffset: 5 })
    // Analysis year 1 is the loan's 6th year; year 5 its 10th and final.
    expect(analysis.series[1].debtPayment).toBeCloseTo(today(12000, 5), 6)
    expect(analysis.series[5].debtPayment).toBeCloseTo(today(12000, 9), 6)
    expect(analysis.series[6].debtPayment).toBe(0)
  })

  it('uses the saved strategy and adds the extra payment only when there is debt', () => {
    expect(debtScheduleFromSettings([], { debtExtraPayment: 500 }).debtAnnualBudget).toBe(0)
    const s = debtScheduleFromSettings(loan, { debtExtraPayment: 1000, debtStrategy: 'SNOWBALL' })
    expect(s.debtAnnualBudget).toBe(24000)
    expect(s.debtFreeMonths).toBe(12)
  })
})

describe('settings + backtest', () => {
  it('defaults starting capital to investable net worth', () => {
    const input = retirementInputFromSettings({ currentAge: 40 }, 250000, 0.5, 0.2)
    expect(input.startingCapital).toBe(250000)
    expect(input.currentAge).toBe(40)
    expect(input.retirementAge).toBe(55)
  })

  it('is deterministic and bounded', () => {
    const p = { ...flat, expectedReturnPct: 7, startingCapital: 500000, endAge: 70 }
    const a = backtestRetirement(p, 200)
    const b = backtestRetirement(p, 200)
    expect(a).toEqual(b)
    expect(a.successRate).toBeGreaterThanOrEqual(0)
    expect(a.successRate).toBeLessThanOrEqual(1)
    expect(a.bands).toHaveLength(p.endAge - p.currentAge + 1)
    a.bands.forEach((band) => expect(band.p5).toBeLessThanOrEqual(band.p95))
  })
})

describe('what-if inputs', () => {
  const base: RetirementInput = { ...flat, expectedReturnPct: 7, startingCapital: 400000, endAge: 80 }

  it('applies a one-time shock only in the year ending at that age', () => {
    const plain = simulateRetirement(base)
    const shocked = simulateRetirement({ ...base, shock: { age: 32, realReturn: -0.3 } })
    expect(shocked.series[1].balance).toBeCloseTo(plain.series[1].balance, 6) // age 31 unaffected
    expect(shocked.series[2].balance).toBeLessThan(plain.series[2].balance)
  })

  it('lets callers pin the Monte Carlo seed', () => {
    const a = backtestRetirement(base, 200, 12345)
    const b = backtestRetirement({ ...base, annualSpending: base.annualSpending + 1 }, 200, 12345)
    const c = backtestRetirement(base, 200, 54321)
    expect(a.bands[5].p50).toBeCloseTo(b.bands[5].p50, 0) // same markets
    expect(a.bands[5].p50).not.toBe(c.bands[5].p50)
  })

  it('narrows the range of outcomes with lower volatility', () => {
    const wide = backtestRetirement(base, 300, 7)
    const calm = backtestRetirement({ ...base, volatilityScale: 0.3 }, 300, 7)
    const spread = (r: typeof wide) => r.bands[10].p95 - r.bands[10].p5
    expect(spread(calm)).toBeLessThan(spread(wide) * 0.6)
  })
})

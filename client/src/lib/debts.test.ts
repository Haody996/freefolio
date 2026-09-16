import { describe, it, expect } from 'vitest'
import { simulatePayoff, annualPayments, monthsLabel, payoffDate, MAX_MONTHS } from './debts'
import type { DebtInput } from './debts'

// Exact level payment that amortizes `balance` over `months` at `apr`.
const amortized = (balance: number, apr: number, months: number) => {
  const r = apr / 100 / 12
  return (balance * r) / (1 - Math.pow(1 + r, -months))
}

const DEBTS: DebtInput[] = [
  { id: 'cc', name: 'Card', balance: 4000, ratePct: 24, minPayment: 100 },
  { id: 'car', name: 'Car', balance: 12000, ratePct: 7, minPayment: 300 },
  { id: 'med', name: 'Medical', balance: 900, ratePct: 0, minPayment: 50 },
]

describe('simulatePayoff', () => {
  it('matches a standard amortization schedule', () => {
    const pay = amortized(10000, 12, 60)
    const plan = simulatePayoff([{ id: 'a', name: 'Loan', balance: 10000, ratePct: 12, minPayment: pay }], 'AVALANCHE')
    expect(plan.months).toBe(60)
    expect(plan.totalInterest).toBeCloseTo(pay * 60 - 10000, 1)
    expect(plan.balances[0]).toBe(10000)
    expect(plan.balances[60]).toBeCloseTo(0, 2)
  })

  it('pays a 0% debt off in balance / payment months', () => {
    const plan = simulatePayoff([{ id: 'z', name: 'Zero', balance: 1000, ratePct: 0, minPayment: 100 }], 'SNOWBALL')
    expect(plan.months).toBe(10)
    expect(plan.totalInterest).toBe(0)
    expect(plan.totalPaid).toBeCloseTo(1000, 6)
  })

  it('orders avalanche by rate and snowball by balance', () => {
    expect(simulatePayoff(DEBTS, 'AVALANCHE', 300).order[0].id).toBe('cc')
    expect(simulatePayoff(DEBTS, 'SNOWBALL', 300).order.map((o) => o.id)).toEqual(['med', 'cc', 'car'])
  })

  it('never costs more interest with avalanche than snowball', () => {
    for (const extra of [0, 50, 300, 1000]) {
      const av = simulatePayoff(DEBTS, 'AVALANCHE', extra)
      const sb = simulatePayoff(DEBTS, 'SNOWBALL', extra)
      expect(av.totalInterest).toBeLessThanOrEqual(sb.totalInterest + 1e-6)
    }
  })

  it('beats minimum-only payments, which do not roll freed payments over', () => {
    const av = simulatePayoff(DEBTS, 'AVALANCHE', 0)
    const min = simulatePayoff(DEBTS, 'MINIMUM')
    expect(av.months!).toBeLessThan(min.months!)
    expect(av.totalInterest).toBeLessThan(min.totalInterest)
  })

  it('keeps the monthly budget constant as debts are paid off (rollover)', () => {
    const plan = simulatePayoff(DEBTS, 'AVALANCHE', 200)
    const budget = 100 + 300 + 50 + 200
    // Every month except the last pays the full budget.
    plan.payments.slice(0, -1).forEach((p) => expect(p).toBeCloseTo(budget, 6))
    expect(plan.payments[plan.payments.length - 1]).toBeLessThanOrEqual(budget + 1e-6)
  })

  it('accounts every dollar: paid = principal + interest', () => {
    const plan = simulatePayoff(DEBTS, 'SNOWBALL', 125)
    expect(plan.totalPaid).toBeCloseTo(16900 + plan.totalInterest, 2)
    expect(annualPayments(plan).reduce((s, x) => s + x, 0)).toBeCloseTo(plan.totalPaid, 6)
  })

  it('reports payments that never cover interest as never paid off, without running 50 years', () => {
    const plan = simulatePayoff([{ id: 'x', name: 'x', balance: 10000, ratePct: 30, minPayment: 100 }], 'AVALANCHE')
    expect(plan.months).toBeNull()
    expect(plan.order[0].month).toBeNull()
    expect(plan.payments.length).toBeLessThan(MAX_MONTHS)
  })

  it('handles no debts', () => {
    const plan = simulatePayoff([], 'AVALANCHE', 500)
    expect(plan.months).toBe(0)
    expect(plan.balances).toEqual([0])
    expect(plan.totalPaid).toBe(0)
  })
})

describe('formatting', () => {
  it('labels months', () => {
    expect(monthsLabel(null)).toMatch(/Never/)
    expect(monthsLabel(7)).toBe('7 mo')
    expect(monthsLabel(24)).toBe('2 yr')
    expect(monthsLabel(29)).toBe('2 yr 5 mo')
  })

  it('computes the payoff month', () => {
    expect(payoffDate(null)).toBe('—')
    expect(payoffDate(3, new Date(2026, 10, 15))).toBe('Feb 2027')
  })
})

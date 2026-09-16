import { describe, it, expect } from 'vitest'
import { realReturn, fireNumber, computeFire, computeCoast } from './calculators'

const base = { currentAge: 30, annualExpenses: 40000, currentSavings: 0, monthlySavings: 0, expectedReturnPct: 7, inflationPct: 3, withdrawalRatePct: 4 }

describe('realReturn / fireNumber', () => {
  it('uses the exact Fisher relation', () => {
    expect(realReturn(7, 3)).toBeCloseTo(1.07 / 1.03 - 1, 12)
    expect(realReturn(3, 3)).toBe(0)
  })

  it('is spending ÷ withdrawal rate', () => {
    expect(fireNumber(40000, 4)).toBe(1_000_000)
    expect(fireNumber(50000, 3.5)).toBeCloseTo(1_428_571.43, 2)
    expect(fireNumber(40000, 0)).toBe(Infinity)
  })
})

describe('computeFire', () => {
  it('is already independent when savings cover the FIRE number', () => {
    const r = computeFire({ ...base, currentSavings: 1_000_000 })
    expect(r.monthsToFire).toBe(0)
    expect(r.fireAge).toBe(30)
  })

  it('with a zero real return, just counts contributions', () => {
    const r = computeFire({ ...base, monthlySavings: 5000, expectedReturnPct: 3 })
    expect(r.monthsToFire).toBe(200) // 1,000,000 / 5,000
    expect(r.fireAge).toBeCloseTo(30 + 200 / 12, 10)
    expect(r.balances[1]).toBeCloseTo(60000, 6)
  })

  it('matches the annuity future-value formula', () => {
    const r = computeFire({ ...base, currentSavings: 10000, monthlySavings: 1000 })
    const rm = Math.pow(1.07 / 1.03, 1 / 12) - 1
    // Contribute then grow each month: FV = P(1+i)^n + C·(1+i)·((1+i)^n − 1)/i
    const fv = (n: number) => 10000 * Math.pow(1 + rm, n) + 1000 * (1 + rm) * ((Math.pow(1 + rm, n) - 1) / rm)
    expect(r.balances[5]).toBeCloseTo(fv(60), 4)
    expect(r.ages[5]).toBe(35)
  })

  it('returns null when independence is out of reach', () => {
    const r = computeFire({ ...base, currentSavings: 1000, expectedReturnPct: 3 })
    expect(r.monthsToFire).toBeNull()
    expect(r.fireAge).toBeNull()
  })

  it('computes lean and fat FIRE targets', () => {
    const r = computeFire(base)
    expect(r.leanFire).toBeCloseTo(700_000, 6)
    expect(r.fatFire).toBeCloseTo(1_500_000, 6)
  })
})

describe('computeCoast', () => {
  const coast = { currentAge: 40, retirementAge: 65, annualExpenses: 40000, currentSavings: 400000, monthlySavings: 0, expectedReturnPct: 7, inflationPct: 3, withdrawalRatePct: 4 }

  it('discounts the FIRE number back to today at the real return', () => {
    const r = computeCoast(coast)
    expect(r.coastNumber).toBeCloseTo(1_000_000 / Math.pow(1.07 / 1.03, 25), 6)
    expect(r.required[r.required.length - 1]).toBeCloseTo(1_000_000, 6) // at retirement
    expect(r.ages).toHaveLength(26)
  })

  it('flags reached vs. short, with the gap', () => {
    const reached = computeCoast(coast)
    expect(reached.reached).toBe(true)
    expect(reached.coastAge).toBe(40)
    expect(reached.gap).toBeLessThan(0)
    expect(reached.projectedAtRetirement).toBeGreaterThanOrEqual(1_000_000)

    const short = computeCoast({ ...coast, currentSavings: 100000 })
    expect(short.reached).toBe(false)
    expect(short.gap).toBeCloseTo(short.coastNumber - 100000, 6)
    expect(short.coastAge).toBeNull() // not saving anything
  })

  it('finds the age you reach Coast FIRE by saving', () => {
    const r = computeCoast({ ...coast, currentSavings: 100000, monthlySavings: 3000 })
    expect(r.coastAge).not.toBeNull()
    const i = r.ages.findIndex((a) => a >= Math.ceil(r.coastAge!))
    expect(r.projected[i]).toBeGreaterThanOrEqual(r.required[i])
  })
})

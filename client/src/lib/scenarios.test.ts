import { describe, it, expect } from 'vitest'
import { summarize, basePlanInput, applyOverrides, runScenario, planSettingsFor, computeLevers, runDebtScenario, BOND_RETURN_PCT } from './scenarios'
import type { PlanData } from './scenarios'
import { simulateRetirement, backtestRetirement } from './retirement'
import { simulatePayoff } from './debts'
import type { Holding, Liability } from './portfolio'

function holding(p: Partial<Holding>): Holding {
  return {
    id: Math.random().toString(36).slice(2), symbol: 'VTI', name: '', category: 'STOCKS', accountType: 'TAXABLE', institution: '', quantity: 1, price: 0, prevClose: 0,
    autoAmount: null, autoFrequency: null, autoNextAt: null, openingCostPerShare: null, openingAcquiredAt: null, providerId: null, appreciationPct: null, ...p,
  }
}
const debt = (p: Partial<Liability>): Liability => ({ id: Math.random().toString(36).slice(2), name: 'Debt', type: 'OTHER', institution: '', balance: 0, interestRatePct: 0, minPayment: 0, holdingId: null, ...p })

const data: PlanData = {
  settings: {
    currentAge: 40, retirementAge: 55, endAge: 90, monthlyContribution: 2500, expectedReturnPct: 7, inflationPct: 3, annualSpending: 60000,
    vacationBudget: 0, vacationYears: 0, taxRatePct: 15, socialSecurityAnnual: 24000, ssStartAge: 67, pensionAnnual: 0, pensionStartAge: 65,
    aumFeePct: 0.5, healthcareAnnual: 6000, healthcareInflationPct: 5, withdrawalStrategy: 'FIXED', spendingSmile: false, applyRmd: true,
    debtStrategy: 'AVALANCHE', debtExtraPayment: 0, redirectDebtPayments: true,
  },
  holdings: [
    holding({ accountType: 'TRADITIONAL_401K', quantity: 1, price: 300000 }),
    holding({ accountType: 'ROTH_IRA', quantity: 1, price: 100000 }),
    holding({ accountType: 'TAXABLE', quantity: 1, price: 200000 }),
    holding({ category: 'REAL_ESTATE', accountType: 'OTHER', quantity: 1, price: 500000 }),
  ],
  liabilities: [
    debt({ name: 'Home mortgage', type: 'MORTGAGE', balance: 250000, interestRatePct: 6, minPayment: 1800 }),
    debt({ name: 'Car loan', type: 'AUTO_LOAN', balance: 15000, interestRatePct: 7, minPayment: 450 }),
  ],
}

describe('summarize', () => {
  it('matches the Retirement page calculation exactly', () => {
    const input = basePlanInput(data)
    expect(input.startingCapital).toBe(600000) // investable only
    const det = simulateRetirement(input)
    const analysis = { ...input, currentAge: 55, startingCapital: det.balanceAtRetirement, monthlyContribution: 0, debtYearOffset: 15 }
    const s = summarize(input)
    expect(s.nestEgg).toBe(det.balanceAtRetirement)
    expect(s.successRate).toBe(backtestRetirement(analysis).successRate)
  })
})

describe('applyOverrides / runScenario', () => {
  it('is a no-op without changes, on the same simulated markets', () => {
    const r = runScenario(data, {})
    expect(r.scenario.successRate).toBe(r.current.successRate)
    expect(r.scenario.nestEgg).toBe(r.current.nestEgg)
    expect(r.changes).toEqual([])
  })

  it('pays debts off from investments; their payments keep working', () => {
    const { input, liabilities, changes } = applyOverrides(data, { payOffDebts: ['mortgage'] })
    expect(input.startingCapital).toBe(600000 - 250000)
    expect(liabilities.map((l) => l.name)).toEqual(['Car loan'])
    expect(changes[0]).toMatch(/Pay off Home mortgage now with \$250,000/)
    expect(changes[1]).toBe('The $1,800/mo you paid goes to your other debts, then savings')
    const base = basePlanInput(data)
    // Same $2,250/mo budget: the car loan gets all of it (gone in ~7 months),
    // and the rest of the budget flows to savings.
    expect(input.debtAnnualBudget).toBeCloseTo(base.debtAnnualBudget!, 6)
    const car = simulatePayoff([{ id: 'c', name: 'Car loan', balance: 15000, ratePct: 7, minPayment: 450 }], 'AVALANCHE', 1800)
    expect(car.months).toBe(7)
    expect(input.debtPayments).toEqual([car.totalPaid])
  })

  it('saves the whole debt budget once every debt is paid off (redirect on)', () => {
    const r = runScenario(data, { payOffDebts: ['Home mortgage', 'Car loan'] })
    expect(r.changes[1]).toBe('The $2,250/mo you paid goes to savings')
    const { input } = applyOverrides(data, { payOffDebts: ['Home mortgage', 'Car loan'] })
    expect(input.debtPayments).toEqual([])
    expect(input.debtAnnualBudget).toBe(2250 * 12)
    const off = applyOverrides({ ...data, settings: { ...data.settings, redirectDebtPayments: false } }, { payOffDebts: ['Home mortgage', 'Car loan'] })
    expect(off.changes[1]).toMatch(/isn't saved/)
  })

  it('warns about debts it cannot find', () => {
    expect(applyOverrides(data, { payOffDebts: ['yacht'] }).warnings[0]).toMatch(/yacht/)
  })

  it('refuses payoffs larger than your investments', () => {
    const poor = { ...data, holdings: [data.holdings[2]] } // $200k taxable only
    const big = { ...poor, liabilities: [{ ...data.liabilities[0], balance: 250000 }] }
    const r = applyOverrides(big, { payOffDebts: ['Home mortgage'] })
    expect(r.warnings[0]).toMatch(/more than your \$200,000 of investments/)
    expect(r.liabilities).toHaveLength(1)
    expect(r.input.startingCapital).toBe(200000)
    expect(r.changes).toEqual([])
  })

  it('warns when a payoff would dip into retirement accounts', () => {
    // $250k payoff vs. $200k taxable → $50k from the 401(k)/Roth.
    expect(applyOverrides(data, { payOffDebts: ['Home mortgage'] }).warnings[0]).toMatch(/\$50,000 of that would come from retirement accounts/)
    expect(applyOverrides(data, { payOffDebts: ['Car loan'] }).warnings).toEqual([])
  })

  it('applies a market drop at the requested age', () => {
    const { input } = applyOverrides(data, { marketDropPct: 30 })
    expect(input.shock).toEqual({ age: 41, realReturn: -0.3 })
    const r = runScenario(data, { marketDropPct: 30 })
    expect(r.scenario.nestEgg).toBeLessThan(r.current.nestEgg)
    expect(applyOverrides(data, { marketDropPct: -25, marketDropAge: 56 }).input.shock).toEqual({ age: 56, realReturn: -0.25 })
  })

  it('blends in bond returns and calms volatility', () => {
    const { input } = applyOverrides(data, { bondShiftPct: 20 })
    expect(input.expectedReturnPct).toBeCloseTo(7 * 0.8 + BOND_RETURN_PCT * 0.2, 6)
    expect(input.volatilityScale).toBeCloseTo(0.8, 10)
  })

  it('clamps nonsense values', () => {
    const { input } = applyOverrides(data, { retirementAge: 20, ssStartAge: 90, spendingChange: -1e9 })
    expect(input.retirementAge).toBe(40)
    expect(input.ssStartAge).toBe(70)
    expect(input.annualSpending).toBe(0)
  })

  it('retiring later grows the nest egg and the odds', () => {
    const r = runScenario(data, { retirementAge: 58 })
    expect(r.scenario.nestEgg).toBeGreaterThan(r.current.nestEgg)
    expect(r.scenario.successRate).toBeGreaterThanOrEqual(r.current.successRate)
  })
})

describe('planSettingsFor', () => {
  it('turns relative changes into absolute plan settings', () => {
    expect(planSettingsFor(data, { spendingChange: -5000, retirementAge: 57, debtExtraPayment: 300 })).toEqual({ annualSpending: 55000, retirementAge: 57, debtExtraPayment: 300 })
  })

  it('refuses one-time events', () => {
    expect(planSettingsFor(data, { marketDropPct: 30 })).toBeNull()
    expect(planSettingsFor(data, { payOffDebts: ['Car loan'] })).toBeNull()
    expect(planSettingsFor(data, { payOffDebts: [], retirementAge: 56 })).toEqual({ retirementAge: 56 })
  })
})

describe('computeLevers', () => {
  const r = computeLevers(data)

  it('includes the levers that apply to this plan', () => {
    const keys = [...r.improvements, ...r.noHelp, ...r.risks].map((l) => l.key)
    expect(keys).toEqual(expect.arrayContaining(['spend_less', 'retire_later', 'save_more', 'ss_70', 'guardrails', 'fees', 'debt_faster', 'crash', 'lower_returns']))
  })

  it('ranks improvements by odds gained and risks by odds lost', () => {
    for (let i = 1; i < r.improvements.length; i++) expect(r.improvements[i - 1].deltaSuccess).toBeGreaterThanOrEqual(r.improvements[i].deltaSuccess)
    for (let i = 1; i < r.risks.length; i++) expect(r.risks[i - 1].deltaSuccess).toBeLessThanOrEqual(r.risks[i].deltaSuccess)
    expect(r.improvements.find((l) => l.key === 'spend_less')!.deltaSuccess).toBeGreaterThanOrEqual(0)
    expect(r.risks.find((l) => l.key === 'crash')!.deltaSuccess).toBeLessThanOrEqual(0)
  })

  it('evaluates every lever on the baseline’s simulated markets', () => {
    for (const l of [...r.improvements, ...r.noHelp, ...r.risks]) expect(l.summary.seed).toBe(r.baseline.seed)
  })

  it('only lists levers that actually raise the odds as improvements', () => {
    r.improvements.forEach((l) => expect(l.deltaSuccess).toBeGreaterThanOrEqual(0.5))
    r.noHelp.forEach((l) => expect(l.deltaSuccess).toBeLessThan(0.5))
  })

  it('skips levers that do not apply', () => {
    const simple = computeLevers({ ...data, liabilities: [], settings: { ...data.settings, ssStartAge: 70, withdrawalStrategy: 'GUARDRAILS', aumFeePct: 0 } })
    const keys = [...simple.improvements, ...simple.noHelp].map((l) => l.key)
    expect(keys).not.toContain('ss_70')
    expect(keys).not.toContain('guardrails')
    expect(keys).not.toContain('fees')
    expect(keys).not.toContain('debt_faster')
  })
})

describe('runDebtScenario', () => {
  it('compares against the saved debt plan', () => {
    const r = runDebtScenario(data, { extraMonthly: 500 })
    expect(r.scenario.months!).toBeLessThan(r.current.months!)
    expect(r.scenario.totalInterest).toBeLessThan(r.current.totalInterest)
  })

  it('pays named debts off as a lump sum and rolls their payment into the rest', () => {
    const r = runDebtScenario(data, { payOffDebts: ['Car loan'] })
    expect(r.scenario.lumpSum).toBe(15000)
    expect(r.changes[0]).toMatch(/Car loan.*\$450\/mo goes to the rest/)
    expect(r.scenario.totalInterest).toBeLessThan(r.current.totalInterest)
    expect(r.scenario.months!).toBeLessThan(r.current.months!)
  })
})

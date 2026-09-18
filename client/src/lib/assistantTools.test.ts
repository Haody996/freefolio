import { describe, it, expect, vi } from 'vitest'

vi.mock('./api', () => ({
  default: {
    get: vi.fn(async () => ({
      data: {
        settings: { filingStatus: 'SINGLE', rothTargetBracketPct: 12 },
        assetLocation: { findings: [{ severity: 'high', title: 'Hold bonds in IRA', amount: 25000.4, symbols: ['BND'] }] },
        rothLadder: { applicable: true, startAge: 60, endAge: 72, totalConverted: 400000.6, totalTax: 48000, avgRate: 0.12, rmdAt73: { withLadder: 1000, withoutLadder: 30000 } },
        harvest: [{ symbol: 'VOO', harvestableLoss: -3000, washSaleRisk: null, replacements: [{ symbol: 'VTI' }] }],
      },
    })),
  },
}))

import { toOverrides, runTool, buildAssistantContext } from './assistantTools'
import type { PlanData } from './scenarios'

const data: PlanData = {
  settings: { currentAge: 40, retirementAge: 55, endAge: 90, monthlyContribution: 2000, expectedReturnPct: 7, inflationPct: 3, annualSpending: 50000, socialSecurityAnnual: 20000, ssStartAge: 67 },
  holdings: [
    { id: 'h1', symbol: 'VTI', name: 'Vanguard Total', category: 'STOCKS', accountType: 'TAXABLE', institution: '', quantity: 10, price: 300, prevClose: 300, autoAmount: null, autoFrequency: null, autoNextAt: null, openingCostPerShare: null, openingAcquiredAt: null, providerId: null, appreciationPct: null },
  ],
  liabilities: [],
}

describe('toOverrides', () => {
  it('keeps known, well-typed arguments from the model', () => {
    expect(
      toOverrides({ label: 'x', retirementAge: 50, spendingChange: '-5000', withdrawalStrategy: 'GUARDRAILS', debtStrategy: 'FASTEST', payOffDebts: ['Mortgage', 3], marketDropPct: 'lots', hack: 1 })
    ).toEqual({ retirementAge: 50, spendingChange: -5000, withdrawalStrategy: 'GUARDRAILS', payOffDebts: ['Mortgage'] })
  })
})

describe('runTool', () => {
  it('runs a retirement scenario and returns compact numbers plus a card', async () => {
    const out = await runTool('run_retirement_scenario', { label: 'Retire at 50', retirementAge: 50 }, data)
    expect(out.response.label).toBe('Retire at 50')
    expect(out.response.changes).toEqual(['Retire at 50 (plan: 55)'])
    const cur = out.response.currentPlan as { retirementAge: number; successOddsPct: number }
    const scn = out.response.scenario as { retirementAge: number; nestEggAtRetirement: number }
    expect(cur.retirementAge).toBe(55)
    expect(scn.retirementAge).toBe(50)
    expect(Number.isInteger(scn.nestEggAtRetirement)).toBe(true)
    expect(out.card?.kind).toBe('scenario')
    expect(JSON.stringify(out.response)).not.toContain('balances') // no series sent to the model
  })

  it('explains when there are no debts to plan', async () => {
    expect((await runTool('run_debt_payoff', { label: 'x' }, data)).response.error).toMatch(/no debts/)
  })

  it('summarizes tax insights with rounded numbers', async () => {
    const out = await runTool('get_tax_insights', {}, data)
    const r = out.response as any
    expect(r.assetLocation[0]).toEqual({ severity: 'high', finding: 'Hold bonds in IRA', amount: 25000, holdings: ['BND'] })
    expect(r.rothLadder.totalConverted).toBe(400001)
    expect(r.taxLossHarvesting[0].replacementFunds).toEqual(['VTI'])
    expect(out.card).toEqual({ kind: 'tax', summary: { findings: 1, harvestable: -3000, converted: 400000.6 } })
  })

  it('rejects unknown tools', async () => {
    expect((await runTool('delete_everything', {}, data)).response.error).toMatch(/Unknown tool/)
  })
})

describe('buildAssistantContext', () => {
  it('summarizes the user’s data with the current plan result', () => {
    const ctx = buildAssistantContext(data, new Map([['h1', 512.6]]))
    expect(ctx.netWorth).toEqual({ total: 3000, assets: 3000, debts: 0, investable: 3000 })
    expect(ctx.topHoldings[0]).toMatchObject({ symbol: 'VTI', value: 3000, unrealizedGain: 513, account: 'Taxable' })
    expect(ctx.currentPlanResult.retirementAge).toBe(55)
    expect(ctx.debtPlan).toBeNull()
  })
})

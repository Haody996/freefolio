// Runs the tools the AI assistant asks for, in the browser, with the same
// planning code as the rest of the app. Each tool returns compact numbers for
// the model and a card for the chat UI.

import api from './api'
import { runScenario, runDebtScenario, computeLevers, summarize, basePlanInput, summaryForAi } from './scenarios'
import type { PlanData, ScenarioOverrides, ScenarioResult, LeversResult } from './scenarios'
import { simulatePayoff, payoffDate } from './debts'
import type { DebtStrategy } from './debts'
import { computeTotals, computeTaxBreakdown, investableTotal, totalDebt, accountLabel, CAT_LABEL } from './portfolio'
import type { Category } from './portfolio'

export type ToolCard =
  | { kind: 'scenario'; result: ScenarioResult }
  | { kind: 'debt'; label: string; result: ReturnType<typeof runDebtScenario> }
  | { kind: 'levers'; result: LeversResult }
  | { kind: 'tax'; summary: { findings: number; harvestable: number; converted: number } }

export interface ToolOutcome {
  response: Record<string, unknown>
  card?: ToolCard
}

const SCENARIO_KEYS: (keyof ScenarioOverrides)[] = [
  'retirementAge', 'annualSpending', 'spendingChange', 'monthlyContribution', 'contributionChange', 'expectedReturnPct', 'inflationPct',
  'socialSecurityAnnual', 'ssStartAge', 'pensionAnnual', 'pensionStartAge', 'withdrawalStrategy', 'aumFeePct', 'endAge',
  'startingCapitalChange', 'payOffDebts', 'debtExtraPayment', 'debtStrategy', 'bondShiftPct', 'marketDropPct', 'marketDropAge',
]

// Keep only known, well-typed arguments from the model.
export function toOverrides(args: Record<string, unknown>): ScenarioOverrides {
  const o: Record<string, unknown> = {}
  for (const k of SCENARIO_KEYS) {
    const v = args[k]
    if (v == null) continue
    if (k === 'payOffDebts') {
      if (Array.isArray(v)) o[k] = v.filter((x) => typeof x === 'string')
    } else if (k === 'withdrawalStrategy') {
      if (v === 'FIXED' || v === 'GUARDRAILS') o[k] = v
    } else if (k === 'debtStrategy') {
      if (v === 'AVALANCHE' || v === 'SNOWBALL') o[k] = v
    } else if (typeof v === 'number' && isFinite(v)) o[k] = v
    else if (typeof v === 'string' && v.trim() !== '' && isFinite(Number(v))) o[k] = Number(v)
  }
  return o as ScenarioOverrides
}

export async function runTool(name: string, args: Record<string, unknown>, data: PlanData): Promise<ToolOutcome> {
  switch (name) {
    case 'run_retirement_scenario': {
      const label = String(args.label || 'Scenario').slice(0, 80)
      const result = runScenario(data, toOverrides(args), label)
      return {
        response: { label, changes: result.changes, warnings: result.warnings, currentPlan: summaryForAi(result.current), scenario: summaryForAi(result.scenario) },
        card: { kind: 'scenario', result },
      }
    }
    case 'run_debt_payoff': {
      if (!data.liabilities.length) return { response: { error: 'The user has no debts entered. They can add them on the Debts page.' } }
      const label = String(args.label || 'Debt plan').slice(0, 80)
      const strategy = args.strategy === 'SNOWBALL' || args.strategy === 'AVALANCHE' ? (args.strategy as DebtStrategy) : undefined
      const extraMonthly = typeof args.extraMonthly === 'number' ? args.extraMonthly : undefined
      const payOffDebts = Array.isArray(args.payOffDebts) ? args.payOffDebts.filter((x): x is string => typeof x === 'string') : undefined
      const result = runDebtScenario(data, { strategy, extraMonthly, payOffDebts })
      const view = (p: typeof result.current) => ({
        debtFreeInMonths: p.months,
        debtFreeDate: payoffDate(p.months),
        totalInterest: Math.round(p.totalInterest),
        lumpSumUsed: Math.round(p.lumpSum),
      })
      return {
        response: { label, changes: result.changes, warnings: result.warnings, currentPlan: view(result.current), scenario: view(result.scenario) },
        card: { kind: 'debt', label, result },
      }
    }
    case 'analyze_retirement_levers': {
      const result = computeLevers(data)
      const row = (l: LeversResult['improvements'][number]) => ({
        lever: l.label,
        successOddsPct: +(l.summary.successRate * 100).toFixed(1),
        changePts: +l.deltaSuccess.toFixed(1),
        nestEggChange: Math.round(l.deltaNestEgg),
      })
      return {
        response: {
          currentPlan: summaryForAi(result.baseline),
          improvements: result.improvements.map(row),
          littleOrNoHelp: result.noHelp.map(row),
          risks: result.risks.map(row),
        },
        card: { kind: 'levers', result },
      }
    }
    case 'get_tax_insights': {
      const { data: t } = await api.get('/tax-insights')
      const ladder = t.rothLadder
      return {
        response: {
          filingStatus: t.settings.filingStatus,
          assetLocation: t.assetLocation.findings.map((f: { title: string; amount: number; symbols: string[]; severity: string }) => ({ severity: f.severity, finding: f.title, amount: Math.round(f.amount), holdings: f.symbols })),
          rothLadder: ladder.applicable
            ? {
                convertFromAge: ladder.startAge,
                convertToAge: ladder.endAge,
                targetBracketPct: t.settings.rothTargetBracketPct,
                totalConverted: Math.round(ladder.totalConverted),
                federalTaxOnConversions: Math.round(ladder.totalTax),
                averageRatePct: +(ladder.avgRate * 100).toFixed(1),
                rmdAt73Without: Math.round(ladder.rmdAt73.withoutLadder),
                rmdAt73With: Math.round(ladder.rmdAt73.withLadder),
              }
            : { notApplicable: ladder.reason },
          taxLossHarvesting: t.harvest.map((h: { symbol: string; harvestableLoss: number; washSaleRisk: string | null; replacements: { symbol: string }[]; replacementNote: string }) => ({
            symbol: h.symbol,
            loss: Math.round(h.harvestableLoss),
            washSaleRisk: h.washSaleRisk,
            replacementFunds: h.replacements.map((r) => r.symbol),
            note: h.replacementNote,
          })),
        },
        card: {
          kind: 'tax',
          summary: {
            findings: t.assetLocation.findings.filter((f: { severity: string }) => f.severity !== 'good').length,
            harvestable: t.harvest.reduce((s: number, h: { harvestableLoss: number }) => s + h.harvestableLoss, 0),
            converted: ladder.applicable ? ladder.totalConverted : 0,
          },
        },
      }
    }
    default:
      return { response: { error: `Unknown tool ${name}` } }
  }
}

// Snapshot of the user's data for the assistant's instructions (rounded,
// no account numbers). Sent with every question.
export function buildAssistantContext(data: PlanData, gainsByHolding: Map<string, number | null> = new Map()) {
  const totals = computeTotals(data.holdings)
  const debt = totalDebt(data.liabilities)
  const tax = computeTaxBreakdown(data.holdings)
  const byCategory: Record<string, number> = {}
  for (const h of totals.en) byCategory[CAT_LABEL[h.category as Category]] = Math.round((byCategory[CAT_LABEL[h.category as Category]] ?? 0) + h.value)
  const s = data.settings
  const current = summarize(basePlanInput(data))
  const debtPlan = simulatePayoff(
    data.liabilities.map((l) => ({ id: l.id, name: l.name, balance: l.balance, ratePct: l.interestRatePct, minPayment: l.minPayment })),
    s.debtStrategy === 'SNOWBALL' ? 'SNOWBALL' : 'AVALANCHE',
    Number(s.debtExtraPayment) || 0
  )
  return {
    netWorth: { total: Math.round(totals.total - debt), assets: Math.round(totals.total), debts: Math.round(debt), investable: Math.round(investableTotal(data.holdings)) },
    investableByTaxTreatment: Object.fromEntries(tax.map((t) => [t.label, Math.round(t.value)])),
    assetsByClass: byCategory,
    topHoldings: totals.en.slice(0, 12).map((h) => ({
      symbol: h.symbol,
      name: h.name,
      class: CAT_LABEL[h.category as Category],
      account: accountLabel(h.accountType),
      value: Math.round(h.value),
      unrealizedGain: gainsByHolding.get(h.id) != null ? Math.round(gainsByHolding.get(h.id)!) : undefined,
    })),
    debts: data.liabilities.map((l) => ({ name: l.name, type: l.type, balance: Math.round(l.balance), aprPct: l.interestRatePct, monthlyPayment: Math.round(l.minPayment) })),
    plan: {
      currentAge: s.currentAge,
      retirementAge: s.retirementAge,
      planUntilAge: s.endAge,
      annualSpendingInRetirement: s.annualSpending,
      monthlySavings: s.monthlyContribution,
      expectedReturnPct: s.expectedReturnPct,
      inflationPct: s.inflationPct,
      socialSecurityAt67: s.socialSecurityAnnual,
      socialSecurityClaimAge: s.ssStartAge,
      pension: s.pensionAnnual,
      pensionStartAge: s.pensionStartAge,
      withdrawalStrategy: s.withdrawalStrategy,
      feesPct: s.aumFeePct,
      healthcarePerYear: s.healthcareAnnual,
      retirementTaxRatePct: s.taxRatePct,
      debtStrategy: s.debtStrategy,
      extraDebtPaymentPerMonth: s.debtExtraPayment,
    },
    currentPlanResult: summaryForAi(current),
    debtPlan: data.liabilities.length ? { debtFreeDate: payoffDate(debtPlan.months), totalInterest: Math.round(debtPlan.totalInterest) } : null,
  }
}

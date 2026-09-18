// What-if scenarios on top of the user's retirement plan, and the "levers"
// sensitivity analysis. Used by the AI assistant's tools and the Retirement
// page; every number comes from the same simulation as the plan itself.

import { simulateRetirement, backtestRetirement, defaultSeed, retirementInputFromSettings, debtScheduleFromSettings } from './retirement'
import type { RetirementInput } from './retirement'
import { simulatePayoff } from './debts'
import type { DebtStrategy } from './debts'
import { investableTotal, bucketSplit, fmtUSD } from './portfolio'
import type { Holding, Liability } from './portfolio'

export interface PlanData {
  settings: Record<string, unknown>
  holdings: Holding[]
  liabilities: Liability[]
}

// Changes relative to the saved plan. Mirrors the assistant's tool schema and
// the server's saved-scenario whitelist (server/src/routes/scenarios.ts).
export interface ScenarioOverrides {
  retirementAge?: number
  annualSpending?: number
  spendingChange?: number
  monthlyContribution?: number
  contributionChange?: number
  expectedReturnPct?: number
  inflationPct?: number
  socialSecurityAnnual?: number
  ssStartAge?: number
  pensionAnnual?: number
  pensionStartAge?: number
  withdrawalStrategy?: 'FIXED' | 'GUARDRAILS'
  aumFeePct?: number
  endAge?: number
  startingCapitalChange?: number
  payOffDebts?: string[]
  debtExtraPayment?: number
  debtStrategy?: DebtStrategy
  bondShiftPct?: number
  marketDropPct?: number
  marketDropAge?: number
}

export interface PlanSummary {
  nestEgg: number
  retirementAge: number
  endAge: number
  successRate: number
  lasts: boolean
  depletedAge: number | null
  endBalance: number
  safeIncome: number
  ages: number[]
  balances: number[]
  seed: number
}

export const MONTE_CARLO_TRIALS = 600
// Assumed nominal return for bonds when shifting part of the portfolio.
export const BOND_RETURN_PCT = 4.5

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

export function basePlanInput(data: PlanData, settings: Record<string, unknown> = data.settings, liabilities: Liability[] = data.liabilities): RetirementInput {
  const { preTaxPct, rothPct } = bucketSplit(data.holdings)
  return retirementInputFromSettings(settings, investableTotal(data.holdings), preTaxPct, rothPct, debtScheduleFromSettings(liabilities, settings))
}

// Deterministic path + Monte Carlo odds, computed exactly like the Retirement
// page: accumulate to retirement, then stress-test the drawdown from there.
export function summarize(input: RetirementInput, seed?: number): PlanSummary {
  const det = simulateRetirement(input)
  const yearsToRetire = Math.max(0, input.retirementAge - input.currentAge)
  const analysis: RetirementInput = {
    ...input,
    currentAge: input.retirementAge,
    startingCapital: det.balanceAtRetirement,
    monthlyContribution: 0,
    debtYearOffset: (input.debtYearOffset ?? 0) + yearsToRetire,
  }
  const s = seed ?? defaultSeed(analysis, MONTE_CARLO_TRIALS)
  const bt = backtestRetirement(analysis, MONTE_CARLO_TRIALS, s)
  return {
    nestEgg: det.balanceAtRetirement,
    retirementAge: input.retirementAge,
    endAge: input.endAge,
    successRate: bt.successRate,
    lasts: det.lasts,
    depletedAge: det.depletedAge,
    endBalance: det.endBalance,
    safeIncome: det.safeAnnualIncome,
    ages: det.series.map((y) => y.age),
    balances: det.series.map((y) => y.balance),
    seed: s,
  }
}

function findDebts(liabilities: Liability[], names: string[]): { matched: Liability[]; missing: string[] } {
  const matched: Liability[] = []
  const missing: string[] = []
  for (const raw of names) {
    const n = raw.trim().toLowerCase()
    const hit =
      liabilities.find((l) => l.id === raw || l.name.toLowerCase() === n) ??
      liabilities.find((l) => l.name.toLowerCase().includes(n) || n.includes(l.name.toLowerCase()) || l.type.toLowerCase().replace('_', ' ') === n)
    if (hit && !matched.includes(hit)) matched.push(hit)
    else if (!hit) missing.push(raw)
  }
  return { matched, missing }
}

export interface AppliedScenario {
  input: RetirementInput
  liabilities: Liability[]
  changes: string[]
  warnings: string[]
}

export function applyOverrides(data: PlanData, o: ScenarioOverrides): AppliedScenario {
  const base = basePlanInput(data)
  const changes: string[] = []
  const warnings: string[] = []
  const settings: Record<string, unknown> = { ...data.settings }
  let liabilities = data.liabilities
  const input: RetirementInput = { ...base }

  if (o.retirementAge != null) {
    input.retirementAge = clamp(Math.round(o.retirementAge), base.currentAge, 90)
    changes.push(`Retire at ${input.retirementAge} (plan: ${base.retirementAge})`)
  }
  if (o.endAge != null) {
    input.endAge = clamp(Math.round(o.endAge), input.retirementAge + 1, 110)
    changes.push(`Plan until age ${input.endAge}`)
  }
  if (o.annualSpending != null || o.spendingChange != null) {
    input.annualSpending = Math.max(0, o.annualSpending ?? base.annualSpending + (o.spendingChange ?? 0))
    changes.push(`Spend ${fmtUSD(input.annualSpending)}/yr in retirement (plan: ${fmtUSD(base.annualSpending)})`)
  }
  if (o.monthlyContribution != null || o.contributionChange != null) {
    input.monthlyContribution = Math.max(0, o.monthlyContribution ?? base.monthlyContribution + (o.contributionChange ?? 0))
    changes.push(`Save ${fmtUSD(input.monthlyContribution)}/mo (plan: ${fmtUSD(base.monthlyContribution)})`)
  }
  if (o.expectedReturnPct != null) {
    input.expectedReturnPct = clamp(o.expectedReturnPct, -5, 20)
    changes.push(`${input.expectedReturnPct}% expected return (plan: ${base.expectedReturnPct}%)`)
  }
  if (o.inflationPct != null) {
    input.inflationPct = clamp(o.inflationPct, 0, 15)
    changes.push(`${input.inflationPct}% inflation (plan: ${base.inflationPct}%)`)
  }
  if (o.socialSecurityAnnual != null) {
    input.socialSecurityAnnual = Math.max(0, o.socialSecurityAnnual)
    changes.push(`Social Security ${fmtUSD(input.socialSecurityAnnual)}/yr at 67`)
  }
  if (o.ssStartAge != null) {
    input.ssStartAge = clamp(Math.round(o.ssStartAge), 62, 70)
    changes.push(`Claim Social Security at ${input.ssStartAge} (plan: ${base.ssStartAge})`)
  }
  if (o.pensionAnnual != null) {
    input.pensionAnnual = Math.max(0, o.pensionAnnual)
    changes.push(`Pension ${fmtUSD(input.pensionAnnual)}/yr`)
  }
  if (o.pensionStartAge != null) {
    input.pensionStartAge = clamp(Math.round(o.pensionStartAge), 40, 90)
    changes.push(`Pension starts at ${input.pensionStartAge}`)
  }
  if (o.withdrawalStrategy) {
    input.withdrawalStrategy = o.withdrawalStrategy
    changes.push(o.withdrawalStrategy === 'GUARDRAILS' ? 'Guardrails spending (flex with markets)' : 'Fixed spending')
  }
  if (o.aumFeePct != null) {
    input.aumFeePct = clamp(o.aumFeePct, 0, 5)
    changes.push(`${input.aumFeePct}% fees (plan: ${base.aumFeePct}%)`)
  }
  if (o.startingCapitalChange) {
    input.startingCapital = Math.max(0, base.startingCapital + o.startingCapitalChange)
    changes.push(`${o.startingCapitalChange > 0 ? 'Add' : 'Take'} ${fmtUSD(Math.abs(o.startingCapitalChange))} ${o.startingCapitalChange > 0 ? 'to' : 'from'} investments today`)
  }

  // Debts: pay some off now from investments, and/or change the payoff plan.
  // A paid-off debt's payment keeps working, as in the plan itself: it rolls
  // into the remaining debts, then (if redirect is on) into savings.
  const extra = o.debtExtraPayment != null ? Math.max(0, o.debtExtraPayment) : Number(settings.debtExtraPayment) || 0
  if (o.debtExtraPayment != null) changes.push(`${fmtUSD(extra)}/mo extra toward debts`)
  if (o.debtStrategy) {
    settings.debtStrategy = o.debtStrategy
    changes.push(`${o.debtStrategy === 'AVALANCHE' ? 'Avalanche' : 'Snowball'} debt payoff`)
  }
  let freed = 0
  if (o.payOffDebts?.length) {
    const { matched, missing } = findDebts(data.liabilities, o.payOffDebts)
    for (const m of missing) warnings.push(`No debt named “${m}” — add it on the Debts page to include it.`)
    const cost = matched.reduce((s, l) => s + l.balance, 0)
    const names = matched.map((l) => l.name).join(', ')
    if (matched.length && cost > input.startingCapital) {
      // Can't be done — leave the debts in place rather than flatter the result.
      warnings.push(`Paying off ${names} takes ${fmtUSD(cost)}, more than your ${fmtUSD(input.startingCapital)} of investments — so it isn't included.`)
    } else if (matched.length) {
      freed = matched.reduce((s, l) => s + l.minPayment, 0)
      liabilities = data.liabilities.filter((l) => !matched.includes(l))
      const taxableAvailable = input.startingCapital * Math.max(0, 1 - base.preTaxPct - base.rothPct)
      if (cost > taxableAvailable + 1) {
        warnings.push(`${fmtUSD(cost - taxableAvailable)} of that would come from retirement accounts, where withdrawals are taxed (plus a 10% penalty before 59½) — not included here.`)
      }
      input.startingCapital -= cost
      changes.push(`Pay off ${names} now with ${fmtUSD(cost)} of investments`)
    }
  }
  settings.debtExtraPayment = extra + freed
  const schedule = debtScheduleFromSettings(liabilities, settings)
  if (freed > 0) {
    // Keep the monthly debt budget you had: whatever isn't needed for the
    // remaining debts is "freed" (and saved when redirect is on).
    const budget = data.liabilities.reduce((s, l) => s + (l.balance > 0 ? l.minPayment : 0), 0) + extra
    schedule.debtAnnualBudget = budget * 12
    const target = liabilities.length ? `your other debts${schedule.redirectDebtPayments ? ', then savings' : ''}` : schedule.redirectDebtPayments ? 'savings' : null
    changes.push(target ? `The ${fmtUSD(liabilities.length ? freed : budget)}/mo you paid goes to ${target}` : `The ${fmtUSD(budget)}/mo you paid isn't saved (redirect to savings is off)`)
  }
  Object.assign(input, schedule)

  if (o.bondShiftPct) {
    const w = clamp(o.bondShiftPct, 0, 100) / 100
    const before = input.expectedReturnPct
    input.expectedReturnPct = +(before * (1 - w) + BOND_RETURN_PCT * w).toFixed(2)
    input.volatilityScale = Math.max(0.2, (input.volatilityScale ?? 1) * (1 - w))
    changes.push(`Move ${Math.round(w * 100)}% into bonds (return ${before}% → ${input.expectedReturnPct}%, smaller swings)`)
  }
  if (o.marketDropPct) {
    const drop = clamp(Math.abs(o.marketDropPct), 0, 90)
    const age = clamp(Math.round(o.marketDropAge ?? input.currentAge + 1), input.currentAge + 1, input.endAge)
    input.shock = { age, realReturn: -drop / 100 }
    changes.push(`${drop}% market drop at age ${age}`)
  }
  return { input, liabilities, changes, warnings }
}

export interface ScenarioResult {
  label: string
  overrides: ScenarioOverrides
  changes: string[]
  warnings: string[]
  current: PlanSummary
  scenario: PlanSummary
}

export function runScenario(data: PlanData, overrides: ScenarioOverrides, label = 'Scenario'): ScenarioResult {
  const current = summarize(basePlanInput(data))
  const applied = applyOverrides(data, overrides)
  // Same simulated markets as the current plan, so differences aren't noise.
  const scenario = summarize(applied.input, current.seed)
  return { label, overrides, changes: applied.changes, warnings: applied.warnings, current, scenario }
}

// Saved scenarios can be written back to the plan only when every change is a
// plan setting (one-time events like a crash or a lump-sum payoff can't).
const ONE_TIME: (keyof ScenarioOverrides)[] = ['startingCapitalChange', 'payOffDebts', 'bondShiftPct', 'marketDropPct', 'marketDropAge']
export function planSettingsFor(data: PlanData, o: ScenarioOverrides): Record<string, unknown> | null {
  if (ONE_TIME.some((k) => o[k] != null && !(Array.isArray(o[k]) && (o[k] as unknown[]).length === 0))) return null
  const { input } = applyOverrides(data, o)
  const patch: Record<string, unknown> = {}
  const keys = ['retirementAge', 'endAge', 'annualSpending', 'monthlyContribution', 'expectedReturnPct', 'inflationPct', 'socialSecurityAnnual', 'ssStartAge', 'pensionAnnual', 'pensionStartAge', 'withdrawalStrategy', 'aumFeePct'] as const
  const base = basePlanInput(data)
  for (const k of keys) if (input[k] !== base[k]) patch[k] = input[k]
  if (o.debtExtraPayment != null) patch.debtExtraPayment = o.debtExtraPayment
  if (o.debtStrategy) patch.debtStrategy = o.debtStrategy
  return patch
}

// ─── Levers: which single change moves the odds most ─────────────────

export interface Lever {
  key: string
  label: string
  kind: 'improve' | 'risk'
  overrides: ScenarioOverrides
  summary: PlanSummary
  deltaSuccess: number // percentage points
  deltaNestEgg: number
}

export interface LeversResult {
  baseline: PlanSummary
  improvements: Lever[] // raise the odds
  noHelp: Lever[] // choices that barely move (or lower) the odds for this plan
  risks: Lever[]
}

export function computeLevers(data: PlanData): LeversResult {
  const baseInput = basePlanInput(data)
  const baseline = summarize(baseInput)
  const candidates: Omit<Lever, 'summary' | 'deltaSuccess' | 'deltaNestEgg'>[] = [
    { key: 'spend_less', label: 'Spend $5,000 less a year in retirement', kind: 'improve', overrides: { spendingChange: -5000 } },
    { key: 'retire_later', label: `Retire 2 years later (at ${baseInput.retirementAge + 2})`, kind: 'improve', overrides: { retirementAge: baseInput.retirementAge + 2 } },
    { key: 'save_more', label: 'Save $500 more a month', kind: 'improve', overrides: { contributionChange: 500 } },
    { key: 'bonds', label: 'Move 10% into bonds', kind: 'improve', overrides: { bondShiftPct: 10 } },
    { key: 'retire_earlier', label: `Retire 2 years earlier (at ${baseInput.retirementAge - 2})`, kind: 'risk', overrides: { retirementAge: baseInput.retirementAge - 2 } },
    { key: 'spend_more', label: 'Spend $5,000 more a year', kind: 'risk', overrides: { spendingChange: 5000 } },
    { key: 'crash', label: `A 30% crash the year after you retire (age ${baseInput.retirementAge + 1})`, kind: 'risk', overrides: { marketDropPct: 30, marketDropAge: baseInput.retirementAge + 1 } },
    { key: 'lower_returns', label: 'Returns 1 point lower than expected', kind: 'risk', overrides: { expectedReturnPct: baseInput.expectedReturnPct - 1 } },
  ]
  if (baseInput.socialSecurityAnnual > 0 && baseInput.ssStartAge < 70) {
    candidates.push({ key: 'ss_70', label: `Claim Social Security at 70 instead of ${baseInput.ssStartAge}`, kind: 'improve', overrides: { ssStartAge: 70 } })
  }
  if (baseInput.withdrawalStrategy === 'FIXED') {
    candidates.push({ key: 'guardrails', label: 'Use guardrails (trim spending after bad years)', kind: 'improve', overrides: { withdrawalStrategy: 'GUARDRAILS' } })
  }
  if (baseInput.aumFeePct > 0) {
    candidates.push({ key: 'fees', label: `Cut fees from ${baseInput.aumFeePct}% to 0.1%`, kind: 'improve', overrides: { aumFeePct: Math.min(0.1, baseInput.aumFeePct) } })
  }
  if (data.liabilities.some((l) => l.balance > 0)) {
    const extra = Number(data.settings.debtExtraPayment) || 0
    candidates.push({ key: 'debt_faster', label: 'Pay $500/mo extra toward debts', kind: 'improve', overrides: { debtExtraPayment: extra + 500 } })
  }

  const levers = candidates
    .filter((c) => c.key !== 'retire_earlier' || baseInput.retirementAge - 2 > baseInput.currentAge)
    .map((c) => {
      const summary = summarize(applyOverrides(data, c.overrides).input, baseline.seed)
      return { ...c, summary, deltaSuccess: (summary.successRate - baseline.successRate) * 100, deltaNestEgg: summary.nestEgg - baseline.nestEgg }
    })
  const byImpact = (a: Lever, b: Lever) => b.deltaSuccess - a.deltaSuccess || b.deltaNestEgg - a.deltaNestEgg
  const helps = (l: Lever) => l.deltaSuccess >= 0.5
  return {
    baseline,
    improvements: levers.filter((l) => l.kind === 'improve' && helps(l)).sort(byImpact),
    noHelp: levers.filter((l) => l.kind === 'improve' && !helps(l)).sort(byImpact),
    risks: levers.filter((l) => l.kind === 'risk').sort((a, b) => a.deltaSuccess - b.deltaSuccess || a.deltaNestEgg - b.deltaNestEgg),
  }
}

// ─── Debt what-ifs ───────────────────────────────────────────────────

export interface DebtPlanSummary {
  months: number | null
  totalInterest: number
  balances: number[]
  lumpSum: number
}

export function runDebtScenario(
  data: PlanData,
  args: { strategy?: DebtStrategy; extraMonthly?: number; payOffDebts?: string[] }
): { current: DebtPlanSummary; scenario: DebtPlanSummary; changes: string[]; warnings: string[] } {
  const toInput = (ls: Liability[]) => ls.map((l) => ({ id: l.id, name: l.name, balance: l.balance, ratePct: l.interestRatePct, minPayment: l.minPayment }))
  const curStrategy: DebtStrategy = data.settings.debtStrategy === 'SNOWBALL' ? 'SNOWBALL' : 'AVALANCHE'
  const curExtra = Number(data.settings.debtExtraPayment) || 0
  const cur = simulatePayoff(toInput(data.liabilities), curStrategy, curExtra)

  const changes: string[] = []
  const warnings: string[] = []
  let remaining = data.liabilities
  let lumpSum = 0
  let freed = 0
  if (args.payOffDebts?.length) {
    const { matched, missing } = findDebts(data.liabilities, args.payOffDebts)
    for (const m of missing) warnings.push(`No debt named “${m}”.`)
    remaining = data.liabilities.filter((l) => !matched.includes(l))
    lumpSum = matched.reduce((s, l) => s + l.balance, 0)
    freed = matched.reduce((s, l) => s + l.minPayment, 0)
    if (matched.length) changes.push(`Pay off ${matched.map((l) => l.name).join(', ')} now (${fmtUSD(lumpSum)}); its ${fmtUSD(freed)}/mo goes to the rest`)
  }
  const strategy = args.strategy ?? curStrategy
  const extra = args.extraMonthly != null ? Math.max(0, args.extraMonthly) : curExtra
  if (args.strategy && args.strategy !== curStrategy) changes.push(`${strategy === 'AVALANCHE' ? 'Avalanche' : 'Snowball'} order`)
  if (args.extraMonthly != null) changes.push(`${fmtUSD(extra)}/mo extra`)
  // Same monthly budget: a paid-off debt's payment rolls into the others.
  const scen = simulatePayoff(toInput(remaining), strategy, extra + freed)
  return {
    current: { months: cur.months, totalInterest: cur.totalInterest, balances: cur.balances, lumpSum: 0 },
    scenario: { months: scen.months, totalInterest: scen.totalInterest, balances: scen.balances, lumpSum },
    changes,
    warnings,
  }
}

// Compact, rounded numbers for the AI (no series).
export function summaryForAi(s: PlanSummary) {
  return {
    retirementAge: s.retirementAge,
    successOddsPct: +(s.successRate * 100).toFixed(1),
    nestEggAtRetirement: Math.round(s.nestEgg),
    moneyLastsToEndAge: s.lasts,
    runsOutAtAge: s.depletedAge,
    planEndAge: s.endAge,
    balanceAtEndAge: Math.round(s.endBalance),
    safeAnnualIncome: Math.round(s.safeIncome),
  }
}

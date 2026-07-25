// Retirement plan simulation + Monte Carlo backtest. Real (today's) dollars.
//
// Models: 3 tax buckets (pre-tax / Roth / taxable) with tax-efficient withdrawal
// sequencing, RMDs, Social Security claiming credits, advisory (AUM) fees, an
// optional spending "smile", a guardrails withdrawal strategy, and a separately-
// inflating healthcare line.

export type WithdrawalStrategy = 'FIXED' | 'GUARDRAILS'

export interface RetirementInput {
  currentAge: number
  retirementAge: number
  endAge: number
  startingCapital: number
  monthlyContribution: number
  expectedReturnPct: number
  inflationPct: number
  annualSpending: number
  vacationBudget: number
  vacationYears: number
  taxRatePct: number
  socialSecurityAnnual: number // benefit at full retirement age (67)
  ssStartAge: number
  pensionAnnual: number
  pensionStartAge: number
  aumFeePct: number
  withdrawalStrategy: WithdrawalStrategy
  spendingSmile: boolean
  applyRmd: boolean
  healthcareAnnual: number
  healthcareInflationPct: number
  // Bucket split (fractions of the portfolio), derived from the user's holdings.
  preTaxPct: number
  rothPct: number
}

export interface RetirementYear {
  age: number
  balance: number
  phase: 'accumulate' | 'draw'
  ss: number
  pension: number
  netWithdrawal: number
  taxes: number
  gross: number
  withdrawalRate: number
  shortage: number
  spend: number
}

export interface RetirementResult {
  realReturnPct: number
  balanceAtRetirement: number
  endBalance: number
  depletedAge: number | null
  lasts: boolean
  suggestedNestEgg: number
  safeAnnualIncome: number
  lifetimeTaxes: number
  adjustedSS: number
  series: RetirementYear[]
}

const FRA = 67 // Social Security full retirement age

// IRS Uniform Lifetime Table divisors (age → divisor), 2022+.
const RMD_DIVISORS: Record<number, number> = {
  73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2, 81: 19.4, 82: 18.5,
  83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7, 89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8,
  93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4, 97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4,
}
function rmdDivisor(age: number): number {
  if (age < 73) return 0
  return RMD_DIVISORS[age] ?? 6.0
}

// Social Security benefit multiplier for claiming at a given age (relative to FRA 67).
export function ssClaimFactor(claimAge: number): number {
  const age = Math.max(62, Math.min(70, claimAge))
  if (age === FRA) return 1
  if (age < FRA) {
    const monthsEarly = (FRA - age) * 12
    const red = Math.min(monthsEarly, 36) * (5 / 9) / 100 + Math.max(0, monthsEarly - 36) * (5 / 12) / 100
    return 1 - red
  }
  return 1 + (age - FRA) * 12 * (8 / 12) / 100 // 8%/yr delayed credit
}

function realReturnOf(p: RetirementInput): number {
  return (1 + p.expectedReturnPct / 100) / (1 + p.inflationPct / 100) - 1 - p.aumFeePct / 100
}

// Build a full simulation input from raw persisted settings + derived bucket split.
export function retirementInputFromSettings(
  s: Record<string, unknown>,
  netWorth: number,
  preTaxPct: number,
  rothPct: number
): RetirementInput {
  const num = (k: string, d: number) => (s[k] == null || isNaN(Number(s[k])) ? d : Number(s[k]))
  return {
    currentAge: num('currentAge', 30),
    retirementAge: num('retirementAge', 55),
    endAge: num('endAge', 95),
    startingCapital: s.startingCapital == null ? Math.round(netWorth) : Number(s.startingCapital),
    monthlyContribution: num('monthlyContribution', 3000),
    expectedReturnPct: num('expectedReturnPct', 8),
    inflationPct: num('inflationPct', 3),
    annualSpending: num('annualSpending', 60000),
    vacationBudget: num('vacationBudget', 12000),
    vacationYears: num('vacationYears', 10),
    taxRatePct: num('taxRatePct', 15),
    socialSecurityAnnual: num('socialSecurityAnnual', 24000),
    ssStartAge: num('ssStartAge', 67),
    pensionAnnual: num('pensionAnnual', 0),
    pensionStartAge: num('pensionStartAge', 65),
    aumFeePct: num('aumFeePct', 0),
    withdrawalStrategy: s.withdrawalStrategy === 'GUARDRAILS' ? 'GUARDRAILS' : 'FIXED',
    spendingSmile: s.spendingSmile === true,
    applyRmd: s.applyRmd !== false,
    healthcareAnnual: num('healthcareAnnual', 6000),
    healthcareInflationPct: num('healthcareInflationPct', 5),
    preTaxPct,
    rothPct,
  }
}

interface Buckets {
  preTax: number
  roth: number
  taxable: number
}

// Fund `need` (after-tax $) from buckets in tax-efficient order: taxable → pre-tax
// → Roth. Returns gross withdrawn, taxes paid, and any unfunded shortage.
function fundNeed(b: Buckets, need: number, taxRate: number): { gross: number; taxes: number; shortage: number } {
  const capRate = taxRate * 0.5 // long-term capital gains proxy for the taxable bucket
  let remaining = need
  let gross = 0
  let taxes = 0
  const draw = (key: keyof Buckets, rate: number) => {
    if (remaining <= 0 || b[key] <= 0) return
    const maxNet = b[key] * (1 - rate)
    const net = Math.min(remaining, maxNet)
    const g = net / (1 - rate)
    b[key] -= g
    gross += g
    taxes += g - net
    remaining -= net
  }
  draw('taxable', capRate)
  draw('preTax', taxRate)
  draw('roth', 0)
  return { gross, taxes, shortage: Math.max(0, remaining) }
}

// Core lifecycle simulation. `realReturnAt(i)` supplies the real return for year i
// (constant for the deterministic path, random for Monte Carlo trials).
function runSim(p: RetirementInput, realReturnAt: (i: number) => number) {
  const retireAge = Math.max(p.currentAge, p.retirementAge)
  const endAge = Math.max(retireAge + 1, p.endAge)
  const taxRate = p.taxRatePct / 100

  const preTaxPct = Math.max(0, Math.min(1, p.preTaxPct))
  const rothPct = Math.max(0, Math.min(1 - preTaxPct, p.rothPct))
  const taxablePct = Math.max(0, 1 - preTaxPct - rothPct)
  const b: Buckets = {
    preTax: p.startingCapital * preTaxPct,
    roth: p.startingCapital * rothPct,
    taxable: p.startingCapital * taxablePct,
  }
  const total = () => b.preTax + b.roth + b.taxable

  const adjustedSS = p.socialSecurityAnnual * ssClaimFactor(p.ssStartAge)
  const hcDrift = 1 + (p.healthcareInflationPct - p.inflationPct) / 100

  const series: RetirementYear[] = [
    { age: p.currentAge, balance: total(), phase: 'accumulate', ss: 0, pension: 0, netWithdrawal: 0, taxes: 0, gross: 0, withdrawalRate: 0, shortage: 0, spend: 0 },
  ]
  let balanceAtRetirement = total()
  let depletedAge: number | null = null
  let lifetimeTaxes = 0

  // Guardrails state
  let initialWR = 0
  let spendFactor = 1
  let prevWR = 0

  for (let i = 1; i <= endAge - p.currentAge; i++) {
    const age = p.currentAge + i
    const r = realReturnAt(i)

    if (age <= retireAge) {
      const contrib = p.monthlyContribution * 12
      b.preTax += contrib * preTaxPct
      b.roth += contrib * rothPct
      b.taxable += contrib * taxablePct
      b.preTax *= 1 + r
      b.roth *= 1 + r
      b.taxable *= 1 + r
      if (age === retireAge) balanceAtRetirement = total()
      series.push({ age, balance: total(), phase: 'accumulate', ss: 0, pension: 0, netWithdrawal: 0, taxes: 0, gross: 0, withdrawalRate: 0, shortage: 0, spend: 0 })
      continue
    }

    // ── Drawdown ──
    const balanceStart = total()
    const yearsIn = age - retireAge

    // Guardrails: nudge discretionary spending when the withdrawal rate drifts.
    if (p.withdrawalStrategy === 'GUARDRAILS' && initialWR > 0) {
      if (prevWR > initialWR * 1.2) spendFactor *= 0.9
      else if (prevWR < initialWR * 0.8) spendFactor *= 1.1
      spendFactor = Math.max(0.6, Math.min(1.4, spendFactor))
    }

    const smile = p.spendingSmile ? Math.max(0.75, 1 - 0.01 * yearsIn) : 1
    const discretionary = p.annualSpending * smile * (p.withdrawalStrategy === 'GUARDRAILS' ? spendFactor : 1)
    const healthcare = p.healthcareAnnual * Math.pow(hcDrift, yearsIn)
    const vacation = age <= retireAge + p.vacationYears ? p.vacationBudget : 0
    const spend = discretionary + healthcare + vacation

    const ss = age >= p.ssStartAge ? adjustedSS : 0
    const pension = age >= p.pensionStartAge ? p.pensionAnnual : 0
    let need = Math.max(0, spend - ss - pension)

    let gross = 0
    let taxes = 0

    // Required Minimum Distribution from pre-tax first.
    if (p.applyRmd && age >= 73 && b.preTax > 0) {
      const rmd = b.preTax / rmdDivisor(age)
      const net = rmd * (1 - taxRate)
      b.preTax -= rmd
      gross += rmd
      taxes += rmd - net
      if (net >= need) {
        b.taxable += net - need // surplus reinvested to taxable
        need = 0
      } else {
        need -= net
      }
    }

    const funded = fundNeed(b, need, taxRate)
    gross += funded.gross
    taxes += funded.taxes
    const shortage = funded.shortage

    // Grow remaining balances.
    b.preTax *= 1 + r
    b.roth *= 1 + r
    b.taxable *= 1 + r

    lifetimeTaxes += taxes
    const withdrawalRate = balanceStart > 0 ? gross / balanceStart : 0
    if (i === retireAge - p.currentAge + 1 || (initialWR === 0 && gross > 0)) initialWR = withdrawalRate
    prevWR = withdrawalRate

    const balNow = total()
    if (balNow <= 0 && depletedAge === null && balanceStart > 0) depletedAge = age

    series.push({ age, balance: Math.max(0, balNow), phase: 'draw', ss, pension, netWithdrawal: gross - taxes, taxes, gross, withdrawalRate, shortage, spend })
  }

  return { series, balanceAtRetirement, endBalance: total(), depletedAge, lifetimeTaxes, adjustedSS }
}

export function simulateRetirement(p: RetirementInput): RetirementResult {
  const realReturn = realReturnOf(p)
  const sim = runSim(p, () => realReturn)

  const netSpending = Math.max(0, p.annualSpending + p.healthcareAnnual - sim.adjustedSS - p.pensionAnnual)
  const taxDiv = Math.max(0.05, 1 - p.taxRatePct / 100)
  const suggestedNestEgg = (netSpending / taxDiv) * 25
  const safeAnnualIncome = sim.balanceAtRetirement * 0.04 + sim.adjustedSS + p.pensionAnnual

  return {
    realReturnPct: realReturn * 100,
    balanceAtRetirement: sim.balanceAtRetirement,
    endBalance: sim.endBalance,
    depletedAge: sim.depletedAge,
    lasts: sim.depletedAge === null,
    suggestedNestEgg,
    safeAnnualIncome,
    lifetimeTaxes: sim.lifetimeTaxes,
    adjustedSS: sim.adjustedSS,
    series: sim.series,
  }
}

// ─── Monte Carlo backtest ────────────────────────────────────────────
const HISTORICAL_RETURNS = [
  0.438, -0.083, -0.251, -0.438, -0.086, 0.501, -0.012, 0.467, 0.339, -0.350, 0.311, -0.004, -0.098, -0.116,
  0.203, 0.259, 0.198, 0.364, -0.081, 0.057, 0.055, 0.188, 0.314, 0.240, 0.184, -0.010, 0.526, 0.316, 0.066,
  -0.108, 0.434, 0.120, 0.005, 0.269, -0.087, 0.228, 0.165, 0.125, -0.101, 0.240, 0.111, -0.085, 0.040, 0.143,
  0.190, -0.147, -0.265, 0.372, 0.238, -0.072, 0.066, 0.184, 0.324, -0.049, 0.216, 0.226, 0.063, 0.317, 0.187,
  0.053, 0.166, 0.317, -0.031, 0.305, 0.076, 0.101, 0.013, 0.376, 0.230, 0.334, 0.286, 0.210, -0.091, -0.119,
  -0.221, 0.287, 0.109, 0.049, 0.158, 0.055, -0.370, 0.265, 0.151, 0.021, 0.160, 0.324, 0.137, 0.014, 0.120,
  0.218, -0.044, 0.315, 0.184, 0.287, -0.181, 0.263,
]

export interface BacktestBand {
  age: number
  p5: number
  p25: number
  p50: number
  p75: number
  p95: number
}

export interface BacktestResult {
  successRate: number
  trials: number
  bands: BacktestBand[]
  medianEnd: number
  p10End: number
  worstDepletionAge: number | null
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))
  return sorted[i]
}

export function backtestRetirement(p: RetirementInput, trials = 600): BacktestResult {
  const endAge = Math.max(p.retirementAge + 1, p.endAge)
  const nYears = endAge - p.currentAge

  const userReal = realReturnOf(p)
  const histInfl = p.inflationPct / 100
  const histMean = HISTORICAL_RETURNS.reduce((s, r) => s + r, 0) / HISTORICAL_RETURNS.length
  const shift = userReal - (histMean - histInfl)

  let seed = 20260724 ^ Math.round(p.startingCapital + p.annualSpending * 7 + p.retirementAge * 101 + trials)
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }

  const balancesByYear: number[][] = Array.from({ length: nYears + 1 }, () => [])
  let successes = 0
  let worstDepletionAge: number | null = null

  for (let t = 0; t < trials; t++) {
    // Pre-draw this trial's yearly returns, then run the full model.
    const returns: number[] = []
    for (let i = 1; i <= nYears; i++) {
      const raw = HISTORICAL_RETURNS[Math.floor(rand() * HISTORICAL_RETURNS.length)]
      returns.push(raw - histInfl + shift)
    }
    const sim = runSim(p, (i) => returns[i - 1])
    sim.series.forEach((y, i) => balancesByYear[i].push(y.balance))
    if (sim.endBalance > 0) successes++
    if (sim.depletedAge !== null) worstDepletionAge = worstDepletionAge === null ? sim.depletedAge : Math.min(worstDepletionAge, sim.depletedAge)
  }

  const bands: BacktestBand[] = balancesByYear.map((arr, i) => {
    const sorted = [...arr].sort((a, b) => a - b)
    return { age: p.currentAge + i, p5: percentile(sorted, 0.05), p25: percentile(sorted, 0.25), p50: percentile(sorted, 0.5), p75: percentile(sorted, 0.75), p95: percentile(sorted, 0.95) }
  })
  const ends = [...balancesByYear[nYears]].sort((a, b) => a - b)

  return {
    successRate: successes / trials,
    trials,
    bands,
    medianEnd: percentile(ends, 0.5),
    p10End: percentile(ends, 0.1),
    worstDepletionAge,
  }
}

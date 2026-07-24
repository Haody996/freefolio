// Retirement plan simulation + Monte Carlo backtest. Everything is in real
// (today's) dollars so figures stay intuitive.

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
  socialSecurityAnnual: number
  ssStartAge: number
  pensionAnnual: number
  pensionStartAge: number
}

export interface RetirementYear {
  age: number
  balance: number // end-of-year balance
  phase: 'accumulate' | 'draw'
  ss: number
  pension: number
  netWithdrawal: number // after-tax dollars pulled from the portfolio
  taxes: number // tax drag on the withdrawal
  gross: number // pre-tax portfolio withdrawal
  withdrawalRate: number // gross / start-of-year balance
  shortage: number // unfunded spending (portfolio ran dry)
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
  series: RetirementYear[]
}

function realReturnOf(p: RetirementInput): number {
  return (1 + p.expectedReturnPct / 100) / (1 + p.inflationPct / 100) - 1
}

// One drawdown year: spend (incl. early-retirement vacation), offset by
// guaranteed income, gross the shortfall up for taxes, fund it from the
// portfolio (partial if the balance can't cover it), then grow.
function drawYear(p: RetirementInput, age: number, retireAge: number, balanceStart: number, realReturn: number) {
  const taxDiv = Math.max(0.05, 1 - p.taxRatePct / 100)
  const ss = age >= p.ssStartAge ? p.socialSecurityAnnual : 0
  const pension = age >= p.pensionStartAge ? p.pensionAnnual : 0
  const spend = p.annualSpending + (age <= retireAge + p.vacationYears ? p.vacationBudget : 0)
  const need = Math.max(0, spend - ss - pension) // after-tax dollars needed from portfolio
  const grossNeed = need / taxDiv

  let gross = 0
  let netWithdrawal = 0
  let taxes = 0
  let shortage = 0
  let withdrawalRate = 0

  if (balanceStart <= 0) {
    shortage = need
  } else if (balanceStart < grossNeed) {
    gross = balanceStart
    netWithdrawal = gross * taxDiv
    taxes = gross - netWithdrawal
    shortage = need - netWithdrawal
    withdrawalRate = 1
  } else {
    gross = grossNeed
    netWithdrawal = need
    taxes = gross - netWithdrawal
    withdrawalRate = gross / balanceStart
  }

  const balanceEnd = Math.max(0, (balanceStart - gross) * (1 + realReturn))
  return { ss, pension, spend, gross, netWithdrawal, taxes, shortage, withdrawalRate, balanceEnd }
}

export function simulateRetirement(p: RetirementInput): RetirementResult {
  const realReturn = realReturnOf(p)
  const retireAge = Math.max(p.currentAge, p.retirementAge)
  const endAge = Math.max(retireAge + 1, p.endAge)

  const series: RetirementYear[] = [
    { age: p.currentAge, balance: p.startingCapital, phase: 'accumulate', ss: 0, pension: 0, netWithdrawal: 0, taxes: 0, gross: 0, withdrawalRate: 0, shortage: 0, spend: 0 },
  ]
  let balance = p.startingCapital
  let balanceAtRetirement = p.startingCapital
  let depletedAge: number | null = null
  let lifetimeTaxes = 0

  for (let age = p.currentAge + 1; age <= endAge; age++) {
    if (age <= retireAge) {
      balance = (balance + p.monthlyContribution * 12) * (1 + realReturn)
      if (age === retireAge) balanceAtRetirement = balance
      series.push({ age, balance, phase: 'accumulate', ss: 0, pension: 0, netWithdrawal: 0, taxes: 0, gross: 0, withdrawalRate: 0, shortage: 0, spend: 0 })
    } else {
      const y = drawYear(p, age, retireAge, balance, realReturn)
      lifetimeTaxes += y.taxes
      if (y.balanceEnd <= 0 && depletedAge === null && balance > 0) depletedAge = age
      balance = y.balanceEnd
      series.push({ age, balance, phase: 'draw', ss: y.ss, pension: y.pension, netWithdrawal: y.netWithdrawal, taxes: y.taxes, gross: y.gross, withdrawalRate: y.withdrawalRate, shortage: y.shortage, spend: y.spend })
    }
  }

  const netSpending = Math.max(0, p.annualSpending - p.socialSecurityAnnual - p.pensionAnnual)
  const taxDiv = Math.max(0.05, 1 - p.taxRatePct / 100)
  const suggestedNestEgg = (netSpending / taxDiv) * 25
  const safeAnnualIncome = balanceAtRetirement * 0.04 + p.socialSecurityAnnual + p.pensionAnnual

  return {
    realReturnPct: realReturn * 100,
    balanceAtRetirement,
    endBalance: balance,
    depletedAge,
    lasts: depletedAge === null,
    suggestedNestEgg,
    safeAnnualIncome,
    lifetimeTaxes,
    series,
  }
}

// ─── Monte Carlo backtest ────────────────────────────────────────────
// ~95 years of annual market returns (large-cap US, approximate). We bootstrap-
// resample these to inject realistic volatility and sequence-of-returns risk,
// re-centering the mean to the user's return assumption so the expected path
// matches the deterministic projection.
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
  successRate: number // fraction of trials the portfolio lasts to endAge
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
  const retireAge = Math.max(p.currentAge, p.retirementAge)
  const endAge = Math.max(retireAge + 1, p.endAge)
  const nYears = endAge - p.currentAge

  const userReal = realReturnOf(p)
  const histMean = HISTORICAL_RETURNS.reduce((s, r) => s + r, 0) / HISTORICAL_RETURNS.length
  const histInfl = p.inflationPct / 100
  // Historical values are nominal-ish; convert to real then re-center to user's assumption.
  const shift = userReal - (histMean - histInfl)

  // Seeded PRNG so the result is stable for the same inputs (no flicker).
  let seed = 20260724 ^ Math.round(p.startingCapital + p.annualSpending * 7 + p.retirementAge * 101 + trials)
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }

  const balancesByYear: number[][] = Array.from({ length: nYears + 1 }, () => [])
  let successes = 0
  let worstDepletionAge: number | null = null

  for (let t = 0; t < trials; t++) {
    let balance = p.startingCapital
    balancesByYear[0].push(balance)
    let depletedAt: number | null = null

    for (let i = 1; i <= nYears; i++) {
      const age = p.currentAge + i
      const raw = HISTORICAL_RETURNS[Math.floor(rand() * HISTORICAL_RETURNS.length)]
      const r = raw - histInfl + shift // real return for the year
      if (age <= retireAge) {
        balance = (balance + p.monthlyContribution * 12) * (1 + r)
      } else {
        balance = drawYear(p, age, retireAge, balance, r).balanceEnd
        if (balance <= 0 && depletedAt === null) depletedAt = age
      }
      balancesByYear[i].push(Math.max(0, balance))
    }

    if (balance > 0) successes++
    if (depletedAt !== null) worstDepletionAge = worstDepletionAge === null ? depletedAt : Math.min(worstDepletionAge, depletedAt)
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

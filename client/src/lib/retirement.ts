// Retirement plan simulation: accumulate until retirement, then draw down while
// funding spending net of Social Security + pension, grossed up for taxes.
// Everything is computed in real (today's) dollars so figures stay intuitive.

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
  balance: number
  phase: 'accumulate' | 'draw'
  income: number // SS + pension that year
  withdrawal: number // gross portfolio withdrawal that year
}

export interface RetirementResult {
  realReturnPct: number
  balanceAtRetirement: number
  endBalance: number
  depletedAge: number | null // age the portfolio hits zero, or null if it lasts
  lasts: boolean
  suggestedNestEgg: number // 25× net spending (4% rule), grossed for tax
  safeAnnualIncome: number // 4% of retirement balance + guaranteed income
  series: RetirementYear[]
}

export function simulateRetirement(p: RetirementInput): RetirementResult {
  const realReturn = (1 + p.expectedReturnPct / 100) / (1 + p.inflationPct / 100) - 1
  const taxDiv = Math.max(0.05, 1 - p.taxRatePct / 100) // avoid div-by-zero at 100%

  const retireAge = Math.max(p.currentAge, p.retirementAge)
  const endAge = Math.max(retireAge + 1, p.endAge)

  const series: RetirementYear[] = [
    { age: p.currentAge, balance: p.startingCapital, phase: 'accumulate', income: 0, withdrawal: 0 },
  ]
  let balance = p.startingCapital
  let balanceAtRetirement = p.startingCapital
  let depletedAge: number | null = null

  for (let age = p.currentAge + 1; age <= endAge; age++) {
    if (age <= retireAge) {
      // Accumulation: contribute, then grow.
      balance = balance + p.monthlyContribution * 12
      balance *= 1 + realReturn
      if (age === retireAge) balanceAtRetirement = balance
      series.push({ age, balance: Math.max(0, balance), phase: 'accumulate', income: 0, withdrawal: 0 })
    } else {
      // Drawdown: spend (incl. early-retirement vacation budget), offset by
      // guaranteed income, gross the shortfall up for taxes, then grow.
      const income =
        (age >= p.ssStartAge ? p.socialSecurityAnnual : 0) +
        (age >= p.pensionStartAge ? p.pensionAnnual : 0)
      const spend = p.annualSpending + (age <= retireAge + p.vacationYears ? p.vacationBudget : 0)
      const net = Math.max(0, spend - income)
      const withdrawal = net / taxDiv
      balance = (balance - withdrawal) * (1 + realReturn)
      if (balance <= 0 && depletedAge === null) {
        depletedAge = age
        balance = 0
      }
      series.push({ age, balance: Math.max(0, balance), phase: 'draw', income, withdrawal })
    }
  }

  // Suggested nest egg via the 4% rule on spending net of guaranteed income.
  const netSpending = Math.max(0, p.annualSpending - p.socialSecurityAnnual - p.pensionAnnual)
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
    series,
  }
}

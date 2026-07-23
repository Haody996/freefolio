// Early-retirement (FIRE) projection math.
//
// The "FIRE number" is the portfolio size at which a safe withdrawal rate covers
// annual expenses: number = annualExpenses / (withdrawalRate). At a 4% rate that's
// the familiar 25× expenses.
//
// We project the portfolio forward year by year in real (inflation-adjusted) terms:
// the real growth rate is (1 + nominalReturn) / (1 + inflation) − 1, so the FIRE
// number expressed in today's dollars stays fixed as the target.

export interface FireInput {
  currentAge: number
  retirementAge: number
  currentSavings: number
  annualContribution: number
  annualExpenses: number
  expectedReturnPct: number
  inflationPct: number
  withdrawalRatePct: number
}

export interface FireYear {
  age: number
  year: number
  balance: number // real dollars (today's purchasing power)
}

export interface FireResult {
  fireNumber: number
  realReturnPct: number
  // Age at which the portfolio first reaches the FIRE number, or null if not within
  // the projection horizon.
  fireAge: number | null
  yearsToFire: number | null
  // Projected balance (real dollars) at the target retirement age.
  balanceAtRetirement: number
  onTrack: boolean
  projection: FireYear[]
}

const MAX_PROJECTION_YEARS = 80

export function projectFire(input: FireInput): FireResult {
  const {
    currentAge,
    retirementAge,
    currentSavings,
    annualContribution,
    annualExpenses,
    expectedReturnPct,
    inflationPct,
    withdrawalRatePct,
  } = input

  const withdrawalRate = withdrawalRatePct / 100
  const fireNumber = withdrawalRate > 0 ? annualExpenses / withdrawalRate : Infinity

  // Real (inflation-adjusted) return so the projection is in today's dollars.
  const realReturn = (1 + expectedReturnPct / 100) / (1 + inflationPct / 100) - 1

  const projection: FireYear[] = []
  let balance = currentSavings
  let fireAge: number | null = null
  const startYear = new Date().getFullYear()

  projection.push({ age: currentAge, year: startYear, balance })
  if (balance >= fireNumber) fireAge = currentAge

  for (let i = 1; i <= MAX_PROJECTION_YEARS; i++) {
    const age = currentAge + i
    // Contribute, then grow. Once retired (past target age) stop contributing.
    if (age <= retirementAge) balance += annualContribution
    balance *= 1 + realReturn
    projection.push({ age, year: startYear + i, balance })

    if (fireAge === null && balance >= fireNumber) fireAge = age
    if (age >= 100) break
  }

  const retirementRow = projection.find((p) => p.age === retirementAge)
  const balanceAtRetirement = retirementRow?.balance ?? balance

  return {
    fireNumber,
    realReturnPct: realReturn * 100,
    fireAge,
    yearsToFire: fireAge === null ? null : fireAge - currentAge,
    balanceAtRetirement,
    onTrack: balanceAtRetirement >= fireNumber,
    projection,
  }
}

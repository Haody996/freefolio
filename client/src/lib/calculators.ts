// Math for the public FIRE and Coast FIRE calculators. All projections are in
// today's dollars using the real return (1 + nominal) / (1 + inflation) − 1.

export function realReturn(nominalPct: number, inflationPct: number): number {
  return (1 + nominalPct / 100) / (1 + inflationPct / 100) - 1
}

export function fireNumber(annualExpenses: number, withdrawalRatePct: number): number {
  return withdrawalRatePct > 0 ? annualExpenses / (withdrawalRatePct / 100) : Infinity
}

export interface FireInput {
  currentAge: number
  annualExpenses: number
  currentSavings: number
  monthlySavings: number
  expectedReturnPct: number
  inflationPct: number
  withdrawalRatePct: number
}

export interface FireResult {
  fireNumber: number
  realReturnPct: number
  monthsToFire: number | null // null → not within 70 years
  fireAge: number | null
  balances: number[] // yearly, index 0 = today
  ages: number[]
  leanFire: number // 70% of expenses
  fatFire: number // 150% of expenses
}

const MAX_YEARS = 70

// Month-by-month: contribute, then grow at the monthly real rate.
export function computeFire(p: FireInput): FireResult {
  const target = fireNumber(p.annualExpenses, p.withdrawalRatePct)
  const r = realReturn(p.expectedReturnPct, p.inflationPct)
  const rm = Math.pow(1 + r, 1 / 12) - 1
  let bal = p.currentSavings
  let monthsToFire: number | null = bal >= target ? 0 : null
  const balances = [bal]
  const ages = [p.currentAge]
  for (let m = 1; m <= MAX_YEARS * 12; m++) {
    bal = (bal + p.monthlySavings) * (1 + rm)
    if (monthsToFire == null && bal >= target) monthsToFire = m
    if (m % 12 === 0) {
      balances.push(bal)
      ages.push(p.currentAge + m / 12)
      if (monthsToFire != null && m / 12 >= Math.ceil(monthsToFire / 12) + 5) break
    }
  }
  return {
    fireNumber: target,
    realReturnPct: r * 100,
    monthsToFire,
    fireAge: monthsToFire == null ? null : p.currentAge + monthsToFire / 12,
    balances,
    ages,
    leanFire: fireNumber(p.annualExpenses * 0.7, p.withdrawalRatePct),
    fatFire: fireNumber(p.annualExpenses * 1.5, p.withdrawalRatePct),
  }
}

export interface CoastInput {
  currentAge: number
  retirementAge: number
  annualExpenses: number
  currentSavings: number
  monthlySavings: number
  expectedReturnPct: number
  inflationPct: number
  withdrawalRatePct: number
}

export interface CoastResult {
  fireNumber: number
  coastNumber: number // needed today to coast to the FIRE number by retirement
  reached: boolean
  gap: number // coastNumber − currentSavings (≤ 0 when reached)
  coastAge: number | null // age you reach Coast FIRE if you keep saving
  projectedAtRetirement: number // if you stop saving today
  ages: number[]
  required: number[] // coast number needed at each age
  projected: number[] // balance with continued saving
}

export function computeCoast(p: CoastInput): CoastResult {
  const target = fireNumber(p.annualExpenses, p.withdrawalRatePct)
  const r = realReturn(p.expectedReturnPct, p.inflationPct)
  const years = Math.max(0, p.retirementAge - p.currentAge)
  const requiredAt = (age: number) => target / Math.pow(1 + r, Math.max(0, p.retirementAge - age))
  const coastNumber = requiredAt(p.currentAge)

  const rm = Math.pow(1 + r, 1 / 12) - 1
  const ages: number[] = [p.currentAge]
  const required: number[] = [coastNumber]
  const projected: number[] = [p.currentSavings]
  let bal = p.currentSavings
  let coastAge: number | null = bal >= coastNumber ? p.currentAge : null
  for (let m = 1; m <= years * 12; m++) {
    bal = (bal + p.monthlySavings) * (1 + rm)
    const age = p.currentAge + m / 12
    if (coastAge == null && bal >= requiredAt(age)) coastAge = age
    if (m % 12 === 0) {
      ages.push(age)
      required.push(requiredAt(age))
      projected.push(bal)
    }
  }
  return {
    fireNumber: target,
    coastNumber,
    reached: p.currentSavings >= coastNumber,
    gap: coastNumber - p.currentSavings,
    coastAge,
    projectedAtRetirement: p.currentSavings * Math.pow(1 + r, years),
    ages,
    required,
    projected,
  }
}

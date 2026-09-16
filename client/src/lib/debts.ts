// Debt payoff planning: avalanche (highest APR first) vs snowball (smallest
// balance first). Each month every debt accrues interest and gets its minimum
// payment; the rest of the budget — the extra payment plus minimums freed up by
// paid-off debts — goes to the target debt. Minimum-only is the baseline.

export type DebtStrategy = 'AVALANCHE' | 'SNOWBALL'

export interface DebtInput {
  id: string
  name: string
  balance: number
  ratePct: number // APR
  minPayment: number // monthly
}

export interface DebtPayoff {
  id: string
  name: string
  month: number | null // months from now until paid off (null → not within horizon)
  interest: number
}

export interface PayoffPlan {
  strategy: DebtStrategy | 'MINIMUM'
  months: number | null // until debt-free (null → never within horizon)
  totalInterest: number
  totalPaid: number
  order: DebtPayoff[] // in payoff order
  balances: number[] // total balance at the start of each month (index 0 = today)
  payments: number[] // total paid in each month
}

export const MAX_MONTHS = 600 // 50 years

export function simulatePayoff(debts: DebtInput[], strategy: DebtStrategy | 'MINIMUM', extraMonthly = 0): PayoffPlan {
  const ds = debts.filter((d) => d.balance > 0.005).map((d) => ({ ...d, bal: d.balance, interest: 0, paidMonth: null as number | null }))
  const budget = ds.reduce((s, d) => s + d.minPayment, 0) + (strategy === 'MINIMUM' ? 0 : Math.max(0, extraMonthly))
  const balances = [ds.reduce((s, d) => s + d.bal, 0)]
  const payments: number[] = []
  let totalInterest = 0
  let totalPaid = 0
  let month = 0

  while (ds.some((d) => d.bal > 0.005) && month < MAX_MONTHS) {
    month++
    for (const d of ds) {
      if (d.bal <= 0.005) continue
      const i = d.bal * (d.ratePct / 100 / 12)
      d.bal += i
      d.interest += i
      totalInterest += i
    }

    let paidThisMonth = 0
    let left = budget
    // Minimums first (minimum-only plans don't roll freed payments over).
    for (const d of ds) {
      if (d.bal <= 0.005) continue
      const pay = Math.min(d.minPayment, d.bal, strategy === 'MINIMUM' ? Infinity : left)
      d.bal -= pay
      left -= pay
      paidThisMonth += pay
    }
    if (strategy !== 'MINIMUM') {
      const targets = ds
        .filter((d) => d.bal > 0.005)
        .sort((a, b) => (strategy === 'AVALANCHE' ? b.ratePct - a.ratePct || a.bal - b.bal : a.bal - b.bal || b.ratePct - a.ratePct))
      for (const d of targets) {
        if (left <= 0.005) break
        const pay = Math.min(left, d.bal)
        d.bal -= pay
        left -= pay
        paidThisMonth += pay
      }
    }
    for (const d of ds) if (d.bal <= 0.005 && d.paidMonth == null) d.paidMonth = month
    totalPaid += paidThisMonth
    payments.push(paidThisMonth)
    balances.push(ds.reduce((s, d) => s + Math.max(0, d.bal), 0))

    // Payments that don't cover interest never finish — stop early.
    if (month >= 24 && balances[month] >= balances[month - 12] - 0.005) break
  }

  const done = ds.every((d) => d.bal <= 0.005)
  return {
    strategy,
    months: done ? month : null,
    totalInterest,
    totalPaid,
    order: [...ds]
      .sort((a, b) => (a.paidMonth ?? Infinity) - (b.paidMonth ?? Infinity))
      .map((d) => ({ id: d.id, name: d.name, month: d.paidMonth, interest: d.interest })),
    balances,
    payments,
  }
}

// Annual debt payments (nominal) for each year from now, from a monthly plan.
export function annualPayments(plan: PayoffPlan): number[] {
  const years: number[] = []
  plan.payments.forEach((p, m) => {
    const y = Math.floor(m / 12)
    years[y] = (years[y] ?? 0) + p
  })
  return years
}

export function monthsLabel(months: number | null): string {
  if (months == null) return 'Never (payments too low)'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y === 0) return `${m} mo`
  return m === 0 ? `${y} yr` : `${y} yr ${m} mo`
}

export function payoffDate(months: number | null, from = new Date()): string {
  if (months == null) return '—'
  const d = new Date(from.getFullYear(), from.getMonth() + months, 1)
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

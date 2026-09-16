import prisma from './prisma'
import { getHistory, assetTypeForCategory, mapLimit, HistPoint } from './prices'
import { Transaction } from '@prisma/client'

// Investment performance for market-priced holdings over the trailing year.
//
// Time-weighted return (TWR) chains daily returns computed from price changes
// on the quantities held at the start of each day, so deposits, withdrawals and
// auto-invest contributions don't count as growth. Money-weighted return (MWR)
// solves for the rate (XIRR) that equates the starting value + logged buys/sells
// with the ending value, so it reflects the timing of your own contributions.
//
// Quantities before today are reconstructed by undoing logged transactions;
// shares entered without transactions are assumed held for the whole window.
// Prices are dividend-adjusted closes, so both returns include dividends.

const DAY = 86_400_000
export const PERIODS = ['1M', '3M', 'YTD', '1Y'] as const
export type Period = (typeof PERIODS)[number]

export const BENCHMARKS: Record<string, string> = {
  SPY: 'S&P 500 (SPY)',
  VTI: 'Total US Market (VTI)',
  QQQ: 'Nasdaq 100 (QQQ)',
  VT: 'Total World (VT)',
}

export interface PeriodReturn {
  period: Period
  startDate: string
  twr: number | null
  mwr: number | null // period (not annualized) money-weighted return
  benchmark: number | null
  startValue: number
  endValue: number
  netContributions: number // buys − sells logged within the period
  gain: number // endValue − startValue − netContributions
}

export interface PerformanceReport {
  benchmark: { symbol: string; label: string }
  asOf: string
  series: { date: string; portfolio: number; benchmark: number | null; value: number }[]
  periods: PeriodReturn[]
  included: number // holdings with price history
  excluded: string[] // symbols without history (not in the numbers)
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function periodStart(p: Period, now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (p === '1M') d.setUTCMonth(d.getUTCMonth() - 1)
  else if (p === '3M') d.setUTCMonth(d.getUTCMonth() - 3)
  else if (p === '1Y') d.setUTCFullYear(d.getUTCFullYear() - 1)
  else return new Date(Date.UTC(now.getUTCFullYear() - 1, 11, 31)) // YTD: from last year's close
  return d
}

// Carry-forward price lookup over a sorted history. Dates before the series
// starts take its first price (providers' 1-year windows start a day or two
// apart), so starting values are complete; those days show a zero return.
function priceSeries(hist: HistPoint[], dates: string[]): (number | null)[] {
  const out: (number | null)[] = []
  let j = 0
  let last: number | null = hist.length ? hist[0].price : null
  for (const d of dates) {
    while (j < hist.length && hist[j].date <= d) last = hist[j++].price
    out.push(last)
  }
  return out
}

// XIRR via Newton's method with a bisection fallback. Flows: negative = money
// in, positive = money out. Returns the annualized rate or null.
export function xirr(flows: { date: Date; amount: number }[]): number | null {
  if (flows.length < 2) return null
  if (!flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null
  const t0 = flows[0].date.getTime()
  const years = flows.map((f) => (f.date.getTime() - t0) / (365 * DAY))
  const npv = (r: number) => flows.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, years[i]), 0)
  const dnpv = (r: number) => flows.reduce((s, f, i) => s - (years[i] * f.amount) / Math.pow(1 + r, years[i] + 1), 0)

  let r = 0.1
  for (let i = 0; i < 50; i++) {
    const v = npv(r)
    const d = dnpv(r)
    if (!isFinite(v) || !isFinite(d) || d === 0) break
    const next = r - v / d
    if (next <= -0.9999 || !isFinite(next)) break
    if (Math.abs(next - r) < 1e-9) return next
    r = next
  }
  // Bisection on a wide bracket.
  let lo = -0.9999
  let hi = 100
  let flo = npv(lo)
  const fhi = npv(hi)
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const fm = npv(mid)
    if (Math.abs(fm) < 1e-7) return mid
    if (flo * fm < 0) hi = mid
    else {
      lo = mid
      flo = fm
    }
  }
  return (lo + hi) / 2
}

export async function computePerformance(userId: string, benchmarkSymbol = 'SPY', now: Date = new Date()): Promise<PerformanceReport> {
  const bench = BENCHMARKS[benchmarkSymbol.toUpperCase()] ? benchmarkSymbol.toUpperCase() : 'SPY'
  const allHoldings = await prisma.holding.findMany({ where: { userId } })
  // Market-priced positions, including fully sold ones (their trades still count).
  const holdings = allHoldings.filter((h) => assetTypeForCategory(h.category) != null)
  const txs = await prisma.transaction.findMany({ where: { userId, holdingId: { in: holdings.map((h) => h.id) } } })

  const [histories, benchHist] = await Promise.all([
    mapLimit(holdings, 4, (h) => getHistory(h.symbol, assetTypeForCategory(h.category)!, 370, { providerId: h.providerId, adjusted: true })),
    getHistory(bench, 'STOCK', 370, { adjusted: true }),
  ])

  const included = holdings.map((h, i) => ({ h, hist: histories[i] })).filter((x) => x.hist.length > 0)
  const excluded = holdings.filter((_h, i) => histories[i].length === 0).map((h) => h.symbol)

  const windowStart = iso(periodStart('1Y', now))
  const dateSet = new Set<string>()
  for (const { hist } of included) for (const p of hist) if (p.date >= windowStart) dateSet.add(p.date)
  for (const p of benchHist) if (p.date >= windowStart) dateSet.add(p.date)
  // Anchor the window at the last price on/before the 1Y start so returns span the full year.
  const anchor = [...included.flatMap((x) => x.hist), ...benchHist].filter((p) => p.date < windowStart).map((p) => p.date).sort().pop()
  if (anchor) dateSet.add(anchor)
  const dates = [...dateSet].sort()

  const empty: PerformanceReport = {
    benchmark: { symbol: bench, label: BENCHMARKS[bench] },
    asOf: iso(now),
    series: [],
    periods: [],
    included: included.length,
    excluded,
  }
  if (dates.length < 2) return empty

  // Quantity held at the END of each date: current quantity minus the net
  // effect of transactions dated after it.
  const txByHolding = new Map<string, Transaction[]>()
  for (const t of txs) txByHolding.set(t.holdingId, [...(txByHolding.get(t.holdingId) ?? []), t])
  const qtyAt = included.map(({ h }) => {
    const list = (txByHolding.get(h.id) ?? []).map((t) => ({ day: iso(t.date), delta: t.type === 'BUY' ? t.quantity : -t.quantity }))
    return dates.map((d) => Math.max(0, h.quantity - list.filter((t) => t.day > d).reduce((s, t) => s + t.delta, 0)))
  })
  const prices = included.map(({ hist }) => priceSeries(hist, dates))
  const benchPrices = priceSeries(benchHist, dates)

  const values = dates.map((_d, t) => included.reduce((s, _x, i) => s + (prices[i][t] ?? 0) * qtyAt[i][t], 0))
  const index: number[] = [1]
  for (let t = 1; t < dates.length; t++) {
    let base = 0
    let pnl = 0
    for (let i = 0; i < included.length; i++) {
      const p0 = prices[i][t - 1]
      const p1 = prices[i][t]
      if (p0 == null || p1 == null) continue
      const q = qtyAt[i][t - 1]
      base += q * p0
      pnl += q * (p1 - p0)
    }
    index.push(index[t - 1] * (1 + (base > 0 ? pnl / base : 0)))
  }

  const firstBench = benchPrices.find((p) => p != null) ?? null
  const series = dates.map((date, t) => ({
    date,
    portfolio: index[t],
    benchmark: firstBench != null && benchPrices[t] != null ? benchPrices[t]! / firstBench : null,
    value: values[t],
  }))

  const periods: PeriodReturn[] = PERIODS.map((p) => {
    const start = iso(periodStart(p, now))
    let s = 0
    for (let t = 0; t < dates.length; t++) if (dates[t] <= start) s = t
    const e = dates.length - 1
    const startValue = values[s]
    const endValue = values[e]

    const inWindow = txs.filter((t) => {
      const d = iso(t.date)
      return d > dates[s] && d <= dates[e] && included.some((x) => x.h.id === t.holdingId)
    })
    const netContributions = inWindow.reduce((sum, t) => sum + (t.type === 'BUY' ? t.amount : -t.amount), 0)

    const flows = [
      { date: new Date(dates[s] + 'T00:00:00Z'), amount: -startValue },
      ...inWindow.map((t) => ({ date: t.date, amount: t.type === 'BUY' ? -t.amount : t.amount })),
      { date: new Date(dates[e] + 'T00:00:00Z'), amount: endValue },
    ].sort((a, b) => a.date.getTime() - b.date.getTime())
    const annual = startValue > 0 || inWindow.length ? xirr(flows) : null
    const spanYears = (new Date(dates[e]).getTime() - new Date(dates[s]).getTime()) / (365 * DAY)
    const mwr = annual != null ? Math.pow(1 + annual, spanYears) - 1 : null

    const b0 = benchPrices[s]
    const b1 = benchPrices[e]
    return {
      period: p,
      startDate: dates[s],
      twr: index[e] / index[s] - 1,
      mwr,
      benchmark: b0 != null && b1 != null ? b1 / b0 - 1 : null,
      startValue,
      endValue,
      netContributions,
      gain: endValue - startValue - netContributions,
    }
  })

  return { ...empty, series, periods }
}

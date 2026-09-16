import prisma from './prisma'
import { getHistory, getIntraday, assetTypeForCategory, mapLimit } from './prices'
import { NON_INVESTABLE, isEstimated, estimateValue } from './assets'

export interface Balances {
  assets: number
  liabilities: number
  netWorth: number
  investable: number // assets excluding real estate & vehicles
}

// Net worth = Σ holding market values (quantity × price) − Σ debt balances.
export async function computeBalances(userId: string): Promise<Balances> {
  const [holdings, liabilities] = await Promise.all([
    prisma.holding.findMany({ where: { userId }, select: { quantity: true, price: true, category: true } }),
    prisma.liability.findMany({ where: { userId }, select: { balance: true } }),
  ])
  let assets = 0
  let investable = 0
  for (const h of holdings) {
    const v = h.quantity * h.price
    assets += v
    if (!NON_INVESTABLE.includes(h.category)) investable += v
  }
  const debt = liabilities.reduce((s, l) => s + l.balance, 0)
  return { assets, liabilities: debt, netWorth: assets - debt, investable }
}

export async function computeNetWorth(userId: string): Promise<number> {
  return (await computeBalances(userId)).netWorth
}

// Reconstruct REAL daily net-worth history from actual market prices for the
// user's *current* holdings (quantities assumed constant over the window), then
// upsert one snapshot per day. Cash/Other holdings and debts are held flat at
// their current values; estimated real estate/vehicles follow their
// appreciation curve.
export async function backfillHistory(userId: string, days = 365): Promise<number> {
  const [holdings, liabilities] = await Promise.all([
    prisma.holding.findMany({ where: { userId } }),
    prisma.liability.findMany({ where: { userId }, select: { balance: true } }),
  ])
  if (holdings.length === 0) return 0

  // Flat contribution from manual (cash/other) holdings, minus debts.
  let flatValue = -liabilities.reduce((s, l) => s + l.balance, 0)
  const estimated = holdings.filter(isEstimated)
  const priced: { quantity: number; series: Map<string, number> }[] = []

  const histories = await mapLimit(holdings, 4, async (h) => {
    const assetType = assetTypeForCategory(h.category)
    if (!assetType) return null
    return getHistory(h.symbol, assetType, days, { providerId: h.providerId })
  })

  holdings.forEach((h, i) => {
    if (isEstimated(h)) return
    const hist = histories[i]
    if (!hist || hist.length === 0) {
      // Manual, or no history available — treat as flat at current price so it still counts.
      flatValue += h.quantity * h.price
      return
    }
    priced.push({ quantity: h.quantity, series: new Map(hist.map((p) => [p.date, p.price])) })
  })

  // Union of all dates we have any price for.
  const dateSet = new Set<string>()
  priced.forEach((p) => p.series.forEach((_v, d) => dateSet.add(d)))
  const dates = [...dateSet].sort()
  if (dates.length === 0) return 0

  // For each date, value each priced holding at its last-known price on/before
  // that date (carry-forward), plus the flat manual value.
  const lastPrice = new Map<number, number>() // index in `priced` → last seen price
  let written = 0

  for (const date of dates) {
    const d = new Date(date + 'T00:00:00.000Z')
    let total = flatValue
    priced.forEach((p, i) => {
      const px = p.series.get(date)
      if (px != null) lastPrice.set(i, px)
      const use = lastPrice.get(i)
      if (use != null) total += p.quantity * use
    })
    for (const h of estimated) {
      total += h.quantity * estimateValue(h.openingCostPerShare!, h.openingAcquiredAt!, h.appreciationPct!, d)
    }

    await prisma.netWorthSnapshot.upsert({
      where: { userId_date: { userId, date: d } },
      create: { userId, date: d, netWorth: total },
      update: { netWorth: total },
    })
    written++
  }
  return written
}

// Compute net worth and upsert today's snapshot (idempotent per user per day).
export async function snapshotNetWorth(userId: string): Promise<number> {
  const netWorth = await computeNetWorth(userId)

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  await prisma.netWorthSnapshot.upsert({
    where: { userId_date: { userId, date: today } },
    create: { userId, date: today, netWorth },
    update: { netWorth },
  })
  return netWorth
}

// ─── Intraday (1-day chart) ──────────────────────────────────────────

const STEP = 5 * 60 * 1000
const MAX_LOOKBACK = 4 * 86_400_000

// Net worth through the current day on a 5-minute grid, reconciled with the
// dashboard's "today" change: it starts at Σ quantity × previous close − debts
// and ends at the live net worth. Market-priced holdings follow their intraday
// prices (holding at the previous close until their session's first bar); other
// assets move linearly from previous close to current value; debts are flat.
// The window runs from the earliest bar — so over a weekend it spans back to the
// last stock session, matching what "today" compares against.
export async function intradayNetWorth(userId: string, now: Date = new Date()): Promise<{ t: number; netWorth: number }[]> {
  const [holdings, liabilities] = await Promise.all([
    prisma.holding.findMany({ where: { userId } }),
    prisma.liability.findMany({ where: { userId }, select: { balance: true } }),
  ])
  const debt = liabilities.reduce((s, l) => s + l.balance, 0)
  const end = now.getTime()

  const priced = holdings.filter((h) => h.quantity > 0 && assetTypeForCategory(h.category) && !isEstimated(h))
  const series = await mapLimit(priced, 4, async (h) =>
    (await getIntraday(h.symbol, assetTypeForCategory(h.category)!, h.providerId)).filter((p) => p.t <= end && p.t >= end - MAX_LOOKBACK)
  )
  const withData = new Map(priced.map((h, i) => [h.id, series[i]]).filter(([, pts]) => (pts as unknown[]).length > 0) as [string, { t: number; price: number }[]][])

  const firstBar = Math.min(...[...withData.values()].map((pts) => pts[0].t))
  const start = isFinite(firstBar) ? Math.floor(firstBar / STEP) * STEP - STEP : end - 86_400_000

  const grid = new Set<number>()
  for (const pts of withData.values()) for (const p of pts) grid.add(Math.floor(p.t / STEP) * STEP)
  const times = [start, ...[...grid].filter((t) => t > start && t < end).sort((a, b) => a - b), end]

  const cursor = new Map<string, number>()
  return times.map((t, k) => {
    const last = k === times.length - 1
    const frac = end > start ? (t - start) / (end - start) : 1
    let total = -debt
    for (const h of holdings) {
      const pts = withData.get(h.id)
      if (last) {
        total += h.quantity * h.price
      } else if (k === 0) {
        total += h.quantity * h.prevClose
      } else if (pts) {
        let j = cursor.get(h.id) ?? -1
        while (j + 1 < pts.length && pts[j + 1].t < t + STEP) j++
        cursor.set(h.id, j)
        total += h.quantity * (j >= 0 ? pts[j].price : h.prevClose)
      } else {
        total += h.quantity * (h.prevClose + (h.price - h.prevClose) * frac)
      }
    }
    return { t, netWorth: total }
  })
}

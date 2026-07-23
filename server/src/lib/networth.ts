import prisma from './prisma'
import { getHistory, AssetTypeLike } from './prices'
import { Category } from '@prisma/client'

// Net worth is simply the sum of holding market values (quantity × price).
export async function computeNetWorth(userId: string): Promise<number> {
  const holdings = await prisma.holding.findMany({ where: { userId } })
  return holdings.reduce((sum, h) => sum + h.quantity * h.price, 0)
}

// Which categories have fetchable market history, and how to route them.
function historyAssetType(cat: Category): AssetTypeLike | null {
  if (cat === 'CRYPTO') return 'CRYPTO'
  if (cat === 'STOCKS' || cat === 'BONDS') return 'STOCK'
  return null // CASH / OTHER are manual — held flat at current value
}

// Reconstruct REAL daily net-worth history from actual market prices for the
// user's *current* holdings (quantities assumed constant over the window — we
// don't have historical transactions), then upsert one snapshot per day.
// Cash/Other holdings are held flat at their current value.
export async function backfillHistory(userId: string, days = 365): Promise<number> {
  const holdings = await prisma.holding.findMany({ where: { userId } })
  if (holdings.length === 0) return 0

  // Flat contribution from manual (cash/other) holdings.
  let flatValue = 0
  const priced: { quantity: number; series: Map<string, number> }[] = []

  for (const h of holdings) {
    const assetType = historyAssetType(h.category)
    if (!assetType) {
      flatValue += h.quantity * h.price
      continue
    }
    const hist = await getHistory(h.symbol, assetType, days)
    if (hist.length === 0) {
      // No history available — treat as flat at current price so it still counts.
      flatValue += h.quantity * h.price
      continue
    }
    priced.push({ quantity: h.quantity, series: new Map(hist.map((p) => [p.date, p.price])) })
  }

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
    let total = flatValue
    priced.forEach((p, i) => {
      const px = p.series.get(date)
      if (px != null) lastPrice.set(i, px)
      const use = lastPrice.get(i)
      if (use != null) total += p.quantity * use
    })

    const d = new Date(date + 'T00:00:00.000Z')
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

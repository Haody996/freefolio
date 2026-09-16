import { Category, Holding } from '@prisma/client'

const YEAR_MS = 365.25 * 86_400_000

// Illiquid assets count toward net worth but not toward investable assets
// (retirement starting capital, FIRE progress).
export const NON_INVESTABLE: Category[] = ['REAL_ESTATE', 'VEHICLE']

// Categories with lot-level cost basis and gains (market-priced securities).
export const GAIN_CATEGORIES: Category[] = ['STOCKS', 'CRYPTO', 'BONDS', 'METALS']

type EstimateFields = Pick<Holding, 'category' | 'appreciationPct' | 'openingCostPerShare' | 'openingAcquiredAt'>

// Real estate / vehicles with a purchase price, purchase date and an annual
// appreciation (or depreciation) rate are valued by compounding from purchase.
export function isEstimated(h: EstimateFields): boolean {
  return (
    (h.category === 'REAL_ESTATE' || h.category === 'VEHICLE') &&
    h.appreciationPct != null &&
    h.openingCostPerShare != null &&
    h.openingAcquiredAt != null
  )
}

export function estimateValue(cost: number, acquiredAt: Date, ratePct: number, at: Date = new Date()): number {
  const years = Math.max(0, (at.getTime() - acquiredAt.getTime()) / YEAR_MS)
  return cost * Math.pow(1 + ratePct / 100, years)
}

// Current estimate + yesterday's (so the day-change column stays meaningful).
export function estimatedPrices(h: EstimateFields, now: Date = new Date()): { price: number; prevClose: number } | null {
  if (!isEstimated(h)) return null
  const price = estimateValue(h.openingCostPerShare!, h.openingAcquiredAt!, h.appreciationPct!, now)
  const prevClose = estimateValue(h.openingCostPerShare!, h.openingAcquiredAt!, h.appreciationPct!, new Date(now.getTime() - 86_400_000))
  return { price, prevClose }
}

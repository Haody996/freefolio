// Response shapes for the server's gains and performance reports.
import type { AccountType, Category } from './portfolio'

export type Term = 'SHORT' | 'LONG' | 'UNKNOWN'

export interface HoldingGains {
  holdingId: string
  symbol: string
  name: string
  category: Category
  accountType: AccountType
  institution: string
  quantity: number
  price: number
  value: number
  basisStatus: 'FULL' | 'PARTIAL' | 'NONE'
  knownQty: number
  costBasis: number
  avgCost: number | null
  unrealized: number | null
  unrealizedPct: number | null
  shortTermUnrealized: number
  longTermUnrealized: number
  openingQty: number
}

export interface RealizedEvent {
  holdingId: string
  symbol: string
  accountType: AccountType
  institution: string
  date: string
  qty: number
  proceeds: number
  cost: number | null
  gain: number | null
  term: Term
}

export interface HarvestCandidate {
  holdingId: string
  symbol: string
  name: string
  category: Category
  accountType: AccountType
  institution: string
  harvestableLoss: number
  lossPct: number
  qtyAtLoss: number
  shortTermLoss: number
  longTermLoss: number
  washSaleRisk: string | null
  replacements?: Replacement[] // similar funds to hold during the 30-day window
  replacementNote?: string
}

export interface GainsReport {
  holdings: HoldingGains[]
  realized: RealizedEvent[]
  harvest: HarvestCandidate[]
}

export type Period = '1M' | '3M' | 'YTD' | '1Y'

export interface PeriodReturn {
  period: Period
  startDate: string
  twr: number | null
  mwr: number | null
  benchmark: number | null
  startValue: number
  endValue: number
  netContributions: number
  gain: number
}

export interface PerformanceReport {
  benchmark: { symbol: string; label: string }
  benchmarks: { symbol: string; label: string }[]
  asOf: string
  series: { date: string; portfolio: number; benchmark: number | null; value: number }[]
  periods: PeriodReturn[]
  included: number
  excluded: string[]
}

// ─── Tax planner (/api/tax-insights) ─────────────────────────────────

export interface Replacement {
  symbol: string
  name: string
  tracks: string
}

export type TaxClass = 'BOND' | 'MUNI' | 'REIT' | 'HIGH_YIELD' | 'INTERNATIONAL' | 'BROAD_INDEX' | 'GROWTH' | 'COLLECTIBLE' | 'CASH' | 'OTHER'
export type TaxBucket = 'TAXABLE' | 'DEFERRED' | 'FREE'

export interface LocationFinding {
  severity: 'high' | 'medium' | 'low' | 'info' | 'good'
  title: string
  detail: string
  amount: number
  symbols: string[]
}

export interface LadderYear {
  age: number
  otherIncome: number
  conversion: number
  tax: number
  balance: number
  balanceNoLadder: number
}

export interface Ladder {
  applicable: boolean
  reason?: string
  startAge: number
  endAge: number
  years: LadderYear[]
  totalConverted: number
  totalTax: number
  avgRate: number
  balanceAtStart: number
  rmdAt73: { withLadder: number; withoutLadder: number; bracketWith: number; bracketWithout: number }
  penaltyFreeFromAge: number | null
}

export type FilingStatus = 'SINGLE' | 'MARRIED_JOINT'

export interface TaxInsights {
  assetLocation: { buckets: Record<TaxBucket, Partial<Record<TaxClass, number>>>; findings: LocationFinding[] }
  rothLadder: Ladder
  harvest: (HarvestCandidate & { replacements: Replacement[]; replacementNote: string })[]
  settings: { filingStatus: FilingStatus; rothTargetBracketPct: number; retirementAge: number; currentAge: number }
}

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

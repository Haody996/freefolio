import prisma from './prisma'
import { AccountType, Holding, Transaction } from '@prisma/client'
import { GAIN_CATEGORIES } from './assets'

const DAY = 86_400_000

// Holding period is long-term when an asset is held MORE than one year.
function termOf(acquiredAt: Date | null, soldAt: Date): Term {
  if (!acquiredAt) return 'UNKNOWN'
  const anniversary = new Date(acquiredAt)
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + 1)
  return soldAt.getTime() > anniversary.getTime() ? 'LONG' : 'SHORT'
}

export type Term = 'SHORT' | 'LONG' | 'UNKNOWN'

// Accounts whose gains are taxed as they're realized (matches the client's
// account → tax-treatment mapping, where OTHER is treated as taxable).
export function isTaxableAccount(a: AccountType): boolean {
  return a === 'TAXABLE' || a === 'OTHER'
}

export interface Lot {
  qty: number
  costPerShare: number | null // null → basis unknown
  acquiredAt: Date | null
  opening: boolean // shares not covered by logged buys
}

export interface RealizedEvent {
  holdingId: string
  symbol: string
  accountType: AccountType
  institution: string
  date: string // YYYY-MM-DD of the sale
  qty: number
  proceeds: number
  cost: number | null
  gain: number | null
  term: Term
}

// Rebuild a position's tax lots. Shares not explained by logged transactions
// (holding.quantity − (buys − sells)) form an "opening lot" at the holding's
// opening cost/date. Sells consume the earliest-acquired lots first (FIFO).
export function buildLots(h: Holding, txs: Transaction[]): { lots: Lot[]; realized: RealizedEvent[] } {
  const sorted = [...txs].sort((a, b) => a.date.getTime() - b.date.getTime())
  const trackedNet = sorted.reduce((s, t) => s + (t.type === 'BUY' ? t.quantity : -t.quantity), 0)
  const openingQty = h.quantity - trackedNet

  const lots: Lot[] = []
  if (openingQty > 1e-9) {
    lots.push({ qty: openingQty, costPerShare: h.openingCostPerShare, acquiredAt: h.openingAcquiredAt, opening: true })
  }
  const realized: RealizedEvent[] = []
  // Opening lot (unknown date) sorts first; otherwise by acquisition date.
  const fifo = (a: Lot, b: Lot) =>
    (a.acquiredAt?.getTime() ?? -Infinity) - (b.acquiredAt?.getTime() ?? -Infinity) || Number(b.opening) - Number(a.opening)

  for (const t of sorted) {
    if (t.type === 'BUY') {
      lots.push({ qty: t.quantity, costPerShare: t.price, acquiredAt: t.date, opening: false })
      continue
    }
    let remaining = t.quantity
    lots.sort(fifo)
    for (const lot of lots) {
      if (remaining <= 1e-9) break
      if (lot.qty <= 1e-9) continue
      const take = Math.min(lot.qty, remaining)
      lot.qty -= take
      remaining -= take
      const cost = lot.costPerShare != null ? take * lot.costPerShare : null
      realized.push({
        holdingId: h.id,
        symbol: h.symbol,
        accountType: h.accountType,
        institution: h.institution,
        date: t.date.toISOString().slice(0, 10),
        qty: take,
        proceeds: take * t.price,
        cost,
        gain: cost != null ? take * t.price - cost : null,
        term: termOf(lot.acquiredAt, t.date),
      })
    }
    if (remaining > 1e-9) {
      // Sold more than we have lots for — proceeds with unknown basis.
      realized.push({
        holdingId: h.id, symbol: h.symbol, accountType: h.accountType, institution: h.institution,
        date: t.date.toISOString().slice(0, 10), qty: remaining, proceeds: remaining * t.price, cost: null, gain: null, term: 'UNKNOWN',
      })
    }
  }

  // Quantity edited below what transactions explain: trim the oldest lots
  // (no realized gain — we don't know the sale price).
  if (openingQty < -1e-9) {
    let excess = -openingQty
    lots.sort(fifo)
    for (const lot of lots) {
      if (excess <= 1e-9) break
      const take = Math.min(lot.qty, excess)
      lot.qty -= take
      excess -= take
    }
  }

  return { lots: lots.filter((l) => l.qty > 1e-9), realized }
}

export interface HoldingGains {
  holdingId: string
  symbol: string
  name: string
  category: string
  accountType: AccountType
  institution: string
  quantity: number
  price: number
  value: number
  basisStatus: 'FULL' | 'PARTIAL' | 'NONE'
  knownQty: number
  costBasis: number // of known-basis shares
  avgCost: number | null
  unrealized: number | null // on known-basis shares
  unrealizedPct: number | null
  shortTermUnrealized: number
  longTermUnrealized: number
  openingQty: number // shares not covered by logged buys
}

export interface HarvestCandidate {
  holdingId: string
  symbol: string
  name: string
  category: string
  accountType: AccountType
  institution: string
  harvestableLoss: number // negative $
  lossPct: number // of the losing lots' cost
  qtyAtLoss: number
  shortTermLoss: number
  longTermLoss: number
  washSaleRisk: string | null // why selling now could trigger a wash sale
}

export interface GainsReport {
  holdings: HoldingGains[]
  realized: RealizedEvent[]
  harvest: HarvestCandidate[]
}

const HARVEST_MIN_LOSS = 100 // $
const HARVEST_MIN_PCT = 0.05

export async function computeGains(userId: string, now: Date = new Date()): Promise<GainsReport> {
  const [holdings, txs] = await Promise.all([
    prisma.holding.findMany({ where: { userId, category: { in: GAIN_CATEGORIES } }, orderBy: { createdAt: 'asc' } }),
    prisma.transaction.findMany({ where: { userId } }),
  ])
  const txByHolding = new Map<string, Transaction[]>()
  for (const t of txs) {
    const arr = txByHolding.get(t.holdingId) ?? []
    arr.push(t)
    txByHolding.set(t.holdingId, arr)
  }

  // Wash-sale window: a purchase of the same ticker (in ANY account, IRAs
  // included) within 30 days before — or a scheduled auto-invest within 30
  // days after — a loss sale disallows the loss.
  const recentBuyBySymbol = new Map<string, Date>()
  for (const t of txs) {
    if (t.type !== 'BUY' || now.getTime() - t.date.getTime() > 30 * DAY) continue
    const h = holdings.find((x) => x.id === t.holdingId)
    if (!h) continue
    const prev = recentBuyBySymbol.get(h.symbol)
    if (!prev || prev < t.date) recentBuyBySymbol.set(h.symbol, t.date)
  }
  const upcomingAutoBySymbol = new Set(
    holdings
      .filter((h) => h.autoAmount && h.autoNextAt && h.autoNextAt.getTime() - now.getTime() <= 30 * DAY)
      .map((h) => h.symbol)
  )

  const out: GainsReport = { holdings: [], realized: [], harvest: [] }

  for (const h of holdings) {
    const { lots, realized } = buildLots(h, txByHolding.get(h.id) ?? [])
    out.realized.push(...realized)

    let knownQty = 0
    let costBasis = 0
    let st = 0
    let lt = 0
    let lossQty = 0
    let lossCost = 0
    let lossSt = 0
    let lossLt = 0
    for (const lot of lots) {
      if (lot.costPerShare == null) continue
      knownQty += lot.qty
      const cost = lot.qty * lot.costPerShare
      costBasis += cost
      const gain = lot.qty * h.price - cost
      const term = termOf(lot.acquiredAt, now)
      if (term === 'SHORT') st += gain
      else lt += gain // unknown-date lots are grouped with long-term
      if (gain < 0) {
        lossQty += lot.qty
        lossCost += cost
        if (term === 'SHORT') lossSt += gain
        else lossLt += gain
      }
    }
    const openingQty = lots.filter((l) => l.opening).reduce((s, l) => s + l.qty, 0)
    const totalQty = lots.reduce((s, l) => s + l.qty, 0)
    const unrealized = knownQty > 0 ? knownQty * h.price - costBasis : null

    out.holdings.push({
      holdingId: h.id,
      symbol: h.symbol,
      name: h.name,
      category: h.category,
      accountType: h.accountType,
      institution: h.institution,
      quantity: h.quantity,
      price: h.price,
      value: h.quantity * h.price,
      basisStatus: totalQty <= 1e-9 || knownQty <= 1e-9 ? 'NONE' : knownQty >= totalQty - 1e-9 ? 'FULL' : 'PARTIAL',
      knownQty,
      costBasis,
      avgCost: knownQty > 0 ? costBasis / knownQty : null,
      unrealized,
      unrealizedPct: unrealized != null && costBasis > 0 ? unrealized / costBasis : null,
      shortTermUnrealized: st,
      longTermUnrealized: lt,
      openingQty,
    })

    const harvestable = lossSt + lossLt
    if (isTaxableAccount(h.accountType) && harvestable <= -HARVEST_MIN_LOSS && lossCost > 0 && -harvestable / lossCost >= HARVEST_MIN_PCT) {
      const lastBuy = recentBuyBySymbol.get(h.symbol)
      out.harvest.push({
        holdingId: h.id,
        symbol: h.symbol,
        name: h.name,
        category: h.category,
        accountType: h.accountType,
        institution: h.institution,
        harvestableLoss: harvestable,
        lossPct: harvestable / lossCost,
        qtyAtLoss: lossQty,
        shortTermLoss: lossSt,
        longTermLoss: lossLt,
        washSaleRisk: lastBuy
          ? `You bought ${h.symbol} on ${lastBuy.toISOString().slice(0, 10)} — selling at a loss within 30 days of a purchase is a wash sale.`
          : upcomingAutoBySymbol.has(h.symbol)
            ? `An auto-invest into ${h.symbol} is scheduled within 30 days — pause it or the loss may be disallowed as a wash sale.`
            : null,
      })
    }
  }

  out.realized.sort((a, b) => b.date.localeCompare(a.date))
  out.harvest.sort((a, b) => a.harvestableLoss - b.harvestableLoss)
  return out
}

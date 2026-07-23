import prisma from './prisma'

export interface AccountValue {
  accountId: string
  name: string
  kind: 'ASSET' | 'LIABILITY'
  category: string
  value: number
}

export interface NetWorth {
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  accounts: AccountValue[]
}

// Value an investment account from its holdings using the latest cached prices.
// Falls back to the account's most recent manual balance for anything not priced.
async function valueInvestmentAccount(accountId: string): Promise<number> {
  const holdings = await prisma.holding.findMany({ where: { accountId } })
  if (holdings.length === 0) {
    const latest = await prisma.balance.findFirst({
      where: { accountId },
      orderBy: { date: 'desc' },
    })
    return latest?.amount ?? 0
  }

  const quotes = await prisma.priceQuote.findMany({
    where: { symbol: { in: holdings.map((h) => h.symbol) } },
  })
  const priceBy = new Map(quotes.map((q) => [`${q.symbol}:${q.assetType}`, q.price]))

  let total = 0
  for (const h of holdings) {
    const price = priceBy.get(`${h.symbol}:${h.assetType}`)
    // Use market price when available, otherwise fall back to cost basis so the
    // holding still contributes something rather than silently reading as zero.
    if (price != null) total += h.quantity * price
    else if (h.costBasis != null) total += h.costBasis
  }
  return total
}

async function valueManualAccount(accountId: string): Promise<number> {
  const latest = await prisma.balance.findFirst({
    where: { accountId },
    orderBy: { date: 'desc' },
  })
  return latest?.amount ?? 0
}

// Compute a user's current net worth from live account values.
export async function computeNetWorth(userId: string): Promise<NetWorth> {
  const accounts = await prisma.account.findMany({
    where: { userId, isActive: true, includeInNetWorth: true },
  })

  const values: AccountValue[] = []
  for (const a of accounts) {
    const value = a.isInvestment
      ? await valueInvestmentAccount(a.id)
      : await valueManualAccount(a.id)
    values.push({ accountId: a.id, name: a.name, kind: a.kind, category: a.category, value })
  }

  const totalAssets = values
    .filter((v) => v.kind === 'ASSET')
    .reduce((s, v) => s + v.value, 0)
  const totalLiabilities = values
    .filter((v) => v.kind === 'LIABILITY')
    .reduce((s, v) => s + v.value, 0)

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
    accounts: values,
  }
}

// Compute net worth and upsert today's snapshot row (idempotent per user per day).
export async function snapshotNetWorth(userId: string): Promise<void> {
  const nw = await computeNetWorth(userId)

  // Normalize to a date-only value so @@unique([userId, date]) collapses same-day runs.
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  await prisma.netWorthSnapshot.upsert({
    where: { userId_date: { userId, date: today } },
    create: {
      userId,
      date: today,
      totalAssets: nw.totalAssets,
      totalLiabilities: nw.totalLiabilities,
      netWorth: nw.netWorth,
    },
    update: {
      totalAssets: nw.totalAssets,
      totalLiabilities: nw.totalLiabilities,
      netWorth: nw.netWorth,
    },
  })
}

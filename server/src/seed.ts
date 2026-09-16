import 'dotenv/config'
import bcrypt from 'bcryptjs'
import prisma from './lib/prisma'
import { Category, AccountType, LiabilityType } from '@prisma/client'
import { estimatedPrices } from './lib/assets'

// The design's seed holdings, spread across a few account types, plus
// illiquid assets and precious metals. openingCostPerShare / openingAcquiredAt
// give the demo realistic cost basis.
const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY)

const SEED_HOLDINGS: {
  symbol: string
  name: string
  category: Category
  accountType: AccountType
  quantity: number
  price: number
  prevClose: number
  openingCostPerShare?: number
  openingAcquiredAt?: Date
  providerId?: string
  appreciationPct?: number
}[] = [
  { symbol: 'NVDA', name: 'NVIDIA Corp', category: 'STOCKS', accountType: 'TAXABLE', quantity: 60, price: 178.3, prevClose: 171.2, openingCostPerShare: 92.4, openingAcquiredAt: ago(700) },
  { symbol: 'AAPL', name: 'Apple Inc', category: 'STOCKS', accountType: 'TAXABLE', quantity: 40, price: 244.1, prevClose: 246.5, openingCostPerShare: 262.0, openingAcquiredAt: ago(150) },
  { symbol: 'VTI', name: 'Vanguard Total Market', category: 'STOCKS', accountType: 'TRADITIONAL_401K', quantity: 18, price: 315.2, prevClose: 312.8, openingCostPerShare: 240, openingAcquiredAt: ago(1200) },
  { symbol: 'VXUS', name: 'Vanguard Intl Stock', category: 'STOCKS', accountType: 'ROTH_IRA', quantity: 50, price: 72.4, prevClose: 71.9 },
  { symbol: 'BTC', name: 'Bitcoin', category: 'CRYPTO', accountType: 'TAXABLE', quantity: 0.85, price: 118400, prevClose: 119000, openingCostPerShare: 61000, openingAcquiredAt: ago(500) },
  { symbol: 'ETH', name: 'Ethereum', category: 'CRYPTO', accountType: 'TAXABLE', quantity: 6.2, price: 4120, prevClose: 3980, openingCostPerShare: 4700, openingAcquiredAt: ago(200) },
  { symbol: 'PEPE', name: 'Pepe', category: 'CRYPTO', accountType: 'TAXABLE', quantity: 50_000_000, price: 0.00001, prevClose: 0.00001, providerId: 'pepe' },
  { symbol: 'BND', name: 'Vanguard Total Bond', category: 'BONDS', accountType: 'TRADITIONAL_IRA', quantity: 60, price: 71.8, prevClose: 71.6 },
  { symbol: 'XAU', name: 'Gold', category: 'METALS', accountType: 'TAXABLE', quantity: 5, price: 3600, prevClose: 3590, openingCostPerShare: 2400, openingAcquiredAt: ago(800) },
  { symbol: 'CASH', name: 'HYSA · Ally Bank', category: 'CASH', accountType: 'TAXABLE', quantity: 1, price: 14250, prevClose: 14250 },
  { symbol: 'RSU', name: 'Vested RSUs (manual)', category: 'OTHER', accountType: 'TAXABLE', quantity: 1, price: 8600, prevClose: 8600 },
  { symbol: 'HOME', name: '12 Maple St', category: 'REAL_ESTATE', accountType: 'OTHER', quantity: 1, price: 0, prevClose: 0, openingCostPerShare: 420000, openingAcquiredAt: ago(1500), appreciationPct: 3.5 },
  { symbol: 'CAR', name: 'Toyota RAV4', category: 'VEHICLE', accountType: 'OTHER', quantity: 1, price: 0, prevClose: 0, openingCostPerShare: 36000, openingAcquiredAt: ago(600), appreciationPct: -15 },
]

// Seeded random walk (matches the prototype) rescaled so the last point equals
// the current total — gives the net-worth chart realistic-looking history.
function walk(total: number, points = 156): { date: Date; netWorth: number }[] {
  let s = 987654321
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const arr: number[] = []
  let v = 86000
  for (let i = 0; i < points; i++) {
    v *= 1.0046 + (rng() - 0.5) * 0.045
    arr.push(v)
  }
  const scale = total / arr[points - 1]
  const now = new Date()
  now.setUTCHours(0, 0, 0, 0)
  return arr.map((x, i) => {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - (points - 1 - i) * 7)
    return { date: d, netWorth: x * scale }
  })
}

async function main() {
  const email = 'demo@freefolio.net'
  const password = await bcrypt.hash('password123', 12)

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      password,
      profile: { create: { firstName: 'Alex', lastName: 'Rivera' } },
      projection: { create: {} },
    },
  })

  // Reset holdings, debts + history so re-seeding is idempotent.
  await prisma.holding.deleteMany({ where: { userId: user.id } })
  await prisma.liability.deleteMany({ where: { userId: user.id } })
  await prisma.netWorthSnapshot.deleteMany({ where: { userId: user.id } })

  const created = new Map<string, string>()
  let total = 0
  for (const h of SEED_HOLDINGS) {
    const est = estimatedPrices({ category: h.category, appreciationPct: h.appreciationPct ?? null, openingCostPerShare: h.openingCostPerShare ?? null, openingAcquiredAt: h.openingAcquiredAt ?? null })
    const row = await prisma.holding.create({ data: { userId: user.id, ...h, ...(est ?? {}) } })
    created.set(h.symbol, row.id)
    total += row.quantity * row.price
  }

  // A few logged trades: an NVDA buy, a partial AAPL sale (short-term loss).
  const trades = [
    { symbol: 'NVDA', type: 'BUY' as const, quantity: 10, price: 120, date: ago(300) },
    { symbol: 'AAPL', type: 'SELL' as const, quantity: 10, price: 230, date: ago(40) },
  ]
  for (const { symbol, ...t } of trades) {
    await prisma.transaction.create({ data: { userId: user.id, holdingId: created.get(symbol)!, ...t, amount: t.quantity * t.price } })
  }
  await prisma.holding.update({ where: { id: created.get('NVDA') }, data: { quantity: 70 } })
  await prisma.holding.update({ where: { id: created.get('AAPL') }, data: { quantity: 30 } })

  const DEBTS: { name: string; type: LiabilityType; balance: number; interestRatePct: number; minPayment: number; securedBy?: string }[] = [
    { name: 'Home mortgage', type: 'MORTGAGE', balance: 312000, interestRatePct: 6.1, minPayment: 2180, securedBy: 'HOME' },
    { name: 'RAV4 loan', type: 'AUTO_LOAN', balance: 18400, interestRatePct: 7.4, minPayment: 520, securedBy: 'CAR' },
    { name: 'Chase Sapphire', type: 'CREDIT_CARD', balance: 4200, interestRatePct: 24.9, minPayment: 110 },
    { name: 'Student loan', type: 'STUDENT_LOAN', balance: 21500, interestRatePct: 5.5, minPayment: 260 },
  ]
  for (const { securedBy, ...d } of DEBTS) {
    await prisma.liability.create({ data: { userId: user.id, ...d, holdingId: securedBy ? created.get(securedBy) : null } })
    total -= d.balance
  }
  for (const point of walk(total)) {
    await prisma.netWorthSnapshot.create({
      data: { userId: user.id, date: point.date, netWorth: point.netWorth },
    })
  }

  console.log(`Seeded ${email} / password123`)
  console.log(`  ${SEED_HOLDINGS.length} holdings, 4 debts, net worth ≈ $${Math.round(total).toLocaleString()}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

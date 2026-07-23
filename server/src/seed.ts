import 'dotenv/config'
import bcrypt from 'bcryptjs'
import prisma from './lib/prisma'
import { Category } from '@prisma/client'

// The design's seed holdings.
const SEED_HOLDINGS: {
  symbol: string
  name: string
  category: Category
  quantity: number
  price: number
  prevClose: number
}[] = [
  { symbol: 'NVDA', name: 'NVIDIA Corp', category: 'STOCKS', quantity: 60, price: 178.3, prevClose: 171.2 },
  { symbol: 'AAPL', name: 'Apple Inc', category: 'STOCKS', quantity: 40, price: 244.1, prevClose: 246.5 },
  { symbol: 'VTI', name: 'Vanguard Total Market', category: 'STOCKS', quantity: 18, price: 315.2, prevClose: 312.8 },
  { symbol: 'VXUS', name: 'Vanguard Intl Stock', category: 'STOCKS', quantity: 50, price: 72.4, prevClose: 71.9 },
  { symbol: 'BTC', name: 'Bitcoin', category: 'CRYPTO', quantity: 0.85, price: 118400, prevClose: 119000 },
  { symbol: 'ETH', name: 'Ethereum', category: 'CRYPTO', quantity: 6.2, price: 4120, prevClose: 3980 },
  { symbol: 'BND', name: 'Vanguard Total Bond', category: 'BONDS', quantity: 60, price: 71.8, prevClose: 71.6 },
  { symbol: 'CASH', name: 'HYSA · Ally Bank', category: 'CASH', quantity: 1, price: 14250, prevClose: 14250 },
  { symbol: 'RSU', name: 'Vested RSUs (manual)', category: 'OTHER', quantity: 1, price: 8600, prevClose: 8600 },
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

  // Reset holdings + history so re-seeding is idempotent.
  await prisma.holding.deleteMany({ where: { userId: user.id } })
  await prisma.netWorthSnapshot.deleteMany({ where: { userId: user.id } })

  for (const h of SEED_HOLDINGS) {
    await prisma.holding.create({ data: { userId: user.id, ...h } })
  }

  const total = SEED_HOLDINGS.reduce((s, h) => s + h.quantity * h.price, 0)
  for (const point of walk(total)) {
    await prisma.netWorthSnapshot.create({
      data: { userId: user.id, date: point.date, netWorth: point.netWorth },
    })
  }

  console.log(`Seeded ${email} / password123`)
  console.log(`  ${SEED_HOLDINGS.length} holdings, net worth ≈ $${Math.round(total).toLocaleString()}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

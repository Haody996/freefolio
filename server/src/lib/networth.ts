import prisma from './prisma'

// Net worth is simply the sum of holding market values (quantity × price).
export async function computeNetWorth(userId: string): Promise<number> {
  const holdings = await prisma.holding.findMany({ where: { userId } })
  return holdings.reduce((sum, h) => sum + h.quantity * h.price, 0)
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

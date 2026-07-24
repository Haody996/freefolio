import prisma from './prisma'
import { AutoFrequency } from '@prisma/client'

const DAY = 86_400_000

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

// The next contribution date strictly after (or advancing from) `from`.
export function nextRun(from: Date, freq: AutoFrequency): Date {
  const base = utcMidnight(from)
  const y = base.getUTCFullYear()
  const m = base.getUTCMonth()
  const day = base.getUTCDate()

  switch (freq) {
    case 'DAILY':
      return new Date(base.getTime() + DAY)
    case 'WEEKLY':
      return new Date(base.getTime() + 7 * DAY)
    case 'BIWEEKLY':
      return new Date(base.getTime() + 14 * DAY)
    case 'SEMIMONTHLY':
      // Twice a month, on the 1st and 15th.
      return day < 15 ? new Date(Date.UTC(y, m, 15)) : new Date(Date.UTC(y, m + 1, 1))
    case 'MONTHLY': {
      const daysInNext = new Date(Date.UTC(y, m + 2, 0)).getUTCDate()
      return new Date(Date.UTC(y, m + 1, Math.min(day, daysInNext)))
    }
  }
}

// Apply every due auto-invest contribution: convert the dollar amount to shares
// at the current price and advance the schedule (catching up missed periods).
export async function processDueAutoInvest(now = new Date()): Promise<number> {
  const due = await prisma.holding.findMany({
    where: {
      autoAmount: { gt: 0 },
      autoFrequency: { not: null },
      autoNextAt: { lte: now },
    },
  })

  let applied = 0
  for (const h of due) {
    if (!h.autoFrequency || h.autoNextAt == null || h.autoAmount == null) continue

    let next = h.autoNextAt
    let addedShares = 0
    let runs = 0
    // Advance through any missed periods, bounded to avoid runaway catch-up.
    while (next.getTime() <= now.getTime() && runs < 120) {
      if (h.price > 0) addedShares += h.autoAmount / h.price
      next = nextRun(next, h.autoFrequency)
      runs++
    }

    await prisma.holding.update({
      where: { id: h.id },
      data: {
        quantity: h.quantity + addedShares,
        autoLastAt: addedShares > 0 ? now : h.autoLastAt,
        autoNextAt: next,
      },
    })
    if (addedShares > 0) applied++
  }
  if (applied > 0) console.log(`[auto-invest] Applied contributions to ${applied} holding(s)`)
  return applied
}

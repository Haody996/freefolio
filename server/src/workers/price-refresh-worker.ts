import 'dotenv/config'
import { Worker } from 'bullmq'
import { connection, QUEUE_PRICES } from '../lib/queue'
import prisma from '../lib/prisma'
import { getQuote, assetTypeForCategory } from '../lib/prices'
import { estimatedPrices } from '../lib/assets'

// Pull fresh quotes for every market-priced holding (the provider's previous
// close keeps day-change meaningful), and re-value estimated real estate and
// vehicles along their appreciation curve.
async function refreshAllPrices(): Promise<number> {
  const holdings = await prisma.holding.findMany({
    where: { category: { in: ['STOCKS', 'CRYPTO', 'BONDS', 'METALS', 'REAL_ESTATE', 'VEHICLE'] } },
  })
  if (holdings.length === 0) {
    console.log('[price-refresh] No priced holdings')
    return 0
  }

  let updated = 0
  for (const h of holdings) {
    const est = estimatedPrices(h)
    if (est) {
      await prisma.holding.update({ where: { id: h.id }, data: { ...est, quantity: 1 } })
      updated++
      continue
    }
    const assetType = assetTypeForCategory(h.category)
    if (!assetType) continue
    const quote = await getQuote(h.symbol, assetType, h.providerId)
    if (!quote) continue
    await prisma.holding.update({
      where: { id: h.id },
      data: { prevClose: quote.prevClose ?? h.price ?? quote.price, price: quote.price },
    })
    updated++
  }
  console.log(`[price-refresh] Updated ${updated}/${holdings.length} holdings`)
  return updated
}

const worker = new Worker(
  QUEUE_PRICES,
  async () => {
    return refreshAllPrices()
  },
  { connection }
)

worker.on('completed', (job) => console.log(`[price-refresh] Job ${job.id} completed`))
worker.on('failed', (job, err) => console.error(`[price-refresh] Job ${job?.id} failed:`, err))

console.log('[price-refresh] Worker started, listening on queue:', QUEUE_PRICES)

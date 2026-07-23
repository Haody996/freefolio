import 'dotenv/config'
import { Worker } from 'bullmq'
import { connection, QUEUE_PRICES } from '../lib/queue'
import prisma from '../lib/prisma'
import { getQuote } from '../lib/prices'
import { Category } from '@prisma/client'

// Only market-priced categories get live quotes; cash/other are manual.
function pricedAssetType(cat: Category): 'STOCK' | 'CRYPTO' | null {
  if (cat === 'CRYPTO') return 'CRYPTO'
  if (cat === 'STOCKS' || cat === 'BONDS') return 'STOCK'
  return null
}

// Pull fresh quotes for every market-priced holding, rolling the old price
// into prevClose so day-change stays meaningful.
async function refreshAllPrices(): Promise<number> {
  const holdings = await prisma.holding.findMany({
    where: { category: { in: ['STOCKS', 'CRYPTO', 'BONDS'] } },
  })
  if (holdings.length === 0) {
    console.log('[price-refresh] No market-priced holdings')
    return 0
  }

  let updated = 0
  for (const h of holdings) {
    const assetType = pricedAssetType(h.category)
    if (!assetType) continue
    const quote = await getQuote(h.symbol, assetType)
    if (!quote) continue
    await prisma.holding.update({
      where: { id: h.id },
      data: { prevClose: h.price || quote.price, price: quote.price },
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

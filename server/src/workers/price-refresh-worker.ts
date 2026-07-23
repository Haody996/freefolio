import 'dotenv/config'
import { Worker } from 'bullmq'
import { connection, QUEUE_PRICES } from '../lib/queue'
import prisma from '../lib/prisma'
import { getQuotes, AssetTypeLike } from '../lib/prices'

// Pull the distinct set of symbols any user actually holds, then fetch fresh
// quotes and upsert them into the PriceQuote cache the app reads from.
async function refreshAllPrices(): Promise<number> {
  const holdings = await prisma.holding.findMany({
    distinct: ['symbol', 'assetType'],
    select: { symbol: true, assetType: true },
  })
  if (holdings.length === 0) {
    console.log('[price-refresh] No holdings to price')
    return 0
  }

  const quotes = await getQuotes(
    holdings.map((h) => ({ symbol: h.symbol, assetType: h.assetType as AssetTypeLike }))
  )

  // Map quote back to its asset type (getQuotes preserves symbol but not type).
  const typeBySymbol = new Map(holdings.map((h) => [h.symbol.toUpperCase(), h.assetType]))

  let updated = 0
  for (const q of quotes) {
    const assetType = typeBySymbol.get(q.symbol.toUpperCase()) ?? 'STOCK'
    await prisma.priceQuote.upsert({
      where: { symbol_assetType: { symbol: q.symbol, assetType } },
      create: { symbol: q.symbol, assetType, price: q.price, currency: q.currency },
      update: { price: q.price, currency: q.currency, asOf: new Date() },
    })
    updated++
  }
  console.log(`[price-refresh] Updated ${updated}/${holdings.length} symbols`)
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

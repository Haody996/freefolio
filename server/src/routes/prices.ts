import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'
import { getQuote, AssetTypeLike } from '../lib/prices'

const router = Router()
router.use(authMiddleware)

// GET /api/prices/quote?symbol=AAPL&assetType=STOCK — live lookup, also caches the result.
router.get('/quote', async (req: AuthRequest, res: Response): Promise<void> => {
  const symbol = String(req.query.symbol || '').trim()
  const assetType = (String(req.query.assetType || 'STOCK') as AssetTypeLike) || 'STOCK'
  if (!symbol) {
    res.status(400).json({ error: 'symbol is required' })
    return
  }

  const quote = await getQuote(symbol, assetType)
  if (!quote) {
    res.status(404).json({ error: 'No quote available for that symbol' })
    return
  }

  await prisma.priceQuote.upsert({
    where: { symbol_assetType: { symbol, assetType: assetType as any } },
    create: { symbol, assetType: assetType as any, price: quote.price, currency: quote.currency },
    update: { price: quote.price, currency: quote.currency, asOf: new Date() },
  })

  res.json({ quote })
})

// GET /api/prices/cached — all cached quotes (what the workers last stored).
router.get('/cached', async (_req: AuthRequest, res: Response): Promise<void> => {
  const quotes = await prisma.priceQuote.findMany({ orderBy: { symbol: 'asc' } })
  res.json({ quotes })
})

export default router

import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { getQuote, AssetTypeLike } from '../lib/prices'

const router = Router()
router.use(authMiddleware)

// Map a holding category to the price provider's asset routing.
function assetTypeFor(category: string): AssetTypeLike | null {
  const c = category.toUpperCase()
  if (c === 'CRYPTO') return 'CRYPTO'
  if (c === 'STOCKS' || c === 'BONDS' || c === 'STOCK' || c === 'ETF') return 'STOCK'
  return null // CASH / OTHER are manual
}

// GET /api/prices/quote?symbol=AAPL&category=STOCKS
// Live price + previous close, used to prefill the Add/Edit Holding modal.
router.get('/quote', async (req: AuthRequest, res: Response): Promise<void> => {
  const symbol = String(req.query.symbol || '').trim()
  const category = String(req.query.category || 'STOCKS')
  if (!symbol) {
    res.status(400).json({ error: 'symbol is required' })
    return
  }
  const assetType = assetTypeFor(category)
  if (!assetType) {
    res.status(400).json({ error: 'This category is not market-priced' })
    return
  }
  const quote = await getQuote(symbol, assetType)
  if (!quote) {
    res.status(404).json({ error: 'No live quote for that ticker' })
    return
  }
  res.json({ quote })
})

export default router

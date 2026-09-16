import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { getQuote, assetTypeForCategory, getTopCryptos, searchCryptos } from '../lib/prices'

const router = Router()
router.use(authMiddleware)

// GET /api/prices/quote?symbol=AAPL&category=STOCKS[&providerId=pepe]
// Live price + previous close, used to prefill the Add/Edit Holding modal.
router.get('/quote', async (req: AuthRequest, res: Response): Promise<void> => {
  const symbol = String(req.query.symbol || '').trim()
  const category = String(req.query.category || 'STOCKS')
  const providerId = req.query.providerId ? String(req.query.providerId) : null
  if (!symbol) {
    res.status(400).json({ error: 'symbol is required' })
    return
  }
  const assetType = assetTypeForCategory(category)
  if (!assetType) {
    res.status(400).json({ error: 'This category is not market-priced' })
    return
  }
  const quote = await getQuote(symbol, assetType, providerId)
  if (!quote) {
    res.status(404).json({ error: 'No live quote for that ticker' })
    return
  }
  res.json({ quote })
})

// GET /api/prices/crypto/top — top 100 coins by market cap.
router.get('/crypto/top', async (_req: AuthRequest, res: Response): Promise<void> => {
  res.json({ coins: await getTopCryptos() })
})

// GET /api/prices/crypto/search?q=pepe — any coin CoinGecko lists.
router.get('/crypto/search', async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ coins: await searchCryptos(String(req.query.q || '')) })
})

export default router

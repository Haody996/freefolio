import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { computeGains } from '../lib/gains'
import { replacementsFor } from '../lib/tax'

const router = Router()
router.use(authMiddleware)

// GET /api/gains — per-holding cost basis & unrealized gains, realized sales,
// and tax-loss harvesting candidates.
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const gains = await computeGains(req.userId!)
  // Suggest similar funds to hold during the 30-day wash-sale window.
  const harvest = gains.harvest.map((h) => {
    const r = replacementsFor(h.symbol, h.category)
    return { ...h, replacements: r.replacements, replacementNote: r.note }
  })
  res.json({ ...gains, harvest })
})

export default router

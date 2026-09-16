import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { computeGains } from '../lib/gains'

const router = Router()
router.use(authMiddleware)

// GET /api/gains — per-holding cost basis & unrealized gains, realized sales,
// and tax-loss harvesting candidates.
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  res.json(await computeGains(req.userId!))
})

export default router

import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'
import { computeNetWorth, snapshotNetWorth } from '../lib/networth'

const router = Router()
router.use(authMiddleware)

// GET /api/networth/current — live net worth broken down by account.
router.get('/current', async (req: AuthRequest, res: Response): Promise<void> => {
  const nw = await computeNetWorth(req.userId!)
  res.json(nw)
})

// GET /api/networth/history?days=365 — daily snapshot series for charting.
router.get('/history', async (req: AuthRequest, res: Response): Promise<void> => {
  const days = Math.min(Number(req.query.days) || 365, 3650)
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - days)

  const history = await prisma.netWorthSnapshot.findMany({
    where: { userId: req.userId, date: { gte: since } },
    orderBy: { date: 'asc' },
    select: { date: true, totalAssets: true, totalLiabilities: true, netWorth: true },
  })
  res.json({ history })
})

// POST /api/networth/snapshot — force today's snapshot to recompute now.
router.post('/snapshot', async (req: AuthRequest, res: Response): Promise<void> => {
  await snapshotNetWorth(req.userId!)
  const nw = await computeNetWorth(req.userId!)
  res.json(nw)
})

export default router

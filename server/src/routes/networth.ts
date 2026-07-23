import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'
import { computeNetWorth, snapshotNetWorth, backfillHistory } from '../lib/networth'

const router = Router()
router.use(authMiddleware)

// GET /api/networth/current — live net worth from current holdings.
router.get('/current', async (req: AuthRequest, res: Response): Promise<void> => {
  const netWorth = await computeNetWorth(req.userId!)
  res.json({ netWorth })
})

// GET /api/networth/history?days=1100 — daily snapshot series for the chart.
router.get('/history', async (req: AuthRequest, res: Response): Promise<void> => {
  const days = Math.min(Number(req.query.days) || 1100, 3650)
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - days)

  const history = await prisma.netWorthSnapshot.findMany({
    where: { userId: req.userId, date: { gte: since } },
    orderBy: { date: 'asc' },
    select: { date: true, netWorth: true },
  })
  res.json({ history })
})

// POST /api/networth/snapshot — recompute and store today's snapshot now.
router.post('/snapshot', async (req: AuthRequest, res: Response): Promise<void> => {
  const netWorth = await snapshotNetWorth(req.userId!)
  res.json({ netWorth })
})

// POST /api/networth/backfill?days=365 — reconstruct REAL history from market data.
router.post('/backfill', async (req: AuthRequest, res: Response): Promise<void> => {
  const days = Math.min(Number(req.query.days) || 365, 365)
  const written = await backfillHistory(req.userId!, days)
  await snapshotNetWorth(req.userId!) // ensure today reflects the live total
  res.json({ written })
})

export default router

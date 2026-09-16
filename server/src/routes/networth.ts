import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'
import { computeBalances, snapshotNetWorth, backfillHistory, intradayNetWorth } from '../lib/networth'

const router = Router()
router.use(authMiddleware)

// GET /api/networth/current — live net worth (assets − debts) from current holdings.
router.get('/current', async (req: AuthRequest, res: Response): Promise<void> => {
  res.json(await computeBalances(req.userId!))
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

// GET /api/networth/intraday — net worth through the day on a 5-minute grid.
router.get('/intraday', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const points = await intradayNetWorth(req.userId!)
    res.json({ points: points.map((p) => ({ date: new Date(p.t).toISOString(), netWorth: p.netWorth })) })
  } catch (err) {
    console.error('[networth] intraday failed:', String(err))
    res.status(503).json({ error: 'Intraday data is unavailable right now.' })
  }
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

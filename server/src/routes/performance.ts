import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { computePerformance, BENCHMARKS } from '../lib/performance'

const router = Router()
router.use(authMiddleware)

// GET /api/performance?benchmark=SPY — time- and money-weighted returns vs a benchmark.
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const report = await computePerformance(req.userId!, String(req.query.benchmark || 'SPY'))
    res.json({ ...report, benchmarks: Object.entries(BENCHMARKS).map(([symbol, label]) => ({ symbol, label })) })
  } catch (err) {
    console.error('[performance] failed:', String(err))
    res.status(503).json({ error: 'Performance data is unavailable right now.' })
  }
})

export default router

import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { getInsight } from '../lib/insights'

const router = Router()
router.use(authMiddleware)

// GET /api/insights[?refresh=1] — AI daily briefing (cached per user per day).
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await getInsight(req.userId!, req.query.refresh === '1')
    res.json(result)
  } catch (err: any) {
    console.error('[insights] failed:', String(err))
    res.status(503).json({ error: 'Insights are unavailable right now.' })
  }
})

export default router

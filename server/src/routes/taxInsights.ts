import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { computeTaxInsights } from '../lib/taxInsights'
import { TAX_PROMPT } from '../lib/assistant'
import { AiUnavailableError } from '../lib/gemini'
import { cachedExplain, aiRateOk } from './assistant'

const router = Router()
router.use(authMiddleware)

// GET /api/tax-insights — asset location, Roth ladder, harvesting + replacements.
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  res.json(await computeTaxInsights(req.userId!))
})

// POST /api/tax-insights/explain → { text } — AI summary of the same results.
router.post('/explain', async (req: AuthRequest, res: Response): Promise<void> => {
  if (!aiRateOk(req.userId!)) {
    res.status(429).json({ error: 'You have reached the hourly limit for AI requests — try again later.' })
    return
  }
  try {
    const t = await computeTaxInsights(req.userId!)
    const data = {
      settings: t.settings,
      assetLocation: t.assetLocation.findings.map((f) => ({ severity: f.severity, title: f.title, amount: Math.round(f.amount), symbols: f.symbols })),
      rothLadder: t.rothLadder.applicable
        ? {
            fromAge: t.rothLadder.startAge,
            toAge: t.rothLadder.endAge,
            totalConverted: Math.round(t.rothLadder.totalConverted),
            totalTax: Math.round(t.rothLadder.totalTax),
            avgTaxRatePct: +(t.rothLadder.avgRate * 100).toFixed(1),
            rmdAt73WithLadder: Math.round(t.rothLadder.rmdAt73.withLadder),
            rmdAt73WithoutLadder: Math.round(t.rothLadder.rmdAt73.withoutLadder),
            bracketAt73With: t.rothLadder.rmdAt73.bracketWith,
            bracketAt73Without: t.rothLadder.rmdAt73.bracketWithout,
            penaltyFreeFromAge: t.rothLadder.penaltyFreeFromAge,
          }
        : { notApplicable: t.rothLadder.reason },
      harvest: t.harvest.map((h) => ({ symbol: h.symbol, loss: Math.round(h.harvestableLoss), washSaleRisk: h.washSaleRisk, replacements: h.replacements.map((r) => r.symbol), note: h.replacementNote })),
    }
    res.json({ text: await cachedExplain(req.userId!, TAX_PROMPT, data) })
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      res.status(503).json({ error: 'AI features are not configured on this server.' })
      return
    }
    console.error('[tax-insights] explain failed:', String(err))
    res.status(502).json({ error: 'The AI service is unavailable right now — try again in a moment.' })
  }
})

export default router

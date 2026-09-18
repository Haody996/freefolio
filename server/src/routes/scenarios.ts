import { Router, Response } from 'express'
import { Prisma } from '@prisma/client'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'

const router = Router()
router.use(authMiddleware)

// Scenario overrides the client understands (client lib/scenarios.ts).
const NUMBER_KEYS = [
  'retirementAge', 'annualSpending', 'spendingChange', 'monthlyContribution', 'contributionChange', 'expectedReturnPct',
  'inflationPct', 'socialSecurityAnnual', 'ssStartAge', 'pensionAnnual', 'pensionStartAge', 'aumFeePct', 'endAge',
  'startingCapitalChange', 'debtExtraPayment', 'bondShiftPct', 'marketDropPct', 'marketDropAge',
] as const
const ENUMS: Record<string, string[]> = { withdrawalStrategy: ['FIXED', 'GUARDRAILS'], debtStrategy: ['AVALANCHE', 'SNOWBALL'] }

export function sanitizeOverrides(raw: unknown): Record<string, unknown> {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of NUMBER_KEYS) if (typeof o[k] === 'number' && isFinite(o[k] as number)) out[k] = o[k]
  for (const [k, allowed] of Object.entries(ENUMS)) if (typeof o[k] === 'string' && allowed.includes(o[k] as string)) out[k] = o[k]
  if (Array.isArray(o.payOffDebts)) out.payOffDebts = o.payOffDebts.filter((x) => typeof x === 'string').slice(0, 20).map((x) => String(x).slice(0, 100))
  return out
}

// GET /api/scenarios
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const scenarios = await prisma.scenario.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'desc' } })
  res.json({ scenarios })
})

// POST /api/scenarios { name, overrides }
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const name = String(req.body?.name || '').trim().slice(0, 80)
  const overrides = sanitizeOverrides(req.body?.overrides)
  if (!name || Object.keys(overrides).length === 0) {
    res.status(400).json({ error: 'A name and at least one change are required.' })
    return
  }
  if ((await prisma.scenario.count({ where: { userId: req.userId } })) >= 50) {
    res.status(400).json({ error: 'You can save up to 50 scenarios — delete some first.' })
    return
  }
  const scenario = await prisma.scenario.create({ data: { userId: req.userId!, name, overrides: overrides as Prisma.InputJsonObject } })
  res.status(201).json({ scenario })
})

// DELETE /api/scenarios/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const { count } = await prisma.scenario.deleteMany({ where: { id: req.params.id as string, userId: req.userId } })
  if (!count) {
    res.status(404).json({ error: 'Scenario not found' })
    return
  }
  res.json({ ok: true })
})

export default router

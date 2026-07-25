import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'

const router = Router()
router.use(authMiddleware)

const NUM_FIELDS = [
  'monthlyContribution',
  'expectedReturnPct',
  'inflationPct',
  'currentAge',
  'retirementAge',
  'endAge',
  'annualSpending',
  'vacationBudget',
  'vacationYears',
  'taxRatePct',
  'socialSecurityAnnual',
  'ssStartAge',
  'pensionAnnual',
  'pensionStartAge',
  'aumFeePct',
  'healthcareAnnual',
  'healthcareInflationPct',
] as const
const INT_FIELDS = new Set(['currentAge', 'retirementAge', 'endAge', 'vacationYears', 'ssStartAge', 'pensionStartAge'])
const BOOL_FIELDS = ['spendingSmile', 'applyRmd'] as const

// GET /api/projection — the saved retirement-plan settings.
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  let settings = await prisma.projectionSettings.findUnique({ where: { userId: req.userId } })
  if (!settings) {
    settings = await prisma.projectionSettings.create({ data: { userId: req.userId! } })
  }
  res.json({ settings })
})

// PUT /api/projection — persist plan inputs.
router.put('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const data: Record<string, number | boolean | string | null> = {}

  // Nullable dollar fields (null → derive a default client-side).
  for (const f of ['startingCapital', 'fireGoal'] as const) {
    if (f in req.body) {
      const v = req.body[f]
      data[f] = v === null || v === undefined ? null : Number(v)
    }
  }
  for (const f of NUM_FIELDS) {
    if (req.body[f] != null && !isNaN(Number(req.body[f]))) {
      data[f] = INT_FIELDS.has(f) ? Math.round(Number(req.body[f])) : Number(req.body[f])
    }
  }
  for (const f of BOOL_FIELDS) {
    if (typeof req.body[f] === 'boolean') data[f] = req.body[f]
  }
  if (req.body.withdrawalStrategy === 'FIXED' || req.body.withdrawalStrategy === 'GUARDRAILS') {
    data.withdrawalStrategy = req.body.withdrawalStrategy
  }

  const settings = await prisma.projectionSettings.upsert({
    where: { userId: req.userId! },
    create: { userId: req.userId!, ...data },
    update: data,
  })
  res.json({ settings })
})

export default router

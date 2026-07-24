import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'

const router = Router()
router.use(authMiddleware)

// Numeric fields the client may persist. startingCapital is nullable (null =
// follow current net worth); the rest are plain numbers.
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
] as const
const INT_FIELDS = new Set([
  'currentAge',
  'retirementAge',
  'endAge',
  'vacationYears',
  'ssStartAge',
  'pensionStartAge',
])

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
  const data: Record<string, number | null> = {}

  if ('startingCapital' in req.body) {
    const v = req.body.startingCapital
    data.startingCapital = v === null || v === undefined ? null : Number(v)
  }
  for (const f of NUM_FIELDS) {
    if (req.body[f] != null && !isNaN(Number(req.body[f]))) {
      data[f] = INT_FIELDS.has(f) ? Math.round(Number(req.body[f])) : Number(req.body[f])
    }
  }

  const settings = await prisma.projectionSettings.upsert({
    where: { userId: req.userId! },
    create: { userId: req.userId!, ...data },
    update: data,
  })
  res.json({ settings })
})

export default router

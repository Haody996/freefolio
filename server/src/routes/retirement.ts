import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'
import { projectFire, FireInput } from '../lib/fire'
import { computeNetWorth } from '../lib/networth'

const router = Router()
router.use(authMiddleware)

const PLAN_FIELDS: (keyof FireInput)[] = [
  'currentAge',
  'retirementAge',
  'currentSavings',
  'annualContribution',
  'annualExpenses',
  'expectedReturnPct',
  'inflationPct',
  'withdrawalRatePct',
]

// GET /api/retirement — the saved plan plus a fresh projection.
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  let plan = await prisma.retirementPlan.findUnique({ where: { userId: req.userId } })
  if (!plan) {
    plan = await prisma.retirementPlan.create({ data: { userId: req.userId! } })
  }
  const projection = projectFire(plan as unknown as FireInput)
  res.json({ plan, projection })
})

// PUT /api/retirement — save plan inputs and return the recomputed projection.
router.put('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const data: Record<string, number> = {}
  for (const f of PLAN_FIELDS) {
    if (req.body[f] != null && !isNaN(Number(req.body[f]))) data[f] = Number(req.body[f])
  }

  const plan = await prisma.retirementPlan.upsert({
    where: { userId: req.userId! },
    create: { userId: req.userId!, ...data },
    update: data,
  })
  const projection = projectFire(plan as unknown as FireInput)
  res.json({ plan, projection })
})

// POST /api/retirement/sync-savings — pull currentSavings from live net worth, then project.
router.post('/sync-savings', async (req: AuthRequest, res: Response): Promise<void> => {
  const nw = await computeNetWorth(req.userId!)
  const plan = await prisma.retirementPlan.upsert({
    where: { userId: req.userId! },
    create: { userId: req.userId!, currentSavings: nw.netWorth },
    update: { currentSavings: nw.netWorth },
  })
  const projection = projectFire(plan as unknown as FireInput)
  res.json({ plan, projection })
})

export default router

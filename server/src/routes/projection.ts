import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'

const router = Router()
router.use(authMiddleware)

// GET /api/projection — the saved compound-growth slider settings.
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  let settings = await prisma.projectionSettings.findUnique({ where: { userId: req.userId } })
  if (!settings) {
    settings = await prisma.projectionSettings.create({ data: { userId: req.userId! } })
  }
  res.json({ settings })
})

// PUT /api/projection — persist slider positions.
router.put('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { startingCapital, monthlyContribution, expectedReturnPct, years, inflationPct } = req.body

  const data = {
    startingCapital:
      startingCapital === null || startingCapital === undefined
        ? undefined
        : Number(startingCapital),
    monthlyContribution:
      monthlyContribution != null ? Number(monthlyContribution) : undefined,
    expectedReturnPct: expectedReturnPct != null ? Number(expectedReturnPct) : undefined,
    years: years != null ? Math.round(Number(years)) : undefined,
    inflationPct: inflationPct != null ? Number(inflationPct) : undefined,
  }

  const settings = await prisma.projectionSettings.upsert({
    where: { userId: req.userId! },
    create: { userId: req.userId!, ...data },
    update: data,
  })
  res.json({ settings })
})

export default router

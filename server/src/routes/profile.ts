import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'

const router = Router()
router.use(authMiddleware)

// GET /api/profile
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      id: true,
      email: true,
      baseCurrency: true,
      createdAt: true,
      profile: { select: { firstName: true, lastName: true } },
    },
  })
  if (!user) {
    res.status(404).json({ error: 'User not found' })
    return
  }
  res.json({ profile: user })
})

// PATCH /api/profile — update name and reporting currency.
router.patch('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { firstName, lastName, baseCurrency } = req.body

  if (baseCurrency) {
    await prisma.user.update({
      where: { id: req.userId },
      data: { baseCurrency: String(baseCurrency).toUpperCase().slice(0, 3) },
    })
  }

  if (firstName != null || lastName != null) {
    await prisma.profile.upsert({
      where: { userId: req.userId! },
      create: { userId: req.userId!, firstName: firstName || '', lastName: lastName || '' },
      update: {
        firstName: firstName ?? undefined,
        lastName: lastName ?? undefined,
      },
    })
  }

  res.json({ ok: true })
})

export default router

import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'

const router = Router()
router.use(authMiddleware)

// GET /api/accounts — all of the user's accounts with their latest balance & holdings.
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const accounts = await prisma.account.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'asc' },
    include: {
      balances: { orderBy: { date: 'desc' }, take: 1 },
      _count: { select: { holdings: true } },
    },
  })
  res.json({ accounts })
})

// POST /api/accounts — create an account (and optionally an opening balance).
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { name, kind, category, institution, currency, isInvestment, openingBalance } = req.body
  if (!name) {
    res.status(400).json({ error: 'Account name is required' })
    return
  }

  const account = await prisma.account.create({
    data: {
      userId: req.userId!,
      name,
      kind: kind || 'ASSET',
      category: category || 'CASH',
      institution: institution || null,
      currency: currency || 'USD',
      isInvestment: !!isInvestment,
      balances:
        openingBalance != null && !isInvestment
          ? { create: { amount: Number(openingBalance) } }
          : undefined,
    },
  })
  res.status(201).json({ account })
})

// PATCH /api/accounts/:id — update account metadata.
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.account.findFirst({
    where: { id: req.params.id as string, userId: req.userId },
  })
  if (!existing) {
    res.status(404).json({ error: 'Account not found' })
    return
  }

  const { name, kind, category, institution, currency, includeInNetWorth, isActive, isInvestment } =
    req.body
  const account = await prisma.account.update({
    where: { id: existing.id },
    data: { name, kind, category, institution, currency, includeInNetWorth, isActive, isInvestment },
  })
  res.json({ account })
})

// DELETE /api/accounts/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.account.findFirst({
    where: { id: req.params.id as string, userId: req.userId },
  })
  if (!existing) {
    res.status(404).json({ error: 'Account not found' })
    return
  }
  await prisma.account.delete({ where: { id: existing.id } })
  res.json({ ok: true })
})

export default router

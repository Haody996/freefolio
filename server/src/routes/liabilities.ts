import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'
import { snapshotNetWorth } from '../lib/networth'
import { LiabilityType } from '@prisma/client'

const router = Router()
router.use(authMiddleware)

const TYPES: LiabilityType[] = ['MORTGAGE', 'HELOC', 'AUTO_LOAN', 'STUDENT_LOAN', 'CREDIT_CARD', 'PERSONAL_LOAN', 'MEDICAL', 'OTHER']

function num(v: unknown, fallback: number): number {
  const n = Number(v)
  return v === undefined || v === null || v === '' || isNaN(n) ? fallback : Math.max(0, n)
}

// Validate the optional secured asset belongs to this user.
async function securedBy(userId: string, holdingId: unknown): Promise<string | null | undefined> {
  if (holdingId === undefined) return undefined
  if (!holdingId) return null
  const h = await prisma.holding.findFirst({ where: { id: String(holdingId), userId }, select: { id: true } })
  return h ? h.id : null
}

function fields(body: any) {
  const type = String(body.type || '').toUpperCase()
  return {
    name: body.name !== undefined ? String(body.name).trim() : undefined,
    type: (TYPES as string[]).includes(type) ? (type as LiabilityType) : undefined,
    institution: body.institution !== undefined ? String(body.institution || '').trim() : undefined,
    balance: body.balance !== undefined ? num(body.balance, 0) : undefined,
    interestRatePct: body.interestRatePct !== undefined ? num(body.interestRatePct, 0) : undefined,
    minPayment: body.minPayment !== undefined ? num(body.minPayment, 0) : undefined,
  }
}

// GET /api/liabilities
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const liabilities = await prisma.liability.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'asc' } })
  res.json({ liabilities })
})

// POST /api/liabilities
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const f = fields(req.body)
  const name = f.name || ''
  if (!name) {
    res.status(400).json({ error: 'name is required' })
    return
  }
  const liability = await prisma.liability.create({
    data: {
      userId: req.userId!,
      name,
      type: f.type ?? 'OTHER',
      institution: f.institution ?? '',
      balance: f.balance ?? 0,
      interestRatePct: f.interestRatePct ?? 0,
      minPayment: f.minPayment ?? 0,
      holdingId: (await securedBy(req.userId!, req.body.holdingId)) ?? null,
    },
  })
  await snapshotNetWorth(req.userId!)
  res.status(201).json({ liability })
})

// PUT /api/liabilities/:id
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.liability.findFirst({ where: { id: req.params.id as string, userId: req.userId } })
  if (!existing) {
    res.status(404).json({ error: 'Debt not found' })
    return
  }
  const f = fields(req.body)
  const liability = await prisma.liability.update({
    where: { id: existing.id },
    data: { ...f, name: f.name || undefined, holdingId: await securedBy(req.userId!, req.body.holdingId) },
  })
  await snapshotNetWorth(req.userId!)
  res.json({ liability })
})

// DELETE /api/liabilities/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.liability.findFirst({ where: { id: req.params.id as string, userId: req.userId } })
  if (!existing) {
    res.status(404).json({ error: 'Debt not found' })
    return
  }
  await prisma.liability.delete({ where: { id: existing.id } })
  await snapshotNetWorth(req.userId!)
  res.json({ ok: true })
})

export default router

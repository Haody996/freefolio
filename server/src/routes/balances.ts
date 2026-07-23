import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'

const router = Router()
router.use(authMiddleware)

// Confirm the account belongs to the requesting user before touching its balances.
async function ownAccount(userId: string, accountId: string) {
  return prisma.account.findFirst({ where: { id: accountId, userId } })
}

// GET /api/balances/:accountId — full balance history for one account.
router.get('/:accountId', async (req: AuthRequest, res: Response): Promise<void> => {
  const account = await ownAccount(req.userId!, req.params.accountId as string)
  if (!account) {
    res.status(404).json({ error: 'Account not found' })
    return
  }
  const balances = await prisma.balance.findMany({
    where: { accountId: account.id },
    orderBy: { date: 'desc' },
  })
  res.json({ balances })
})

// POST /api/balances/:accountId — record a new balance for an account.
router.post('/:accountId', async (req: AuthRequest, res: Response): Promise<void> => {
  const account = await ownAccount(req.userId!, req.params.accountId as string)
  if (!account) {
    res.status(404).json({ error: 'Account not found' })
    return
  }
  const { amount, date } = req.body
  if (amount == null || isNaN(Number(amount))) {
    res.status(400).json({ error: 'A numeric amount is required' })
    return
  }
  const balance = await prisma.balance.create({
    data: {
      accountId: account.id,
      amount: Number(amount),
      date: date ? new Date(date) : undefined,
    },
  })
  res.status(201).json({ balance })
})

// DELETE /api/balances/entry/:id — remove a single balance entry.
router.delete('/entry/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const balance = await prisma.balance.findFirst({
    where: { id: req.params.id as string, account: { userId: req.userId } },
  })
  if (!balance) {
    res.status(404).json({ error: 'Balance entry not found' })
    return
  }
  await prisma.balance.delete({ where: { id: balance.id } })
  res.json({ ok: true })
})

export default router

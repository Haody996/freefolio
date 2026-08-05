import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'
import { Holding, TxType } from '@prisma/client'

const router = Router()
router.use(authMiddleware)

// Resolve which cash holding a trade affects. An explicit id wins; otherwise use
// (or create) a cash holding in the same account type + institution as the ticker.
async function resolveCash(userId: string, ticker: Holding, cashHoldingId?: string | null): Promise<Holding | null> {
  if (cashHoldingId) {
    return prisma.holding.findFirst({ where: { id: cashHoldingId, userId, category: 'CASH' } })
  }
  let cash = await prisma.holding.findFirst({
    where: { userId, category: 'CASH', accountType: ticker.accountType, institution: ticker.institution },
  })
  if (!cash) {
    cash = await prisma.holding.create({
      data: { userId, symbol: 'CASH', name: 'Cash', category: 'CASH', accountType: ticker.accountType, institution: ticker.institution, quantity: 1, price: 0, prevClose: 0 },
    })
  }
  return cash
}

// GET /api/transactions?holdingId=... — history for a holding (newest first).
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const holdingId = String(req.query.holdingId || '')
  const where = holdingId ? { userId: req.userId!, holdingId } : { userId: req.userId! }
  const transactions = await prisma.transaction.findMany({ where, orderBy: { date: 'desc' }, take: 200 })
  res.json({ transactions })
})

// POST /api/transactions — log a buy/sell and apply its effects.
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { holdingId, type, quantity, price, date, affectCash, cashHoldingId } = req.body

  const txType: TxType = type === 'SELL' ? 'SELL' : 'BUY'
  const qty = Math.abs(Number(quantity) || 0)
  const px = Number(price) || 0
  if (!holdingId || qty <= 0) {
    res.status(400).json({ error: 'holdingId and a positive quantity are required' })
    return
  }

  const holding = await prisma.holding.findFirst({ where: { id: holdingId, userId: req.userId } })
  if (!holding) {
    res.status(404).json({ error: 'Holding not found' })
    return
  }

  const amount = qty * px

  // Adjust the position's share count.
  const newQty = txType === 'BUY' ? holding.quantity + qty : Math.max(0, holding.quantity - qty)
  await prisma.holding.update({ where: { id: holding.id }, data: { quantity: newQty } })

  // Optional cash effect.
  let usedCashId: string | null = null
  if (affectCash) {
    const cash = await resolveCash(req.userId!, holding, cashHoldingId)
    if (cash) {
      usedCashId = cash.id
      const newCash = txType === 'SELL' ? cash.price + amount : Math.max(0, cash.price - amount)
      await prisma.holding.update({ where: { id: cash.id }, data: { price: newCash, prevClose: newCash } })
    }
  }

  const tx = await prisma.transaction.create({
    data: {
      userId: req.userId!,
      holdingId: holding.id,
      type: txType,
      quantity: qty,
      price: px,
      amount,
      date: date ? new Date(date) : undefined,
      affectedCash: !!affectCash,
      cashHoldingId: usedCashId,
    },
  })

  res.status(201).json({ transaction: tx, newQuantity: newQty })
})

export default router

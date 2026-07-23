import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'
import { getQuote, AssetTypeLike } from '../lib/prices'

const router = Router()
router.use(authMiddleware)

async function ownAccount(userId: string, accountId: string) {
  return prisma.account.findFirst({ where: { id: accountId, userId } })
}

// GET /api/holdings/:accountId — holdings in an account, joined with latest prices.
router.get('/:accountId', async (req: AuthRequest, res: Response): Promise<void> => {
  const account = await ownAccount(req.userId!, req.params.accountId as string)
  if (!account) {
    res.status(404).json({ error: 'Account not found' })
    return
  }
  const holdings = await prisma.holding.findMany({ where: { accountId: account.id } })
  const quotes = await prisma.priceQuote.findMany({
    where: { symbol: { in: holdings.map((h) => h.symbol) } },
  })
  const priceBy = new Map(quotes.map((q) => [`${q.symbol}:${q.assetType}`, q]))

  const enriched = holdings.map((h) => {
    const quote = priceBy.get(`${h.symbol}:${h.assetType}`)
    const marketValue = quote ? h.quantity * quote.price : null
    return {
      ...h,
      price: quote?.price ?? null,
      priceAsOf: quote?.asOf ?? null,
      marketValue,
      gain: marketValue != null && h.costBasis != null ? marketValue - h.costBasis : null,
    }
  })
  res.json({ holdings: enriched })
})

// POST /api/holdings/:accountId — add a holding; fetch an initial price immediately.
router.post('/:accountId', async (req: AuthRequest, res: Response): Promise<void> => {
  const account = await ownAccount(req.userId!, req.params.accountId as string)
  if (!account) {
    res.status(404).json({ error: 'Account not found' })
    return
  }
  const { symbol, assetType, quantity, costBasis } = req.body
  if (!symbol || quantity == null) {
    res.status(400).json({ error: 'symbol and quantity are required' })
    return
  }

  const holding = await prisma.holding.create({
    data: {
      accountId: account.id,
      symbol: String(symbol).trim(),
      assetType: assetType || 'STOCK',
      quantity: Number(quantity),
      costBasis: costBasis != null ? Number(costBasis) : null,
    },
  })

  // Best-effort initial quote so the holding shows a value right away.
  const quote = await getQuote(holding.symbol, (holding.assetType as AssetTypeLike) || 'STOCK')
  if (quote) {
    await prisma.priceQuote.upsert({
      where: { symbol_assetType: { symbol: holding.symbol, assetType: holding.assetType } },
      create: {
        symbol: holding.symbol,
        assetType: holding.assetType,
        price: quote.price,
        currency: quote.currency,
      },
      update: { price: quote.price, currency: quote.currency, asOf: new Date() },
    })
  }

  res.status(201).json({ holding })
})

// PATCH /api/holdings/entry/:id
router.patch('/entry/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const holding = await prisma.holding.findFirst({
    where: { id: req.params.id as string, account: { userId: req.userId } },
  })
  if (!holding) {
    res.status(404).json({ error: 'Holding not found' })
    return
  }
  const { quantity, costBasis, assetType } = req.body
  const updated = await prisma.holding.update({
    where: { id: holding.id },
    data: {
      quantity: quantity != null ? Number(quantity) : undefined,
      costBasis: costBasis != null ? Number(costBasis) : undefined,
      assetType,
    },
  })
  res.json({ holding: updated })
})

// DELETE /api/holdings/entry/:id
router.delete('/entry/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const holding = await prisma.holding.findFirst({
    where: { id: req.params.id as string, account: { userId: req.userId } },
  })
  if (!holding) {
    res.status(404).json({ error: 'Holding not found' })
    return
  }
  await prisma.holding.delete({ where: { id: holding.id } })
  res.json({ ok: true })
})

export default router

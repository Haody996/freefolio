import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'
import { getQuote } from '../lib/prices'
import { Category } from '@prisma/client'

const router = Router()
router.use(authMiddleware)

const CATEGORIES: Category[] = ['STOCKS', 'CRYPTO', 'CASH', 'BONDS', 'OTHER']

function normCategory(c: unknown): Category {
  const up = String(c || '').toUpperCase()
  return (CATEGORIES as string[]).includes(up) ? (up as Category) : 'STOCKS'
}

// Map a holding category to the price provider's asset routing.
function pricedAssetType(cat: Category): 'STOCK' | 'CRYPTO' | null {
  if (cat === 'CRYPTO') return 'CRYPTO'
  if (cat === 'STOCKS' || cat === 'BONDS') return 'STOCK'
  return null // CASH / OTHER are manual — never priced
}

// GET /api/holdings — the user's flat holdings list (client computes derived values).
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const holdings = await prisma.holding.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'asc' },
  })
  res.json({ holdings })
})

// POST /api/holdings — add (or replace, by symbol) a holding.
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { symbol, name, category, quantity, price, prevClose } = req.body
  const sym = String(symbol || '').toUpperCase().trim()
  if (!sym) {
    res.status(400).json({ error: 'symbol is required' })
    return
  }

  const p = Number(price) || 0
  const cat = normCategory(category)
  const holding = await prisma.holding.upsert({
    where: { userId_symbol: { userId: req.userId!, symbol: sym } },
    create: {
      userId: req.userId!,
      symbol: sym,
      name: String(name || '').trim() || sym,
      category: cat,
      quantity: Number(quantity) || 0,
      price: p,
      prevClose: prevClose != null && !isNaN(Number(prevClose)) ? Number(prevClose) : p,
    },
    update: {
      name: String(name || '').trim() || sym,
      category: cat,
      quantity: Number(quantity) || 0,
      price: p,
      prevClose: prevClose != null && !isNaN(Number(prevClose)) ? Number(prevClose) : p,
    },
  })
  res.status(201).json({ holding })
})

// PUT /api/holdings/:id — update an existing holding.
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.holding.findFirst({
    where: { id: req.params.id as string, userId: req.userId },
  })
  if (!existing) {
    res.status(404).json({ error: 'Holding not found' })
    return
  }
  const { symbol, name, category, quantity, price, prevClose } = req.body
  const p = price != null ? Number(price) : existing.price
  const holding = await prisma.holding.update({
    where: { id: existing.id },
    data: {
      symbol: symbol != null ? String(symbol).toUpperCase().trim() : undefined,
      name: name != null ? String(name).trim() : undefined,
      category: category != null ? normCategory(category) : undefined,
      quantity: quantity != null ? Number(quantity) : undefined,
      price: price != null ? p : undefined,
      prevClose: prevClose != null ? Number(prevClose) : undefined,
    },
  })
  res.json({ holding })
})

// DELETE /api/holdings/:id
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const existing = await prisma.holding.findFirst({
    where: { id: req.params.id as string, userId: req.userId },
  })
  if (!existing) {
    res.status(404).json({ error: 'Holding not found' })
    return
  }
  await prisma.holding.delete({ where: { id: existing.id } })
  res.json({ ok: true })
})

// POST /api/holdings/:id/refresh-price — pull a live quote for one holding now.
router.post('/:id/refresh-price', async (req: AuthRequest, res: Response): Promise<void> => {
  const holding = await prisma.holding.findFirst({
    where: { id: req.params.id as string, userId: req.userId },
  })
  if (!holding) {
    res.status(404).json({ error: 'Holding not found' })
    return
  }
  const assetType = pricedAssetType(holding.category)
  if (!assetType) {
    res.status(400).json({ error: 'This category is not market-priced' })
    return
  }
  const quote = await getQuote(holding.symbol, assetType)
  if (!quote) {
    res.status(404).json({ error: 'No quote available' })
    return
  }
  // Roll the current price into prevClose so the day change stays meaningful.
  const updated = await prisma.holding.update({
    where: { id: holding.id },
    data: { prevClose: holding.price || quote.price, price: quote.price },
  })
  res.json({ holding: updated })
})

export default router

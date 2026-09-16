import { Router, Response } from 'express'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import prisma from '../lib/prisma'
import { getQuote, assetTypeForCategory, METALS } from '../lib/prices'
import { nextRun } from '../lib/auto-invest'
import { estimatedPrices } from '../lib/assets'
import { Category, AccountType, AutoFrequency } from '@prisma/client'

const router = Router()
router.use(authMiddleware)

const CATEGORIES: Category[] = ['STOCKS', 'CRYPTO', 'CASH', 'BONDS', 'OTHER', 'METALS', 'REAL_ESTATE', 'VEHICLE']
const ACCOUNT_TYPES: AccountType[] = [
  'TAXABLE',
  'TRADITIONAL_401K',
  'ROTH_401K',
  'TRADITIONAL_IRA',
  'ROTH_IRA',
  'HSA',
  'OTHER',
]

function normCategory(c: unknown): Category {
  const up = String(c || '').toUpperCase()
  return (CATEGORIES as string[]).includes(up) ? (up as Category) : 'STOCKS'
}

function normAccountType(a: unknown): AccountType {
  const up = String(a || '').toUpperCase()
  return (ACCOUNT_TYPES as string[]).includes(up) ? (up as AccountType) : 'TAXABLE'
}

const AUTO_FREQS: AutoFrequency[] = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'SEMIMONTHLY', 'MONTHLY']
function normAutoFrequency(f: unknown): AutoFrequency | null {
  const up = String(f || '').toUpperCase()
  return (AUTO_FREQS as string[]).includes(up) ? (up as AutoFrequency) : null
}

// Optional number / date fields: absent → undefined (leave as is), null/'' → null.
function optNumber(v: unknown): number | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '' || isNaN(Number(v))) return null
  return Number(v)
}
function optDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined
  if (v === null || v === '') return null
  const d = new Date(String(v))
  return isNaN(d.getTime()) ? null : d
}

// Build the auto-invest fields from a request body. Disabled → all null.
// Preserves the existing schedule when the amount is on and the frequency is unchanged.
function autoInvestData(
  body: any,
  currentFreq?: AutoFrequency | null,
  currentNextAt?: Date | null
): { autoAmount: number | null; autoFrequency: AutoFrequency | null; autoNextAt: Date | null } {
  const amount = body.autoAmount != null && Number(body.autoAmount) > 0 ? Number(body.autoAmount) : null
  const freq = amount != null ? normAutoFrequency(body.autoFrequency) : null
  if (amount == null || freq == null) {
    return { autoAmount: null, autoFrequency: null, autoNextAt: null }
  }
  // Explicit start date wins; else keep the existing schedule (same frequency),
  // otherwise start next period from now.
  const startRaw = body.autoStartDate
  const startDate = startRaw ? new Date(startRaw) : null
  const autoNextAt =
    startDate && !isNaN(startDate.getTime())
      ? startDate
      : currentFreq === freq && currentNextAt
        ? currentNextAt
        : nextRun(new Date(), freq)
  return { autoAmount: amount, autoFrequency: freq, autoNextAt }
}

// Cost basis, provider id and appreciation fields shared by create/update.
function extraFields(body: any) {
  return {
    openingCostPerShare: optNumber(body.openingCostPerShare),
    openingAcquiredAt: optDate(body.openingAcquiredAt),
    appreciationPct: optNumber(body.appreciationPct),
    providerId: body.providerId === undefined ? undefined : String(body.providerId || '').trim() || null,
  }
}

// Canonical symbol: metals are stored by ISO code (XAU/XAG/XPT/XPD).
function normSymbol(sym: string, cat: Category): string {
  const s = sym.toUpperCase().trim()
  if (cat === 'METALS') {
    const byName = Object.entries(METALS).find(([, m]) => m.name.toUpperCase() === s)
    if (byName) return byName[0]
  }
  return s
}

// GET /api/holdings — the user's flat holdings list (client computes derived values).
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const holdings = await prisma.holding.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'asc' },
  })
  res.json({ holdings })
})

// POST /api/holdings — add a holding. If the ticker already exists in the same
// account + institution, COMBINE: the added quantity is logged as a BUY (at the
// given cost basis, else the price) so cost basis and returns stay accurate.
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const { symbol, name, category, accountType, quantity, price, prevClose } = req.body
  const cat = normCategory(category)
  const sym = normSymbol(String(symbol || ''), cat)
  if (!sym) {
    res.status(400).json({ error: 'symbol is required' })
    return
  }

  const p = Number(price) || 0
  const pc = prevClose != null && !isNaN(Number(prevClose)) ? Number(prevClose) : p
  const qty = Number(quantity) || 0
  const acct = normAccountType(accountType)
  const inst = String(req.body.institution || '').trim()
  const extra = extraFields(req.body)

  // A ticker only combines within the same account AND institution; the same
  // ticker in a different account or brokerage is a separate position.
  const existing = await prisma.holding.findUnique({
    where: { userId_symbol_accountType_institution: { userId: req.userId!, symbol: sym, accountType: acct, institution: inst } },
  })

  if (existing) {
    const manual = assetTypeForCategory(cat) == null
    const combined = await prisma.holding.update({
      where: { id: existing.id },
      data: {
        quantity: existing.quantity + qty,
        price: p,
        prevClose: pc,
        name: String(name || '').trim() || existing.name,
        category: cat,
        providerId: extra.providerId ?? existing.providerId,
        ...autoInvestData(req.body, existing.autoFrequency, existing.autoNextAt),
      },
    })
    if (!manual && qty > 0) {
      const cost = extra.openingCostPerShare ?? p
      await prisma.transaction.create({
        data: {
          userId: req.userId!,
          holdingId: existing.id,
          type: 'BUY',
          quantity: qty,
          price: cost,
          amount: qty * cost,
          date: extra.openingAcquiredAt ?? undefined,
          source: 'ADD',
        },
      })
    }
    res.status(200).json({ holding: combined, combined: true, previousQuantity: existing.quantity })
    return
  }

  const data = {
    userId: req.userId!,
    symbol: sym,
    name: String(name || '').trim() || METALS[sym]?.name || sym,
    category: cat,
    accountType: acct,
    institution: inst,
    quantity: qty,
    price: p,
    prevClose: pc,
    ...extra,
    ...autoInvestData(req.body),
  }
  const est = estimatedPrices({ ...data, appreciationPct: data.appreciationPct ?? null, openingCostPerShare: data.openingCostPerShare ?? null, openingAcquiredAt: data.openingAcquiredAt ?? null })
  const holding = await prisma.holding.create({ data: est ? { ...data, ...est, quantity: 1 } : data })
  res.status(201).json({ holding, combined: false })
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
  const { symbol, name, category, accountType, institution, quantity, price, prevClose } = req.body
  const cat = category != null ? normCategory(category) : existing.category
  // Only touch auto-invest fields when the client sends autoAmount (so plain
  // edits don't wipe an existing schedule).
  const autoData =
    'autoAmount' in req.body
      ? autoInvestData(req.body, existing.autoFrequency, existing.autoNextAt)
      : {}
  const data = {
    symbol: symbol != null ? normSymbol(String(symbol), cat) : undefined,
    name: name != null ? String(name).trim() : undefined,
    category: category != null ? cat : undefined,
    accountType: accountType != null ? normAccountType(accountType) : undefined,
    institution: institution != null ? String(institution).trim() : undefined,
    quantity: quantity != null ? Number(quantity) : undefined,
    price: price != null ? Number(price) : undefined,
    prevClose: prevClose != null ? Number(prevClose) : undefined,
    ...extraFields(req.body),
    ...autoData,
  }
  // Estimated real estate / vehicles: value follows the appreciation curve.
  const merged = { ...existing, ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) }
  const est = estimatedPrices(merged)
  const holding = await prisma.holding.update({
    where: { id: existing.id },
    data: est ? { ...data, ...est, quantity: 1 } : data,
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
  const assetType = assetTypeForCategory(holding.category)
  if (!assetType) {
    res.status(400).json({ error: 'This category is not market-priced' })
    return
  }
  const quote = await getQuote(holding.symbol, assetType, holding.providerId)
  if (!quote) {
    res.status(404).json({ error: 'No quote available' })
    return
  }
  // Use the provider's real previous close when available.
  const updated = await prisma.holding.update({
    where: { id: holding.id },
    data: { prevClose: quote.prevClose ?? holding.price ?? quote.price, price: quote.price },
  })
  res.json({ holding: updated })
})

export default router

import { Holding, Transaction, Liability } from '@prisma/client'

// Test data builders with realistic defaults for Prisma rows.

let seq = 0
const id = (p: string) => `${p}${++seq}`

export const D = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso)

export function holding(p: Partial<Holding> = {}): Holding {
  return {
    id: id('h'),
    userId: 'u1',
    symbol: 'AAA',
    name: 'Test',
    category: 'STOCKS',
    accountType: 'TAXABLE',
    institution: '',
    quantity: 0,
    price: 0,
    prevClose: 0,
    autoAmount: null,
    autoFrequency: null,
    autoNextAt: null,
    autoLastAt: null,
    openingCostPerShare: null,
    openingAcquiredAt: null,
    providerId: null,
    appreciationPct: null,
    createdAt: D('2024-01-01'),
    updatedAt: D('2024-01-01'),
    ...p,
  }
}

export function tx(holdingId: string, type: 'BUY' | 'SELL', quantity: number, price: number, date: string, p: Partial<Transaction> = {}): Transaction {
  return {
    id: id('t'),
    userId: 'u1',
    holdingId,
    type,
    quantity,
    price,
    amount: quantity * price,
    date: D(date),
    affectedCash: false,
    cashHoldingId: null,
    source: 'MANUAL',
    createdAt: D(date),
    ...p,
  }
}

export function liability(p: Partial<Liability> = {}): Liability {
  return {
    id: id('l'),
    userId: 'u1',
    name: 'Loan',
    type: 'OTHER',
    institution: '',
    balance: 0,
    interestRatePct: 0,
    minPayment: 0,
    holdingId: null,
    createdAt: D('2024-01-01'),
    updatedAt: D('2024-01-01'),
    ...p,
  }
}

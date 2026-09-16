import { describe, it, expect, vi, beforeEach } from 'vitest'
import { holding, D } from '../test/factories'

const db = vi.hoisted(() => ({
  holding: { findMany: vi.fn(), update: vi.fn((arg) => ({ op: 'update', arg })) },
  transaction: { createMany: vi.fn((arg) => ({ op: 'createMany', arg })) },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}))
vi.mock('./prisma', () => ({ default: db }))

import { nextRun, processDueAutoInvest } from './auto-invest'

const day = (d: Date) => d.toISOString().slice(0, 10)

describe('nextRun', () => {
  const from = D('2026-01-31T09:30:00Z')
  it('advances by the frequency from midnight UTC', () => {
    expect(day(nextRun(from, 'DAILY'))).toBe('2026-02-01')
    expect(day(nextRun(from, 'WEEKLY'))).toBe('2026-02-07')
    expect(day(nextRun(from, 'BIWEEKLY'))).toBe('2026-02-14')
  })

  it('runs semimonthly on the 1st and 15th', () => {
    expect(day(nextRun(D('2026-03-03'), 'SEMIMONTHLY'))).toBe('2026-03-15')
    expect(day(nextRun(D('2026-03-15'), 'SEMIMONTHLY'))).toBe('2026-04-01')
    expect(day(nextRun(D('2026-12-20'), 'SEMIMONTHLY'))).toBe('2027-01-01')
  })

  it('clamps monthly runs to the end of shorter months', () => {
    expect(day(nextRun(from, 'MONTHLY'))).toBe('2026-02-28')
    expect(day(nextRun(D('2028-01-31'), 'MONTHLY'))).toBe('2028-02-29') // leap year
    expect(day(nextRun(D('2026-12-15'), 'MONTHLY'))).toBe('2027-01-15')
  })
})

describe('processDueAutoInvest', () => {
  beforeEach(() => vi.clearAllMocks())

  it('catches up missed periods, logging a BUY for each', async () => {
    const h = holding({ quantity: 10, price: 80, autoAmount: 400, autoFrequency: 'WEEKLY', autoNextAt: D('2026-09-01') })
    db.holding.findMany.mockResolvedValue([h])

    expect(await processDueAutoInvest(D('2026-09-16'))).toBe(1)
    const [updateOp, createOp] = (db.$transaction.mock.calls[0] as unknown as [[{ arg: any }, { arg: any }]])[0]
    expect(updateOp.arg.data.quantity).toBeCloseTo(25, 10) // 3 × $400 / $80
    expect(day(updateOp.arg.data.autoNextAt)).toBe('2026-09-22')
    expect(createOp.arg.data.map((t: any) => [day(t.date), t.quantity, t.amount, t.source, t.type])).toEqual([
      ['2026-09-01', 5, 400, 'AUTO_INVEST', 'BUY'],
      ['2026-09-08', 5, 400, 'AUTO_INVEST', 'BUY'],
      ['2026-09-15', 5, 400, 'AUTO_INVEST', 'BUY'],
    ])
  })

  it('advances the schedule without buying when there is no price', async () => {
    db.holding.findMany.mockResolvedValue([holding({ quantity: 1, price: 0, autoAmount: 100, autoFrequency: 'MONTHLY', autoNextAt: D('2026-09-01') })])
    expect(await processDueAutoInvest(D('2026-09-16'))).toBe(0)
    const [updateOp, createOp] = (db.$transaction.mock.calls[0] as unknown as [[{ arg: any }, { arg: any }]])[0]
    expect(updateOp.arg.data.quantity).toBe(1)
    expect(day(updateOp.arg.data.autoNextAt)).toBe('2026-10-01')
    expect(createOp.arg.data).toEqual([])
  })
})

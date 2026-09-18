import { describe, it, expect } from 'vitest'
import { incomeTax, marginalRate, bracketCeiling, classify, assetLocation, rothLadder, replacementsFor, bucketOf } from './tax'
import type { LadderInput } from './tax'
import { holding } from '../test/factories'
import { AccountType, Category } from '@prisma/client'

describe('2026 federal income tax', () => {
  it('applies the standard deduction and brackets (single)', () => {
    expect(incomeTax(16_100, 'SINGLE')).toBe(0)
    // 50,000 − 16,100 = 33,900 taxable: 12,400 at 10% + 21,500 at 12%
    expect(incomeTax(50_000, 'SINGLE')).toBeCloseTo(1_240 + 2_580, 6)
    expect(marginalRate(50_000, 'SINGLE')).toBe(12)
    expect(marginalRate(70_000, 'SINGLE')).toBe(22)
  })

  it('applies married-filing-jointly brackets', () => {
    // 100,000 − 32,200 = 67,800 taxable: 24,800 at 10% + 43,000 at 12%
    expect(incomeTax(100_000, 'MARRIED_JOINT')).toBeCloseTo(2_480 + 5_160, 6)
  })

  it('finds the gross income that fills a bracket', () => {
    expect(bracketCeiling(12, 'SINGLE')).toBe(66_500)
    expect(bracketCeiling(22, 'MARRIED_JOINT')).toBe(243_600)
    expect(incomeTax(bracketCeiling(12, 'SINGLE'), 'SINGLE')).toBeCloseTo(1_240 + 4_560, 6)
    expect(() => bracketCeiling(37, 'SINGLE')).toThrow()
  })
})

describe('classify / bucketOf', () => {
  it('sorts holdings into tax classes', () => {
    expect(classify('MUB', 'STOCKS')).toBe('MUNI')
    expect(classify('BND', 'STOCKS')).toBe('BOND')
    expect(classify('XYZ', 'BONDS')).toBe('BOND')
    expect(classify('VNQ', 'STOCKS')).toBe('REIT')
    expect(classify('SCHD', 'STOCKS')).toBe('HIGH_YIELD')
    expect(classify('VXUS', 'STOCKS')).toBe('INTERNATIONAL')
    expect(classify('VOO', 'STOCKS')).toBe('BROAD_INDEX')
    expect(classify('NVDA', 'STOCKS')).toBe('GROWTH')
    expect(classify('BTC', 'CRYPTO')).toBe('GROWTH')
    expect(classify('XAU', 'METALS')).toBe('COLLECTIBLE')
    expect(classify('CASH', 'CASH')).toBe('CASH')
  })

  it('treats HSAs as tax-free for placement', () => {
    expect(bucketOf('ROTH_IRA')).toBe('FREE')
    expect(bucketOf('HSA')).toBe('FREE')
    expect(bucketOf('TRADITIONAL_401K')).toBe('DEFERRED')
    expect(bucketOf('OTHER')).toBe('TAXABLE')
  })
})

describe('assetLocation', () => {
  const h = (symbol: string, accountType: AccountType, value: number, category: Category = 'STOCKS') =>
    holding({ symbol, accountType, category, quantity: 1, price: value })

  it('flags bonds in taxable while retirement accounts hold stocks', () => {
    const r = assetLocation([h('BND', 'TAXABLE', 40_000), h('VTI', 'TRADITIONAL_IRA', 25_000)])
    expect(r.findings[0]).toMatchObject({ severity: 'high', amount: 25_000, symbols: ['BND'] })
    expect(r.buckets.TAXABLE.BOND).toBe(40_000)
  })

  it('flags munis in tax-sheltered accounts and bonds in Roth vs growth in traditional', () => {
    const r = assetLocation([h('VTEB', 'TRADITIONAL_IRA', 5_000), h('BND', 'ROTH_IRA', 8_000), h('NVDA', 'TRADITIONAL_401K', 20_000)])
    const titles = r.findings.map((f) => f.title)
    expect(titles).toContain('Municipal bonds belong in taxable accounts')
    expect(r.findings.find((f) => f.title.startsWith('Give your Roth'))!.amount).toBe(8_000)
  })

  it('notes the collectibles rate and ignores property', () => {
    const r = assetLocation([h('XAU', 'TAXABLE', 10_000, 'METALS'), h('HOME', 'OTHER', 500_000, 'REAL_ESTATE')])
    expect(r.findings.map((f) => f.severity)).toEqual(['info'])
    expect(r.buckets.TAXABLE.OTHER).toBeUndefined()
  })

  it('says so when placement already looks efficient', () => {
    const r = assetLocation([h('VTI', 'TAXABLE', 50_000), h('BND', 'TRADITIONAL_IRA', 30_000), h('QQQ', 'ROTH_IRA', 20_000)])
    expect(r.findings).toEqual([expect.objectContaining({ severity: 'good' })])
  })
})

describe('rothLadder', () => {
  const base: LadderInput = {
    currentAge: 65,
    retirementAge: 65,
    convertibleBalance: 300_000,
    investableTotal: 300_000,
    monthlyContribution: 0,
    realReturn: 0,
    socialSecurityAnnual: 0,
    ssStartAge: 70,
    pensionAnnual: 0,
    pensionStartAge: 99,
    filingStatus: 'SINGLE',
    targetBracketPct: 12,
  }

  it('fills the target bracket each year until the balance runs out', () => {
    const r = rothLadder(base)
    expect(r.applicable).toBe(true)
    expect(r.startAge).toBe(65)
    expect(r.endAge).toBe(72)
    expect(r.years.slice(0, 4).map((y) => y.conversion)).toEqual([66_500, 66_500, 66_500, 66_500])
    expect(r.years[4].conversion).toBeCloseTo(300_000 - 4 * 66_500, 6)
    expect(r.years[0].tax).toBeCloseTo(5_800, 6)
    expect(r.totalConverted).toBeCloseTo(300_000, 6)
    expect(r.rmdAt73.withLadder).toBeCloseTo(0, 6)
    expect(r.rmdAt73.withoutLadder).toBeCloseTo(300_000 / 26.5, 6)
    expect(r.penaltyFreeFromAge).toBeNull() // already past 59½
  })

  it('leaves less room once Social Security and pensions count as income', () => {
    const r = rothLadder({ ...base, socialSecurityAnnual: 30_000, ssStartAge: 67 })
    expect(r.years[0].otherIncome).toBe(0)
    expect(r.years[2].otherIncome).toBeCloseTo(25_500, 6)
    expect(r.years[2].conversion).toBeCloseTo(66_500 - 25_500, 6)
  })

  it('grows the balance to retirement and applies the 5-year rule for early retirees', () => {
    const r = rothLadder({ ...base, currentAge: 45, retirementAge: 50, realReturn: 0.05, monthlyContribution: 1000, investableTotal: 600_000 })
    // 5 years of growth plus half of each year's savings (300k of 600k investable).
    let bal = 300_000
    for (let i = 0; i < 5; i++) bal = (bal + 6000) * 1.05
    expect(r.balanceAtStart).toBeCloseTo(bal, 6)
    expect(r.penaltyFreeFromAge).toBe(55)
  })

  it('explains when it does not apply', () => {
    expect(rothLadder({ ...base, convertibleBalance: 0 }).reason).toMatch(/No traditional/)
    expect(rothLadder({ ...base, currentAge: 74, retirementAge: 60 }).applicable).toBe(false)
  })
})

describe('replacementsFor', () => {
  it('suggests similar funds that track a different index', () => {
    const voo = replacementsFor('VOO', 'STOCKS')
    expect(voo.replacements.map((r) => r.symbol)).toEqual(['VTI', 'ITOT', 'SCHB'])
    voo.replacements.forEach((r) => expect(r.tracks).not.toBe('S&P 500'))
    expect(replacementsFor('vti', 'STOCKS').replacements.map((r) => r.symbol)).toEqual(['ITOT', 'SCHB', 'VOO'])
    expect(replacementsFor('QQQ', 'STOCKS').replacements.map((r) => r.symbol)).toEqual(['VUG', 'SCHG', 'IWF'])
  })

  it('maps individual stocks to sector funds', () => {
    expect(replacementsFor('NVDA', 'STOCKS').replacements.map((r) => r.symbol)).toEqual(['SMH', 'SOXX'])
    expect(replacementsFor('AAPL', 'STOCKS').note).toMatch(/technology/)
  })

  it('gives guidance instead of pairs for crypto and unknown tickers', () => {
    expect(replacementsFor('ETH', 'CRYPTO')).toEqual({ replacements: [], note: expect.stringMatching(/crypto/i) })
    expect(replacementsFor('ZZZZ', 'STOCKS').replacements).toEqual([])
  })
})

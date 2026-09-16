import { describe, it, expect } from 'vitest'
import { estimateValue, isEstimated, estimatedPrices } from './assets'
import { holding, D } from '../test/factories'

describe('property value estimates', () => {
  it('compounds the purchase price by the annual rate', () => {
    expect(estimateValue(100000, D('2024-09-16'), 3, D('2026-09-16'))).toBeCloseTo(106090, -1)
    expect(estimateValue(36000, D('2025-09-16'), -15, D('2026-09-16'))).toBeCloseTo(30600, -1)
  })

  it('never values before the purchase date below the purchase price', () => {
    expect(estimateValue(100000, D('2030-01-01'), 5, D('2026-01-01'))).toBe(100000)
  })

  it('only estimates fully specified real estate and vehicles', () => {
    const house = holding({ category: 'REAL_ESTATE', appreciationPct: 3.5, openingCostPerShare: 400000, openingAcquiredAt: D('2020-01-01') })
    expect(isEstimated(house)).toBe(true)
    expect(isEstimated({ ...house, appreciationPct: null })).toBe(false)
    expect(isEstimated({ ...house, category: 'STOCKS' })).toBe(false)
  })

  it('gives yesterday’s estimate as the previous close', () => {
    const car = holding({ category: 'VEHICLE', appreciationPct: -15, openingCostPerShare: 30000, openingAcquiredAt: D('2025-01-01') })
    const now = D('2026-01-01')
    const p = estimatedPrices(car, now)!
    expect(p.price).toBeCloseTo(estimateValue(30000, D('2025-01-01'), -15, now), 8)
    expect(p.prevClose).toBeGreaterThan(p.price) // depreciating
    expect(estimatedPrices(holding({ category: 'STOCKS' }))).toBeNull()
  })
})

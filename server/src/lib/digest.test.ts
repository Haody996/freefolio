import { describe, it, expect, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import { D } from '../test/factories'

vi.mock('./prisma', () => ({ default: {} }))

import { isDue, unsubscribeToken, verifyUnsubscribeToken, renderDigest, digestHeaders } from './digest'
import type { DigestData } from './digest'

describe('isDue', () => {
  const monday = D('2026-09-14T14:00:00Z')
  const tuesday = D('2026-09-15T14:00:00Z')
  const first = D('2026-10-01T14:00:00Z')

  it('sends weekly digests on Mondays, once', () => {
    expect(isDue('WEEKLY', null, monday)).toBe(true)
    expect(isDue('WEEKLY', null, tuesday)).toBe(false)
    expect(isDue('WEEKLY', D('2026-09-14T13:00:00Z'), monday)).toBe(false) // rerun same day
    expect(isDue('WEEKLY', D('2026-09-07T14:00:00Z'), monday)).toBe(true)
  })

  it('sends monthly digests on the 1st, once', () => {
    expect(isDue('MONTHLY', null, first)).toBe(true)
    expect(isDue('MONTHLY', null, monday)).toBe(false)
    expect(isDue('MONTHLY', D('2026-10-01T00:00:00Z'), first)).toBe(false)
    expect(isDue('MONTHLY', D('2026-09-01T14:00:00Z'), first)).toBe(true)
  })

  it('never sends when off', () => {
    expect(isDue('OFF', null, monday)).toBe(false)
  })
})

describe('unsubscribe tokens', () => {
  it('round-trips and rejects other tokens', () => {
    expect(verifyUnsubscribeToken(unsubscribeToken('user-1'))).toBe('user-1')
    // A login token (no purpose) must not unsubscribe anyone.
    expect(verifyUnsubscribeToken(jwt.sign({ userId: 'user-1' }, process.env.JWT_SECRET || 'secret'))).toBeNull()
    expect(verifyUnsubscribeToken(jwt.sign({ userId: 'user-1', purpose: 'digest-unsubscribe' }, 'wrong-secret'))).toBeNull()
    expect(verifyUnsubscribeToken('garbage')).toBeNull()
  })
})

describe('renderDigest', () => {
  const data: DigestData = {
    frequency: 'WEEKLY',
    firstName: '<script>alert(1)</script>',
    periodLabel: 'this week',
    startDate: '2026-09-09',
    netWorth: 250000,
    assets: 300000,
    liabilities: 50000,
    startNetWorth: 240000,
    change: 10000,
    changePct: 10000 / 240000,
    gainers: [{ symbol: 'NVDA', name: '<img src=x onerror=alert(1)>', change: 1234, changePct: 0.05 }],
    decliners: [{ symbol: 'AAPL', name: 'Apple', change: -500, changePct: -0.02 }],
    fire: { invested: 200000, goal: 1000000, progress: 0.2, goalLabel: 'your FIRE number' },
  }

  it('escapes user-controlled text', () => {
    const { html } = renderDigest(data, 'user-1')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;script&gt;')
  })

  it('summarizes the change, movers, debts and FIRE progress', () => {
    const { subject, html, text } = renderDigest(data, 'user-1')
    expect(subject).toBe('Your net worth rose +$10,000 this week')
    expect(html).toContain('$250,000')
    expect(html).toContain('Debts $50,000')
    expect(html).toContain('NVDA')
    expect(html).toContain('20.0%')
    expect(text).toContain('Net worth: $250,000 (+$10,000 since 2026-09-09)')
  })

  it('handles falls, missing history and no debts', () => {
    expect(renderDigest({ ...data, change: -2500 }, 'u').subject).toBe('Your net worth fell −$2,500 this week')
    const quiet = renderDigest({ ...data, change: null, changePct: null, startNetWorth: null, liabilities: 0, gainers: [], decliners: [], fire: null }, 'u')
    expect(quiet.subject).toBe('Your weekly getfreefolio digest')
    expect(quiet.html).toContain('Not enough history yet')
    expect(quiet.html).not.toContain('Debts')
    expect(quiet.html).not.toContain('FIRE progress')
  })

  it('includes a working one-click unsubscribe link and header', () => {
    const { html } = renderDigest(data, 'user-1')
    const link = html.match(/\/api\/digest\/unsubscribe\?token=([^"]+)"/)![1]
    expect(verifyUnsubscribeToken(decodeURIComponent(link))).toBe('user-1')
    expect(digestHeaders('user-1')['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
  })
})

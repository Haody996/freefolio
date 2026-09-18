import { describe, it, expect } from 'vitest'
import { validateContents, systemInstruction, TOOLS } from './assistant'
import { allow } from './rateLimit'
import { sanitizeOverrides } from '../routes/scenarios'

const user = (text: string) => ({ role: 'user', parts: [{ text }] })

describe('validateContents', () => {
  it('accepts a conversation ending with the user or a tool', () => {
    expect(validateContents([user('hi')])).toHaveLength(1)
    const convo = [
      user('Retire at 50?'),
      { role: 'model', parts: [{ functionCall: { name: 'run_retirement_scenario', args: { label: 'x' } }, thoughtSignature: 'abc' }] },
      { role: 'function', parts: [{ functionResponse: { name: 'run_retirement_scenario', response: { ok: true } } }] },
    ]
    expect(Array.isArray(validateContents(convo))).toBe(true)
  })

  it('rejects malformed or oversized input', () => {
    expect(validateContents([])).toMatch(/non-empty/)
    expect(validateContents('nope')).toMatch(/non-empty/)
    expect(validateContents([{ role: 'system', parts: [{ text: 'x' }] }])).toMatch(/malformed/)
    expect(validateContents([{ role: 'user', parts: [] }])).toMatch(/malformed/)
    expect(validateContents([{ role: 'user', parts: [{ inlineData: { data: 'x' } }] }])).toMatch(/unsupported/)
    expect(validateContents([user('hi'), { role: 'model', parts: [{ text: 'hello' }] }])).toMatch(/last turn/)
    expect(validateContents(Array.from({ length: 61 }, () => user('x')))).toMatch(/too long/)
    expect(validateContents([user('x'.repeat(160_000))])).toMatch(/too large/)
  })
})

describe('assistant setup', () => {
  it('embeds the date and the user data in the instructions', () => {
    const s = systemInstruction({ netWorth: 123 }, new Date('2026-09-18T00:00:00Z'))
    expect(s).toContain('Today is 2026-09-18')
    expect(s).toContain('"netWorth":123')
    expect(s).toMatch(/Never calculate projections/)
  })

  it('declares the tools the browser implements', () => {
    expect(TOOLS.map((t) => t.name)).toEqual(['run_retirement_scenario', 'run_debt_payoff', 'analyze_retirement_levers', 'get_tax_insights'])
    expect(TOOLS[0].parameters!.required).toEqual(['label'])
  })
})

describe('rate limiting', () => {
  it('allows up to the limit within the window, then recovers', () => {
    const t0 = 1_000_000
    for (let i = 0; i < 3; i++) expect(allow('k', 3, 60_000, t0 + i)).toBe(true)
    expect(allow('k', 3, 60_000, t0 + 10)).toBe(false)
    expect(allow('k', 3, 60_000, t0 + 61_000)).toBe(true)
  })
})

describe('sanitizeOverrides', () => {
  it('keeps only known, well-typed scenario fields', () => {
    expect(
      sanitizeOverrides({
        retirementAge: 50,
        spendingChange: -5000,
        withdrawalStrategy: 'GUARDRAILS',
        debtStrategy: 'NOPE',
        payOffDebts: ['Home mortgage', 42],
        marketDropPct: '30',
        __proto__: { evil: true },
        extra: 'x',
      })
    ).toEqual({ retirementAge: 50, spendingChange: -5000, withdrawalStrategy: 'GUARDRAILS', payOffDebts: ['Home mortgage'] })
    expect(sanitizeOverrides(null)).toEqual({})
  })
})

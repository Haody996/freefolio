import { describe, it, expect } from 'vitest'

// A React effect may only return a cleanup function. An arrow effect without
// braces returns its expression — e.g. scrollIntoView(), which returns a
// Promise in newer browsers — and React then crashes calling it as cleanup.
const sources = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('React effects', () => {
  it('scans the app source', () => {
    expect(Object.keys(sources).some((f) => f.endsWith('pages/Assistant.tsx'))).toBe(true)
  })

  it('never return an expression', () => {
    const offenders: string[] = []
    for (const [file, src] of Object.entries(sources)) {
      src.split('\n').forEach((line, i) => {
        if (/use(Layout)?Effect\(\s*\(\)\s*=>\s*[^{\s]/.test(line)) offenders.push(`${file}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})

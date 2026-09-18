import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import http from 'http'
import clientErrors from './clientErrors'
import { toGeminiContents } from '../lib/gemini'

async function post(body: unknown): Promise<number> {
  const app = express()
  app.use(express.json())
  app.use('/api/client-errors', clientErrors)
  const server = http.createServer(app).listen(0)
  try {
    const r = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/client-errors`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return r.status
  } finally {
    server.close()
  }
}

describe('POST /api/client-errors', () => {
  it('logs a clipped report and rate-limits per client', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await post({ message: 'x'.repeat(5000), where: 'assistant message (scenario)', stack: 'TypeError…' })).toBe(204)
    const line = log.mock.calls[0][0] as string
    expect(line).toContain('[client-error]')
    expect(line).toContain('assistant message (scenario)')
    expect(line.length).toBeLessThan(3500)
    for (let i = 0; i < 19; i++) await post({ message: 'again' })
    expect(await post({ message: 'too many' })).toBe(429)
    log.mockRestore()
  })
})

describe('toGeminiContents', () => {
  it('sends tool results as user turns', () => {
    const out = toGeminiContents([
      { role: 'user', parts: [{ text: 'q' }] },
      { role: 'function', parts: [{ functionResponse: { name: 't', response: {} } }] },
    ])
    expect(out.map((c) => c.role)).toEqual(['user', 'user'])
    expect(out[1].parts[0]).toHaveProperty('functionResponse')
  })
})

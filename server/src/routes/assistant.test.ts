import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import jwt from 'jsonwebtoken'
import http from 'http'

const gemini = vi.hoisted(() => ({ generateTurn: vi.fn(), generateText: vi.fn() }))
vi.mock('../lib/gemini', async (importOriginal) => ({ ...(await importOriginal<typeof import('../lib/gemini')>()), ...gemini }))

import assistantRoutes from './assistant'
import { AiUnavailableError } from '../lib/gemini'
import { TOOLS } from '../lib/assistant'

const token = (userId: string) => `Bearer ${jwt.sign({ userId }, process.env.JWT_SECRET || 'secret')}`

async function post(path: string, body: unknown, userId = 'u1'): Promise<{ status: number; json: any }> {
  const app = express()
  app.use(express.json({ limit: '1mb' }))
  app.use('/api/assistant', assistantRoutes)
  const server = http.createServer(app).listen(0)
  const port = (server.address() as { port: number }).port
  try {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token(userId) }, body: JSON.stringify(body) })
    return { status: r.status, json: await r.json() }
  } finally {
    server.close()
  }
}

const question = { context: { netWorth: 1 }, contents: [{ role: 'user', parts: [{ text: 'Retire at 50?' }] }] }

describe('POST /api/assistant/chat', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the model turn and passes the tools and user context', async () => {
    gemini.generateTurn.mockResolvedValue({ role: 'model', parts: [{ functionCall: { name: 'run_retirement_scenario', args: { label: 'At 50', retirementAge: 50 } } }] })
    const r = await post('/api/assistant/chat', question)
    expect(r.status).toBe(200)
    expect(r.json.content.parts[0].functionCall.args.retirementAge).toBe(50)
    const [instructions, contents, tools] = gemini.generateTurn.mock.calls[0]
    expect(instructions).toContain('"netWorth":1')
    expect(contents).toEqual(question.contents)
    expect(tools).toBe(TOOLS)
  })

  it('rejects bad conversations before calling the model', async () => {
    const r = await post('/api/assistant/chat', { contents: [{ role: 'model', parts: [{ text: 'x' }] }] })
    expect(r.status).toBe(400)
    expect(gemini.generateTurn).not.toHaveBeenCalled()
  })

  it('reports when AI is not configured, and when the model fails', async () => {
    gemini.generateTurn.mockRejectedValueOnce(new AiUnavailableError('no key'))
    expect((await post('/api/assistant/chat', question, 'u2')).status).toBe(503)
    gemini.generateTurn.mockRejectedValueOnce(new Error('boom'))
    expect((await post('/api/assistant/chat', question, 'u2')).status).toBe(502)
  })

  it('rate-limits each user to 60 calls an hour', async () => {
    gemini.generateTurn.mockResolvedValue({ role: 'model', parts: [{ text: 'ok' }] })
    for (let i = 0; i < 60; i++) expect((await post('/api/assistant/chat', question, 'busy')).status).toBe(200)
    expect((await post('/api/assistant/chat', question, 'busy')).status).toBe(429)
    expect((await post('/api/assistant/chat', question, 'someone-else')).status).toBe(200)
  })
})

describe('POST /api/assistant/explain-levers', () => {
  it('asks for a summary once per identical input per day', async () => {
    gemini.generateText.mockResolvedValue('Delaying Social Security helps most.')
    const body = { baseline: { successOddsPct: 72 }, improvements: [{ lever: 'SS at 70', oddsAfterPct: 84 }], risks: [] }
    const a = await post('/api/assistant/explain-levers', body, 'lev')
    const b = await post('/api/assistant/explain-levers', body, 'lev')
    expect(a.json.text).toBe('Delaying Social Security helps most.')
    expect(b.json.text).toBe(a.json.text)
    expect(gemini.generateText).toHaveBeenCalledTimes(1)
    expect((await post('/api/assistant/explain-levers', { improvements: [] }, 'lev')).status).toBe(400)
  })
})

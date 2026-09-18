import { Router, Response } from 'express'
import crypto from 'crypto'
import { authMiddleware, AuthRequest } from '../middleware/auth'
import { generateTurn, generateText, AiUnavailableError } from '../lib/gemini'
import { TOOLS, validateContents, systemInstruction, LEVERS_PROMPT } from '../lib/assistant'
import { allow } from '../lib/rateLimit'

const router = Router()
router.use(authMiddleware)

// 60 AI calls per user per hour (each tool round-trip counts as one).
export function aiRateOk(userId: string): boolean {
  return allow(`ai:${userId}`, 60, 60 * 60 * 1000)
}

function aiError(res: Response, err: unknown, label: string): void {
  if (err instanceof AiUnavailableError) {
    res.status(503).json({ error: 'AI features are not configured on this server.' })
    return
  }
  console.error(`[assistant] ${label} failed:`, String(err))
  res.status(502).json({ error: 'The AI service is unavailable right now — try again in a moment.' })
}

// POST /api/assistant/chat { context, contents } → { content }
// One model turn. If it contains function calls, the browser runs them and
// posts the results back as a "function" turn.
router.post('/chat', async (req: AuthRequest, res: Response): Promise<void> => {
  const contents = validateContents(req.body?.contents)
  if (typeof contents === 'string') {
    res.status(400).json({ error: contents })
    return
  }
  if (JSON.stringify(req.body?.context ?? {}).length > 40_000) {
    res.status(400).json({ error: 'context is too large' })
    return
  }
  if (!aiRateOk(req.userId!)) {
    res.status(429).json({ error: 'You have reached the hourly limit for AI requests — try again later.' })
    return
  }
  try {
    const content = await generateTurn(systemInstruction(req.body?.context), contents, TOOLS)
    const calls = content.parts.filter((p) => p.functionCall).map((p) => p.functionCall!.name)
    if (calls.length) console.log(`[assistant] model requested: ${calls.join(', ')}`)
    res.json({ content })
  } catch (err) {
    aiError(res, err, 'chat')
  }
})

// Explanations are cached per user for a day, keyed by the exact input.
const cache = new Map<string, { day: string; text: string }>()
export async function cachedExplain(userId: string, prompt: string, data: unknown): Promise<string> {
  const day = new Date().toISOString().slice(0, 10)
  const key = crypto.createHash('sha256').update(`${userId}|${prompt}|${JSON.stringify(data)}`).digest('hex')
  const hit = cache.get(key)
  if (hit && hit.day === day) return hit.text
  const text = await generateText(prompt, JSON.stringify(data))
  cache.set(key, { day, text })
  if (cache.size > 2000) cache.delete(cache.keys().next().value as string)
  return text
}

// POST /api/assistant/explain-levers { baseline, improvements, risks } → { text }
router.post('/explain-levers', async (req: AuthRequest, res: Response): Promise<void> => {
  const { baseline, improvements, risks } = req.body ?? {}
  if (!baseline || !Array.isArray(improvements) || JSON.stringify(req.body).length > 20_000) {
    res.status(400).json({ error: 'baseline and improvements are required' })
    return
  }
  if (!aiRateOk(req.userId!)) {
    res.status(429).json({ error: 'You have reached the hourly limit for AI requests — try again later.' })
    return
  }
  try {
    res.json({ text: await cachedExplain(req.userId!, LEVERS_PROMPT, { baseline, improvements, risks }) })
  } catch (err) {
    aiError(res, err, 'explain-levers')
  }
})

export default router

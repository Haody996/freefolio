import { GoogleGenerativeAI } from '@google/generative-ai'
import prisma from './prisma'

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null
// Newest stable flash first, with fallbacks. gemini-3.6-flash is ~2× faster and
// higher quality than 2.5-flash on this workload (benchmarked 2026-07-24).
const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash']

// One insight per user per UTC day, cached in-memory.
const cache = new Map<string, { date: string; text: string }>()

function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

interface Mover {
  symbol: string
  name: string
  category: string
  value: number
  dayChg: number
  dayPct: number
}

async function generate(
  netWorth: number,
  dayChg: number,
  dayPct: number,
  movers: Mover[]
): Promise<string> {
  if (!genAI) throw new Error('GEMINI_API_KEY not configured')

  const up = [...movers].filter((m) => m.dayChg > 0).sort((a, b) => b.dayChg - a.dayChg).slice(0, 3)
  const down = [...movers].filter((m) => m.dayChg < 0).sort((a, b) => a.dayChg - b.dayChg).slice(0, 3)
  const fmt = (m: Mover) => `${m.symbol} (${m.category.toLowerCase()}) ${m.dayPct >= 0 ? '+' : ''}${(m.dayPct * 100).toFixed(1)}%`

  const systemInstruction =
    "You are a sharp, friendly portfolio assistant. Given a snapshot of a retail investor's holdings and today's price moves, write a brief daily briefing: (1) one sentence summarizing today's portfolio movement, (2) one sentence of quick, relevant market/sector insight tied to their holdings. Be concrete and conversational. 2–3 sentences total, under 60 words. Plain text only — no markdown, no lists, no disclaimers, no financial advice."

  const prompt = [
    `Net worth: $${Math.round(netWorth).toLocaleString()}`,
    `Today's change: ${dayChg >= 0 ? '+' : ''}$${Math.round(dayChg).toLocaleString()} (${dayPct >= 0 ? '+' : ''}${(dayPct * 100).toFixed(2)}%)`,
    up.length ? `Top gainers: ${up.map(fmt).join(', ')}` : '',
    down.length ? `Top decliners: ${down.map(fmt).join(', ')}` : '',
    movers.length === 0 ? 'No market-priced holdings (cash/manual only).' : '',
    `Date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`,
  ]
    .filter(Boolean)
    .join('\n')

  let lastError: Error | undefined
  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction })
      const result = await model.generateContent(prompt)
      const text = result.response.text().trim()
      if (text) return text
      throw new Error('empty response')
    } catch (err: any) {
      lastError = err
      console.warn(`[insights] ${modelName} failed: ${err?.message}`)
    }
  }
  throw new Error(`All Gemini models failed: ${lastError?.message}`)
}

export async function getInsight(
  userId: string,
  refresh = false
): Promise<{ insight: string; asOf: string; cached: boolean }> {
  const date = todayKey()
  const hit = cache.get(userId)
  if (!refresh && hit && hit.date === date) return { insight: hit.text, asOf: date, cached: true }

  const holdings = await prisma.holding.findMany({ where: { userId } })
  let netWorth = 0
  let dayChg = 0
  const movers: Mover[] = []
  for (const h of holdings) {
    const value = h.quantity * h.price
    const chg = (h.price - h.prevClose) * h.quantity
    netWorth += value
    dayChg += chg
    movers.push({ symbol: h.symbol, name: h.name, category: h.category, value, dayChg: chg, dayPct: h.prevClose ? (h.price - h.prevClose) / h.prevClose : 0 })
  }
  const dayPct = netWorth - dayChg ? dayChg / (netWorth - dayChg) : 0

  if (holdings.length === 0) {
    const text = 'Add a few holdings and I’ll summarize your daily movement and surface quick market insight here every morning.'
    cache.set(userId, { date, text })
    return { insight: text, asOf: date, cached: false }
  }

  const text = await generate(netWorth, dayChg, dayPct, movers)
  cache.set(userId, { date, text })
  return { insight: text, asOf: date, cached: false }
}

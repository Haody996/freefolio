import { GoogleGenerativeAI, Content, FunctionDeclaration } from '@google/generative-ai'

// Shared Gemini access: newest stable flash first, with fallbacks.
// gemini-3.6-flash is ~2× faster and higher quality than 2.5-flash on the
// briefing workload (benchmarked 2026-07-24).
export const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-2.5-flash']

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null

export function isAiConfigured(): boolean {
  return genAI != null
}

export class AiUnavailableError extends Error {}

// One-shot text generation (briefings, explanations).
export async function generateText(systemInstruction: string, prompt: string): Promise<string> {
  if (!genAI) throw new AiUnavailableError('GEMINI_API_KEY not configured')
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
      console.warn(`[gemini] ${modelName} failed: ${err?.message}`)
    }
  }
  throw new Error(`All Gemini models failed: ${lastError?.message}`)
}

// One conversational turn with tools. Returns the model's content as-is
// (text and/or function calls, including any thought signatures) so the
// caller can send it back verbatim on the next turn.
export async function generateTurn(systemInstruction: string, contents: Content[], functionDeclarations: FunctionDeclaration[]): Promise<Content> {
  if (!genAI) throw new AiUnavailableError('GEMINI_API_KEY not configured')
  let lastError: Error | undefined
  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction, tools: [{ functionDeclarations }] })
      const result = await model.generateContent({ contents })
      const content = result.response.candidates?.[0]?.content
      if (content?.parts?.length) return { role: 'model', parts: content.parts }
      throw new Error(`empty response (${result.response.candidates?.[0]?.finishReason ?? 'no candidate'})`)
    } catch (err: any) {
      lastError = err
      console.warn(`[gemini] ${modelName} failed: ${err?.message}`)
    }
  }
  throw new Error(`All Gemini models failed: ${lastError?.message}`)
}

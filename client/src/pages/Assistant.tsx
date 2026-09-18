import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Sparkles, SendHorizontal } from 'lucide-react'
import api from '../lib/api'
import { useIsMobile } from '../lib/useIsMobile'
import Spinner from '../components/ui/Spinner'
import RichText from '../components/assistant/RichText'
import ScenarioCard from '../components/assistant/ScenarioCard'
import DebtScenarioCard from '../components/assistant/DebtScenarioCard'
import LeversTable from '../components/assistant/LeversTable'
import { runTool, buildAssistantContext } from '../lib/assistantTools'
import type { ToolCard } from '../lib/assistantTools'
import type { PlanData } from '../lib/scenarios'
import type { Holding, Liability } from '../lib/portfolio'
import { fmtUSD } from '../lib/portfolio'
import type { GainsReport } from '../lib/reports'
import { panel, pageTitle, secondaryBtn } from '../components/ui/styles'
import ErrorBoundary from '../components/ui/ErrorBoundary'
import { reportError } from '../lib/reportError'

// Gemini conversation turns, exactly as the API expects them.
interface Part {
  text?: string
  thought?: boolean
  thoughtSignature?: string
  functionCall?: { name: string; args?: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }
}
interface Content {
  role: 'user' | 'model' | 'function'
  parts: Part[]
}

type Msg =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string }
  | { role: 'tool'; label: string; card?: ToolCard; error?: string }
  | { role: 'error'; text: string }

const SUGGESTIONS = [
  'Can I retire at 50 if I pay off the mortgage first?',
  'What if the market drops 30% next year?',
  'What matters most for my retirement odds?',
  'How much sooner am I debt-free with $500/mo extra?',
  'Where could I save on taxes?',
]

const TOOL_LABEL: Record<string, string> = {
  run_retirement_scenario: 'retirement scenario',
  run_debt_payoff: 'debt payoff plan',
  analyze_retirement_levers: 'what matters most',
  get_tax_insights: 'tax analysis',
}

const STORE = 'ff_assistant_v1'
const PART_KEYS = ['text', 'thought', 'thoughtSignature', 'functionCall', 'functionResponse'] as const

function load(): { contents: Content[]; msgs: Msg[] } {
  try {
    const raw = sessionStorage.getItem(STORE)
    const saved = raw ? JSON.parse(raw) : null
    // Only restore a well-formed chat; anything else starts fresh.
    if (saved && Array.isArray(saved.contents) && Array.isArray(saved.msgs) && saved.msgs.every((m: Msg) => m && typeof m.role === 'string')) return saved
  } catch {
    // storage unavailable or corrupt — start fresh
  }
  return { contents: [], msgs: [] }
}

// Keep only the part fields the server accepts (and Gemini needs back).
function clean(content: Content): Content {
  return {
    role: 'model',
    parts: content.parts.map((p) => Object.fromEntries(PART_KEYS.filter((k) => p[k] !== undefined).map((k) => [k, p[k]])) as Part),
  }
}

export default function Assistant() {
  const isMobile = useIsMobile()
  const [{ contents, msgs }, setChat] = useState(load)
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const holdingsQ = useQuery<{ holdings: Holding[] }>({ queryKey: ['holdings'], queryFn: async () => (await api.get('/holdings')).data })
  const liabilitiesQ = useQuery<{ liabilities: Liability[] }>({ queryKey: ['liabilities'], queryFn: async () => (await api.get('/liabilities')).data })
  const settingsQ = useQuery<{ settings: Record<string, unknown> }>({ queryKey: ['projection'], queryFn: async () => (await api.get('/projection')).data })
  const gainsQ = useQuery<GainsReport>({ queryKey: ['gains'], queryFn: async () => (await api.get('/gains')).data })

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ contents, msgs }))
    } catch {
      // storage full or blocked — the chat still works for this page view
    }
  }, [contents, msgs])
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [msgs, status])

  const ready = holdingsQ.data && liabilitiesQ.data && settingsQ.data
  const data: PlanData | null = ready ? { holdings: holdingsQ.data!.holdings, liabilities: liabilitiesQ.data!.liabilities, settings: settingsQ.data!.settings } : null

  async function ask(question: string) {
    const text = question.trim()
    if (!text || status || !data) return
    setInput('')
    const before = contents
    let convo: Content[] = [...contents, { role: 'user', parts: [{ text }] }]
    const add = (m: Msg) => setChat((c) => ({ ...c, msgs: [...c.msgs, m] }))
    add({ role: 'user', text })

    try {
      const gains = new Map((gainsQ.data?.holdings ?? []).map((g) => [g.holdingId, g.unrealized]))
      const context = buildAssistantContext(data, gains)
      for (let round = 0; round < 6; round++) {
        setStatus(round === 0 ? 'Thinking…' : 'Explaining the results…')
        const { data: res } = await api.post('/assistant/chat', { context, contents: convo })
        const content = clean(res.content as Content)
        convo = [...convo, content]
        const reply = content.parts
          .filter((p) => typeof p.text === 'string' && !p.thought)
          .map((p) => p.text)
          .join('')
          .trim()
        if (reply) add({ role: 'assistant', text: reply })
        const calls = content.parts.filter((p) => p.functionCall)
        if (!calls.length) break

        const responses: Part[] = []
        for (const { functionCall } of calls) {
          const { name, args = {} } = functionCall!
          const label = typeof args.label === 'string' ? args.label : TOOL_LABEL[name] ?? name
          setStatus(`Running ${label}…`)
          try {
            const out = await runTool(name, args, data)
            responses.push({ functionResponse: { name, response: out.response } })
            add({ role: 'tool', label, card: out.card })
          } catch (toolErr) {
            reportError(toolErr, `assistant tool ${name}`)
            responses.push({ functionResponse: { name, response: { error: 'The calculation failed.' } } })
            add({ role: 'tool', label, error: 'Calculation failed' })
          }
        }
        convo = [...convo, { role: 'function', parts: responses }]
      }
      // A conversation must end on a model turn to accept the next question.
      setChat((c) => ({ ...c, contents: convo[convo.length - 1].role === 'model' ? convo : before }))
    } catch (err: any) {
      if (!err?.response) reportError(err, 'assistant.ask')
      const msg = err?.response?.data?.error || 'Something went wrong — try again.'
      setChat((c) => ({ contents: before, msgs: [...c.msgs, { role: 'error', text: msg }] }))
    } finally {
      setStatus(null)
    }
  }

  function reset() {
    setChat({ contents: [], msgs: [] })
  }

  return (
    <>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ ...pageTitle, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={22} color="#9B7CFF" /> Ask AI
          </h1>
          <div style={{ color: '#8A90A2', fontSize: 13, marginTop: 4 }}>What-ifs on your real plan — the planner runs the numbers, AI explains them.</div>
        </div>
        {msgs.length > 0 && (
          <button onClick={reset} style={secondaryBtn} disabled={!!status}>
            New chat
          </button>
        )}
      </header>

      <section style={{ ...panel, padding: isMobile ? 16 : 24, display: 'flex', flexDirection: 'column', gap: 14, minHeight: '55vh' }}>
        {!data ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Spinner />
          </div>
        ) : msgs.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, padding: '10px 0' }}>
            <div style={{ fontFamily: "'Space Grotesk'", fontSize: 18, fontWeight: 700 }}>Ask anything about your money</div>
            <div style={{ fontSize: 13.5, color: '#8A90A2', maxWidth: 560, lineHeight: 1.55 }}>
              Retirement what-ifs, market crashes, debt payoff, taxes. Every projection is simulated with your holdings, debts and plan — the same math as the Retirement page.
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s)} style={{ border: '1px solid rgba(155,124,255,0.3)', background: 'rgba(155,124,255,0.08)', color: '#C9CDD8', borderRadius: 999, padding: '8px 13px', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} aria-live="polite">
            {msgs.map((m, i) => (
              <ErrorBoundary
                key={i}
                where={`assistant message (${m.role === 'tool' ? m.card?.kind ?? 'tool' : m.role})`}
                fallback={() => <div style={{ fontSize: 13, color: '#FF5470' }}>Couldn’t display this part of the answer — the problem has been reported.</div>}
              >
                <Message msg={m} />
              </ErrorBoundary>
            ))}
            {status && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#8A90A2', fontSize: 13 }}>
                <Spinner /> {status}
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            ask(input)
          }}
          style={{ marginTop: 'auto', display: 'flex', gap: 8, alignItems: 'flex-end', borderTop: msgs.length ? '1px solid rgba(255,255,255,0.07)' : 'none', paddingTop: msgs.length ? 14 : 0 }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                ask(input)
              }
            }}
            rows={2}
            maxLength={1000}
            placeholder="e.g. What if I retire at 52 and spend $70k a year?"
            aria-label="Your question"
            disabled={!data}
            style={{ flex: 1, resize: 'none', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '11px 13px', color: '#F2F4F8', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.45 }}
          />
          <button
            type="submit"
            disabled={!input.trim() || !!status || !data}
            aria-label="Send"
            style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 12, border: 'none', background: input.trim() && !status ? '#22E38A' : '#3A3F4C', color: '#04140C', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() && !status ? 'pointer' : 'default' }}
          >
            <SendHorizontal size={18} />
          </button>
        </form>
        <div style={{ fontSize: 11.5, color: '#5B6172', lineHeight: 1.5 }}>
          Your numbers are sent to Google Gemini to write the answers. Educational only — not financial or tax advice.
        </div>
      </section>
    </>
  )
}

function Message({ msg }: { msg: Msg }) {
  if (msg.role === 'user') {
    return (
      <div style={{ alignSelf: 'flex-end', maxWidth: '85%', background: 'rgba(34,227,138,0.12)', border: '1px solid rgba(34,227,138,0.25)', borderRadius: '14px 14px 4px 14px', padding: '9px 13px', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
        {msg.text}
      </div>
    )
  }
  if (msg.role === 'assistant') {
    return (
      <div style={{ maxWidth: '92%', fontSize: 14.5, lineHeight: 1.6, color: '#E7EAF1' }}>
        <RichText text={msg.text} />
      </div>
    )
  }
  if (msg.role === 'error') {
    return <div style={{ fontSize: 13.5, color: '#FF5470' }}>{msg.text}</div>
  }
  const card = msg.card
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11.5, color: '#8A90A2' }}>
        {msg.error ? '⚠' : '✓'} Ran {msg.label}
        {msg.error && ` — ${msg.error}`}
      </div>
      {card?.kind === 'scenario' && <ScenarioCard result={card.result} />}
      {card?.kind === 'debt' && <DebtScenarioCard label={card.label} result={card.result} />}
      {card?.kind === 'levers' && (
        <div style={{ background: '#16181F', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 16 }}>
          <LeversTable result={card.result} limit={5} />
        </div>
      )}
      {card?.kind === 'tax' && (
        <Link to="/taxes" style={{ display: 'block', background: '#16181F', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '12px 16px', color: '#C9CDD8', fontSize: 13 }}>
          <b style={{ color: '#F2F4F8' }}>Tax analysis</b> · {card.summary.findings} placement {card.summary.findings === 1 ? 'idea' : 'ideas'}
          {card.summary.harvestable < 0 && ` · ${fmtUSD(Math.abs(card.summary.harvestable))} of harvestable losses`}
          {card.summary.converted > 0 && ` · Roth ladder converts ${fmtUSD(card.summary.converted)}`}
          <span style={{ color: '#22E38A', fontWeight: 700 }}> · Open tax planner →</span>
        </Link>
      )}
    </div>
  )
}

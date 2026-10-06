import { describe, it, expect } from 'vitest'
import { recentExchanges, MEMORY_QUESTIONS } from './assistantMemory'

type Turn = { role: 'user' | 'model' | 'function'; id: string }
const q = (id: string): Turn => ({ role: 'user', id })
const call = (id: string): Turn => ({ role: 'model', id })
const result = (id: string): Turn => ({ role: 'function', id })
const answer = (id: string): Turn => ({ role: 'model', id })

// Five questions; the second and fourth ran a tool before answering.
const chat: Turn[] = [
  q('q1'), answer('a1'),
  q('q2'), call('c2'), result('r2'), answer('a2'),
  q('q3'), answer('a3'),
  q('q4'), call('c4'), result('r4'), call('c4b'), result('r4b'), answer('a4'),
  q('q5'), answer('a5'),
]

describe('recentExchanges', () => {
  it('remembers three questions by default', () => {
    expect(MEMORY_QUESTIONS).toBe(3)
  })

  it('keeps the last three questions with their tool calls, results and answers', () => {
    expect(recentExchanges(chat).map((t) => t.id)).toEqual(['q3', 'a3', 'q4', 'c4', 'r4', 'c4b', 'r4b', 'a4', 'q5', 'a5'])
  })

  it('always starts on a question, never mid-exchange', () => {
    for (let n = 1; n <= 5; n++) expect(recentExchanges(chat, n)[0].role).toBe('user')
  })

  it('keeps a short chat whole', () => {
    expect(recentExchanges(chat.slice(0, 6))).toEqual(chat.slice(0, 6))
    expect(recentExchanges([])).toEqual([])
  })

  it('makes room for a new question: last three answered plus the one being asked', () => {
    const sent = [...recentExchanges(chat), q('q6')]
    expect(sent.filter((t) => t.role === 'user').map((t) => t.id)).toEqual(['q3', 'q4', 'q5', 'q6'])
  })
})

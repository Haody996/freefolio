// Ask AI remembers the last few questions of a chat so follow-ups ("what about
// 52 instead?") work, without the conversation growing until it is rejected.
export const MEMORY_QUESTIONS = 3

// Keeps the last `n` complete exchanges. Each one starts at a user question and
// runs through the model's final answer, including its tool calls and results
// (tool results are "function" turns, so every "user" turn is a question).
export function recentExchanges<T extends { role: string }>(contents: T[], n = MEMORY_QUESTIONS): T[] {
  if (n <= 0) return []
  const starts = contents.flatMap((c, i) => (c.role === 'user' ? [i] : []))
  return starts.length <= n ? contents : contents.slice(starts[starts.length - n])
}

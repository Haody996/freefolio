// Per-key sliding-window limiter (in-memory; one app instance).
const hits = new Map<string, number[]>()

export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 10_000) hits.delete(hits.keys().next().value as string)
  return true
}

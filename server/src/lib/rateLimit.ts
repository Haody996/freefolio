// Per-key sliding-window limiter (in-memory; one app instance).
const hits = new Map<string, number[]>()

function recent(key: string, windowMs: number, now: number): number[] {
  return (hits.get(key) ?? []).filter((t) => now - t < windowMs)
}

export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const list = recent(key, windowMs, now)
  if (list.length >= limit) {
    hits.set(key, list)
    return false
  }
  list.push(now)
  hits.set(key, list)
  if (hits.size > 10_000) hits.delete(hits.keys().next().value as string)
  return true
}

// For failure-based limits (e.g. wrong passwords): check without counting,
// then record only the failures.
export function isOver(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  return recent(key, windowMs, now).length >= limit
}

export function record(key: string, windowMs: number, now = Date.now()): void {
  hits.set(key, [...recent(key, windowMs, now), now])
}

export function clear(key: string): void {
  hits.delete(key)
}

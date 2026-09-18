// Sends browser errors to the server log (at most a few per page view) so
// crashes on users' devices can be diagnosed.
let sent = 0

export function reportError(err: unknown, where: string, componentStack?: string): void {
  if (sent >= 5) return
  sent++
  const e = err instanceof Error ? err : new Error(String(err))
  try {
    fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: e.message, stack: e.stack, componentStack, where, url: location.pathname }),
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    // reporting must never throw
  }
}

export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (ev) => reportError(ev.error ?? ev.message, 'window.onerror'))
  window.addEventListener('unhandledrejection', (ev) => reportError(ev.reason, 'unhandledrejection'))
}

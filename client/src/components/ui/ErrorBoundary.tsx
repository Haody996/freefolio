import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { reportError } from '../../lib/reportError'

// Catches render errors so one broken piece of UI shows a message instead of
// blanking the page, and reports the error to the server log.
export default class ErrorBoundary extends Component<
  { children: ReactNode; where: string; fallback?: (error: Error, reset: () => void) => ReactNode; resetKey?: unknown },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, this.props.where, info.componentStack ?? undefined)
  }

  componentDidUpdate(prev: { resetKey?: unknown }) {
    // e.g. navigating to another page clears the error
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)
    return (
      <div role="alert" style={{ background: '#16181F', border: '1px solid rgba(255,84,112,0.3)', borderRadius: 18, padding: 24, margin: 4 }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 17, fontWeight: 700 }}>Something went wrong showing this page</div>
        <div style={{ fontSize: 13, color: '#8A90A2', margin: '6px 0 14px', lineHeight: 1.5 }}>
          The problem has been reported. Reloading usually fixes it.
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#C9CDD8', marginTop: 8, wordBreak: 'break-word' }}>{error.message}</div>
        </div>
        <button onClick={() => location.reload()} style={{ border: 'none', background: '#22E38A', color: '#04140C', borderRadius: 10, padding: '9px 14px', fontWeight: 700, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>
          Reload
        </button>
      </div>
    )
  }
}

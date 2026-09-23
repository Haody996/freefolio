import { useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { useAppVersion } from '../../lib/useAppVersion'

// Floating prompt shown when the site has been updated since this tab loaded.
export default function UpdatePrompt() {
  const stale = useAppVersion()
  const [dismissed, setDismissed] = useState(false)
  if (!stale || dismissed) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        zIndex: 100,
        right: 'max(16px, env(safe-area-inset-right, 0px))',
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        left: 'auto',
        maxWidth: 'calc(100vw - 32px)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 12px 11px 16px',
        borderRadius: 14,
        background: '#16181F',
        border: '1px solid rgba(34,227,138,0.35)',
        boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
        fontSize: 13.5,
        color: '#E7EAF1',
      }}
    >
      <span style={{ whiteSpace: 'nowrap' }}>A new version is available</span>
      <button
        onClick={() => location.reload()}
        style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: '#22E38A', color: '#04140C', borderRadius: 9, padding: '7px 12px', fontSize: 13, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        <RefreshCw size={14} /> Update
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        title="Dismiss until the next check"
        style={{ border: 'none', background: 'transparent', color: '#8A90A2', cursor: 'pointer', display: 'flex', padding: 4 }}
      >
        <X size={16} />
      </button>
    </div>
  )
}

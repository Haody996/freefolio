import { fmtCompact, pct } from '../../lib/portfolio'

const NAV = ['Dashboard', 'Holdings', 'Projections', 'Transactions', 'Settings']
const FIRE_GOAL = 1_500_000

export default function Sidebar({ netWorth, onLogout }: { netWorth: number; onLogout: () => void }) {
  const progress = Math.min(100, (netWorth / FIRE_GOAL) * 100)

  return (
    <aside
      style={{
        width: 236,
        flexShrink: 0,
        borderRight: '1px solid rgba(255,255,255,0.07)',
        padding: '26px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 26,
        position: 'sticky',
        top: 0,
        height: '100vh',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px' }}>
        <svg width="18" height="18" viewBox="0 0 18 18">
          <rect x="9" y="0" width="12.7" height="12.7" transform="rotate(45 9 9)" fill="#22E38A" />
        </svg>
        <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 19, letterSpacing: -0.5 }}>
          getfreefolio
        </span>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {NAV.map((item, i) => {
          const active = i === 0
          return (
            <div
              key={item}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: active ? 700 : 600,
                background: active ? 'rgba(34,227,138,0.12)' : 'transparent',
                color: active ? '#22E38A' : '#8A90A2',
                cursor: 'pointer',
              }}
            >
              {item}
            </div>
          )
        })}
      </nav>

      <div
        style={{
          marginTop: 'auto',
          background: '#16181F',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 1, color: '#8A90A2', fontWeight: 700 }}>FIRE PROGRESS</div>
        <div style={{ margin: '10px 0 8px', height: 8, borderRadius: 8, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 8, background: 'linear-gradient(90deg,#22E38A,#9B7CFF)', width: `${progress.toFixed(1)}%` }} />
        </div>
        <div style={{ fontSize: 12, color: '#8A90A2' }}>
          <span style={{ color: '#F2F4F8', fontWeight: 700 }}>{fmtCompact(netWorth)}</span> / $1.5M · {pct(netWorth / FIRE_GOAL)}
        </div>
        <button
          onClick={onLogout}
          style={{
            marginTop: 14,
            width: '100%',
            padding: '8px 0',
            borderRadius: 9,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'transparent',
            color: '#8A90A2',
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          Log out
        </button>
      </div>
    </aside>
  )
}

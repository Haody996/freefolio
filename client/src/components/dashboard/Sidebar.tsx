import { NavLink } from 'react-router-dom'
import { fmtCompact, pct } from '../../lib/portfolio'
import { useIsMobile } from '../../lib/useIsMobile'
import { isAdmin } from '../../lib/auth'
import EditableNumber from './EditableNumber'

const BASE_NAV: { label: string; to: string }[] = [
  { label: 'Dashboard', to: '/' },
  { label: 'Retirement', to: '/retirement' },
]
function navItems() {
  return isAdmin() ? [...BASE_NAV, { label: 'Admin', to: '/admin' }] : BASE_NAV
}

interface GoalProps {
  fireGoal: number
  projectedGoal: number
  goalIsCustom: boolean
  onSetGoal: (v: number | null) => void
}

function Logo() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 4px' }}>
      <svg width="18" height="18" viewBox="0 0 18 18">
        <rect x="9" y="0" width="12.7" height="12.7" transform="rotate(45 9 9)" fill="#22E38A" />
      </svg>
      <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 19, letterSpacing: -0.5 }}>getfreefolio</span>
    </div>
  )
}

function navStyle(isActive: boolean, horizontal = false): React.CSSProperties {
  return {
    padding: horizontal ? '7px 12px' : '10px 12px',
    borderRadius: 10,
    fontSize: 14,
    fontWeight: isActive ? 700 : 600,
    background: isActive ? 'rgba(34,227,138,0.12)' : 'transparent',
    color: isActive ? '#22E38A' : '#8A90A2',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}

function logoutBtn(onLogout: () => void, full: boolean): React.ReactNode {
  return (
    <button
      onClick={onLogout}
      style={{
        marginTop: full ? 14 : 0,
        width: full ? '100%' : 'auto',
        padding: full ? '8px 0' : '7px 14px',
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
  )
}

function FireProgress({ netWorth, fireGoal, projectedGoal, goalIsCustom, onSetGoal }: { netWorth: number } & GoalProps) {
  const goal = fireGoal > 0 ? fireGoal : 1
  const t = Math.max(0, Math.min(1, netWorth / goal))
  const progress = t * 100
  const full = t >= 0.999

  // Heat: the leading edge shifts from ember-red → orange → gold as you near FIRE,
  // and the glow intensifies. At 100% the whole bar blazes (animated in index.css).
  const hot = `rgb(255, ${Math.round(69 + 141 * t)}, ${Math.round(63 * t)})`
  const fillBg = `linear-gradient(90deg, #3d0800, #b31a00, ${hot})`
  const glow = `0 0 ${Math.round(4 + 12 * t)}px rgba(255, ${Math.round(69 + 110 * t)}, 0, ${(0.25 + 0.5 * t).toFixed(2)})`

  return (
    <>
      <div style={{ fontSize: 11, letterSpacing: 1, color: '#8A90A2', fontWeight: 700 }}>FIRE PROGRESS {full && '🔥'}</div>
      <div style={{ margin: '10px 0 8px', height: 8, borderRadius: 8, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div
          className={full ? 'fire-blaze' : undefined}
          style={{
            height: '100%',
            borderRadius: 8,
            width: `${progress.toFixed(1)}%`,
            minWidth: t > 0 ? 6 : 0,
            background: full ? undefined : fillBg,
            boxShadow: full ? undefined : glow,
            transition: 'width .3s ease',
          }}
        />
      </div>
      <div style={{ fontSize: 12, color: '#8A90A2', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        <span style={{ color: '#F2F4F8', fontWeight: 700 }}>{fmtCompact(netWorth)}</span> /
        <EditableNumber value={Math.round(fireGoal)} format={(n) => fmtCompact(n)} min={1000} max={1_000_000_000} allowOverMax onCommit={(n) => onSetGoal(n)} />
        · {pct(netWorth / goal)}
      </div>
      {goalIsCustom && (
        <button
          onClick={() => onSetGoal(null)}
          style={{ marginTop: 6, border: 'none', background: 'transparent', color: '#22E38A', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', padding: 0 }}
        >
          ↺ use projected ({fmtCompact(projectedGoal)})
        </button>
      )}
    </>
  )
}

export default function Sidebar({ netWorth, onLogout, ...goal }: { netWorth: number; onLogout: () => void } & GoalProps) {
  const isMobile = useIsMobile()

  // Mobile: compact top bar — logo + logout, a horizontal nav, then FIRE bar.
  if (isMobile) {
    return (
      <header style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Logo />
          {logoutBtn(onLogout, false)}
        </div>
        <nav style={{ display: 'flex', gap: 6 }}>
          {navItems().map(({ label, to }) => (
            <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => navStyle(isActive, true)}>
              {label}
            </NavLink>
          ))}
        </nav>
        <FireProgress netWorth={netWorth} {...goal} />
      </header>
    )
  }

  // Desktop: full-height left sidebar.
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
      <Logo />

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {navItems().map(({ label, to }) => (
          <NavLink key={to} to={to} end={to === '/'} style={({ isActive }) => navStyle(isActive)}>
            {label}
          </NavLink>
        ))}
      </nav>

      <div style={{ marginTop: 'auto', background: '#16181F', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 16 }}>
        <FireProgress netWorth={netWorth} {...goal} />
        {logoutBtn(onLogout, true)}
      </div>
    </aside>
  )
}

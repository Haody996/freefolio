import { Link, NavLink } from 'react-router-dom'
import { isAuthenticated } from '../../lib/auth'
import { useIsMobile } from '../../lib/useIsMobile'
import { CALCULATOR_PAGES } from '../../lib/calculatorPages'

// Chrome for public (no sign-in) pages: logo, calculator links, sign-up CTA.
export default function PublicShell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile()
  const authed = isAuthenticated()

  return (
    <div style={{ minHeight: '100vh', background: '#0E0F13', color: '#F2F4F8', display: 'flex', flexDirection: 'column' }}>
      <header style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: isMobile ? '12px 16px' : '16px 28px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link to={authed ? '/' : '/calculators'} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'inherit' }}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
              <rect x="9" y="0" width="12.7" height="12.7" transform="rotate(45 9 9)" fill="#22E38A" />
            </svg>
            <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 19, letterSpacing: -0.5, color: '#F2F4F8' }}>getfreefolio</span>
          </Link>
          {!isMobile && (
            <NavLink to="/calculators" end style={({ isActive }) => ({ marginLeft: 12, fontSize: 14, fontWeight: 600, color: isActive ? '#22E38A' : '#8A90A2' })}>
              Calculators
            </NavLink>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {authed ? (
              <Link to="/" style={ctaBtn}>
                Open dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" style={{ ...ghostBtn, display: isMobile ? 'none' : 'inline-block' }}>
                  Log in
                </Link>
                <Link to="/register" style={ctaBtn}>
                  Sign up free
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main style={{ flex: 1, width: '100%', maxWidth: 1120, margin: '0 auto', padding: isMobile ? '20px 16px 32px' : '34px 28px 48px', display: 'flex', flexDirection: 'column', gap: isMobile ? 16 : 20 }}>
        {children}
      </main>

      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: isMobile ? '20px 16px' : '26px 28px', display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: '#8A90A2' }}>© {new Date().getFullYear()} getfreefolio · net worth tracking & FIRE planning</span>
          <nav style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginLeft: isMobile ? 0 : 'auto' }}>
            {CALCULATOR_PAGES.map((c) => (
              <Link key={c.path} to={c.path} style={{ color: '#8A90A2' }}>
                {c.name}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  )
}

const ctaBtn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  background: '#22E38A',
  color: '#04140C',
  fontWeight: 700,
  fontSize: 13,
  whiteSpace: 'nowrap',
}
const ghostBtn: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#C9CDD8',
  fontWeight: 600,
  fontSize: 13,
  whiteSpace: 'nowrap',
}

// Sign-up nudge shown under each calculator.
export function SignupCta({ headline, body }: { headline: string; body: string }) {
  const authed = isAuthenticated()
  return (
    <section style={{ borderRadius: 18, padding: 24, background: 'linear-gradient(135deg, rgba(34,227,138,0.12), rgba(155,124,255,0.12))', border: '1px solid rgba(155,124,255,0.25)', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontFamily: "'Space Grotesk'", fontSize: 19, fontWeight: 700 }}>{headline}</div>
        <div style={{ fontSize: 14, color: '#C9CDD8', marginTop: 6, lineHeight: 1.55 }}>{body}</div>
      </div>
      <Link to={authed ? '/' : '/register'} style={{ ...ctaBtn, padding: '12px 20px', fontSize: 14 }}>
        {authed ? 'Open your dashboard →' : 'Create a free account →'}
      </Link>
    </section>
  )
}

// Short explainer blocks under a calculator (also what search engines index).
export function Explainer({ items }: { items: { q: string; a: React.ReactNode }[] }) {
  return (
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
      {items.map((i) => (
        <div key={i.q} style={{ background: '#16181F', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
          <h2 style={{ margin: 0, fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 700 }}>{i.q}</h2>
          <div style={{ fontSize: 13.5, color: '#C9CDD8', lineHeight: 1.6, marginTop: 8 }}>{i.a}</div>
        </div>
      ))}
    </section>
  )
}

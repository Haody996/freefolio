import { Link } from 'react-router-dom'
import PublicShell, { SignupCta } from '../../components/public/PublicShell'
import { CALCULATOR_PAGES, CALCULATORS_INDEX } from '../../lib/calculatorPages'
import { useSeo } from '../../lib/useSeo'
import { useIsMobile } from '../../lib/useIsMobile'

export default function CalculatorsIndex() {
  useSeo(CALCULATORS_INDEX.title, CALCULATORS_INDEX.description)
  const isMobile = useIsMobile()
  return (
    <PublicShell>
      <section style={{ padding: isMobile ? '8px 0 4px' : '20px 0 8px', maxWidth: 720 }}>
        <h1 style={{ margin: 0, fontFamily: "'Space Grotesk'", fontSize: isMobile ? 30 : 42, fontWeight: 700, letterSpacing: -1, lineHeight: 1.1 }}>
          Free calculators for your path to financial independence
        </h1>
        <p style={{ fontSize: isMobile ? 15 : 17, color: '#C9CDD8', lineHeight: 1.6, margin: '14px 0 0' }}>
          No sign-up, no ads. Plug in your numbers to see when you can retire early, whether you can coast, and the fastest way out of debt.
        </p>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 16 }}>
        {CALCULATOR_PAGES.map((c) => (
          <Link
            key={c.path}
            to={c.path}
            style={{ display: 'block', color: 'inherit', background: '#16181F', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, padding: 24, position: 'relative', overflow: 'hidden' }}
          >
            <span style={{ position: 'absolute', inset: '0 auto 0 0', width: 4, background: c.accent }} />
            <h2 style={{ margin: 0, fontFamily: "'Space Grotesk'", fontSize: 20, fontWeight: 700 }}>{c.name}</h2>
            <p style={{ margin: '8px 0 14px', fontSize: 14, color: '#C9CDD8', lineHeight: 1.55 }}>{c.blurb}</p>
            <span style={{ fontSize: 13, fontWeight: 700, color: c.accent }}>Open calculator →</span>
          </Link>
        ))}
      </section>

      <SignupCta
        headline="Want these numbers to update themselves?"
        body="getfreefolio tracks your real net worth — stocks, crypto, gold, real estate and debts — with live prices, then runs the same FIRE math on your actual portfolio."
      />
    </PublicShell>
  )
}

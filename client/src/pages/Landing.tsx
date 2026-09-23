import { Link } from 'react-router-dom'
import { TrendingUp, Wallet, LineChart as LineChartIcon, Receipt, Landmark, CreditCard, Sparkles, Mail } from 'lucide-react'
import PublicShell from '../components/public/PublicShell'
import LineChart from '../components/dashboard/LineChart'
import { CALCULATOR_PAGES } from '../lib/calculatorPages'
import { useSeo } from '../lib/useSeo'
import { useIsMobile } from '../lib/useIsMobile'
import { fmtCompact, fmtUSD } from '../lib/portfolio'

export const LANDING_SEO = {
  title: 'getfreefolio — Track your net worth and plan your early retirement',
  description:
    'Free net-worth tracker and FIRE planner: stocks, crypto, metals, property and debts in one number, with live prices, real returns, tax-loss harvesting and a retirement simulation.',
}

// A made-up net-worth curve for the hero illustration: 40 months ending now.
const MONTHS = 40
const DEMO = Array.from({ length: MONTHS }, (_, i) => Math.round(120000 * Math.pow(1.008, i) * (1 + 0.035 * Math.sin(i / 1.7) + 0.02 * Math.sin(i / 4.3))))
const DEMO_DATES = Array.from({ length: MONTHS }, (_, i) => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - (MONTHS - 1 - i))
  return d
})

const FEATURES: { icon: typeof Wallet; title: string; body: string }[] = [
  { icon: Wallet, title: 'Everything in one number', body: 'Stocks and ETFs, crypto, gold and silver, property, vehicles and cash — minus your mortgage, loans and cards. Net worth, not just a portfolio.' },
  { icon: TrendingUp, title: 'Live prices, no logins', body: 'Prices refresh in the background from public market data. No brokerage passwords, no API keys, nothing to connect.' },
  { icon: LineChartIcon, title: 'Returns you can trust', body: 'Time- and money-weighted returns including dividends, compared with the S&P 500 — your deposits never masquerade as growth.' },
  { icon: Receipt, title: 'Gains and tax moves', body: 'Cost basis per lot, short vs long-term gains, realized gains by tax year, and harvesting candidates with replacement funds and wash-sale warnings.' },
  { icon: Landmark, title: 'A retirement plan that stress-tests', body: 'Monte Carlo odds over a century of market history, Social Security timing, required withdrawals, healthcare costs — and a ranking of what would move your odds most.' },
  { icon: CreditCard, title: 'A way out of debt', body: 'Avalanche vs snowball with your real balances and rates: debt-free date, interest saved, and the payments flowing into savings afterwards.' },
  { icon: Sparkles, title: 'Ask what-ifs in plain English', body: '“Can I retire at 50 if I pay off the mortgage first?” The planner runs the numbers on your data; AI explains the result and you can save it as a scenario.' },
  { icon: Mail, title: 'A weekly nudge', body: 'An optional email digest: what your net worth did, your biggest movers, and how close you are to financial independence.' },
]

const FAQ: { q: string; a: string }[] = [
  { q: 'Is it free?', a: 'Yes. The calculators work without an account, and an account costs nothing. There are no ads.' },
  { q: 'Do I have to connect my bank or brokerage?', a: 'No. You enter what you hold — tickers, quantities, balances — and prices update automatically from public market data. Nothing connects to your accounts.' },
  { q: 'Where do the prices come from?', a: 'Stocks, ETFs and metals from Yahoo Finance; crypto from CoinGecko. Both are free public sources, so there are no API keys to manage.' },
  { q: 'What happens to my data?', a: 'It stays in your account on this server and is never sold. The AI features send a summary of your figures to Google Gemini only when you use them, and you can leave them alone entirely.' },
  { q: 'Is this financial advice?', a: 'No. It is a calculator and a tracker for your own planning. Tax estimates are federal-only and simplified — check decisions with a professional.' },
]

export default function Landing() {
  useSeo(LANDING_SEO.title, LANDING_SEO.description)
  const isMobile = useIsMobile()

  return (
    <PublicShell>
      {/* Hero */}
      <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.05fr 1fr', gap: isMobile ? 28 : 40, alignItems: 'center', padding: isMobile ? '12px 0 8px' : '28px 0 16px' }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: "'Space Grotesk'", fontSize: isMobile ? 32 : 46, fontWeight: 700, letterSpacing: -1.2, lineHeight: 1.08 }}>
            Your whole net worth, and the date you can stop working
          </h1>
          <p style={{ fontSize: isMobile ? 15.5 : 17.5, color: '#C9CDD8', lineHeight: 1.6, margin: '16px 0 0', maxWidth: 560 }}>
            Track stocks, crypto, gold, property and cash alongside your mortgage and loans. Live prices, honest returns, and a retirement plan that answers “what if”.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
            <Link to="/register" style={{ background: '#22E38A', color: '#04140C', fontWeight: 700, fontSize: 15, padding: '13px 22px', borderRadius: 12 }}>
              Create a free account
            </Link>
            <Link to="/calculators/fire" style={{ border: '1px solid rgba(255,255,255,0.14)', color: '#F2F4F8', fontWeight: 600, fontSize: 15, padding: '13px 20px', borderRadius: 12 }}>
              Try the FIRE calculator
            </Link>
          </div>
          <div style={{ fontSize: 13, color: '#8A90A2', marginTop: 14 }}>Free · no bank connection · no ads</div>
        </div>

        {/* Example dashboard */}
        <div style={{ background: '#16181F', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, padding: isMobile ? 16 : 22 }}>
          <div style={{ fontSize: 10.5, letterSpacing: 1.2, color: '#8A90A2', fontWeight: 700 }}>TOTAL NET WORTH · EXAMPLE</div>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: isMobile ? 32 : 38, fontWeight: 700, letterSpacing: -1, margin: '6px 0 2px', fontVariantNumeric: 'tabular-nums' }}>
            {fmtCompact(DEMO[DEMO.length - 1])}
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#22E38A' }}>
            +{fmtUSD(DEMO[MONTHS - 1] - DEMO[MONTHS - 13])} ({((DEMO[MONTHS - 1] / DEMO[MONTHS - 13] - 1) * 100).toFixed(1)}%){' '}
            <span style={{ color: '#8A90A2', fontWeight: 500 }}>past 12 months</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <LineChart
              series={[{ key: 'nw', label: 'Net worth', color: '#22E38A', values: DEMO, area: true }]}
              labels={DEMO_DATES.map((d) => d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }))}
              tickFormat={(i) => (i === MONTHS - 1 ? 'now' : String(DEMO_DATES[i].getFullYear()))}
              yFormat={fmtCompact}
              height={170}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
            {[
              ['FIRE progress', '38%'],
              ['1-yr return', `+${((DEMO[MONTHS - 1] / DEMO[MONTHS - 13] - 1) * 100).toFixed(1)}%`],
              ['Debt-free', `Mar ${new Date().getFullYear() + 5}`],
            ].map(([label, value]) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '9px 10px' }}>
                <div style={{ fontSize: 10, color: '#8A90A2', fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase' }}>{label}</div>
                <div style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 700, marginTop: 3 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you get */}
      <section>
        <h2 style={{ fontFamily: "'Space Grotesk'", fontSize: isMobile ? 22 : 26, fontWeight: 700, letterSpacing: -0.5, margin: '12px 0 4px' }}>Built for people chasing financial independence</h2>
        <p style={{ fontSize: 14.5, color: '#8A90A2', margin: '0 0 20px', maxWidth: 640, lineHeight: 1.55 }}>
          Not a budgeting app. It answers the two questions that matter: what am I worth, and when is that enough?
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} style={{ background: '#16181F', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(34,227,138,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Icon size={17} color="#22E38A" />
              </div>
              <h3 style={{ margin: 0, fontFamily: "'Space Grotesk'", fontSize: 16, fontWeight: 700 }}>{title}</h3>
              <p style={{ margin: '7px 0 0', fontSize: 13.5, color: '#C9CDD8', lineHeight: 1.6 }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section style={{ background: '#16181F', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, padding: isMobile ? 20 : 28 }}>
        <h2 style={{ fontFamily: "'Space Grotesk'", fontSize: isMobile ? 20 : 23, fontWeight: 700, margin: '0 0 18px' }}>Three steps to your number</h2>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 18 }}>
          {[
            ['Add what you own and owe', 'Type a ticker and the price fills itself in. Add cash, a house, a car, and your mortgage or loans.'],
            ['Let it keep itself current', 'Prices refresh through the day, history is rebuilt from real market data, and recurring investments are logged for you.'],
            ['Plan, stress-test, decide', 'See your FIRE progress, run the odds, compare payoff strategies, and ask what-ifs in plain English.'],
          ].map(([title, body], i) => (
            <div key={title}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(34,227,138,0.14)', color: '#22E38A', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>{i + 1}</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
              <p style={{ margin: '6px 0 0', fontSize: 13.5, color: '#C9CDD8', lineHeight: 1.6 }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Calculators */}
      <section>
        <h2 style={{ fontFamily: "'Space Grotesk'", fontSize: isMobile ? 20 : 23, fontWeight: 700, margin: '4px 0 6px' }}>Try the calculators first — no account needed</h2>
        <p style={{ fontSize: 14, color: '#8A90A2', margin: '0 0 16px' }}>Same math as the app, with your numbers typed in by hand.</p>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          {CALCULATOR_PAGES.map((c) => (
            <Link key={c.path} to={c.path} style={{ display: 'block', background: '#16181F', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 18, color: 'inherit', position: 'relative', overflow: 'hidden' }}>
              <span style={{ position: 'absolute', inset: '0 auto 0 0', width: 3, background: c.accent }} />
              <div style={{ fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 700 }}>{c.name}</div>
              <div style={{ fontSize: 13, color: '#8A90A2', marginTop: 5, lineHeight: 1.5 }}>{c.blurb}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
        <h2 style={{ fontFamily: "'Space Grotesk'", fontSize: isMobile ? 20 : 23, fontWeight: 700, margin: '4px 0 16px' }}>Questions</h2>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
          {FAQ.map(({ q, a }) => (
            <div key={q} style={{ background: '#16181F', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 18 }}>
              <h3 style={{ margin: 0, fontFamily: "'Space Grotesk'", fontSize: 15, fontWeight: 700 }}>{q}</h3>
              <p style={{ margin: '7px 0 0', fontSize: 13.5, color: '#C9CDD8', lineHeight: 1.6 }}>{a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section style={{ borderRadius: 18, padding: isMobile ? 24 : 32, background: 'linear-gradient(135deg, rgba(34,227,138,0.12), rgba(155,124,255,0.12))', border: '1px solid rgba(155,124,255,0.25)', textAlign: 'center' }}>
        <h2 style={{ fontFamily: "'Space Grotesk'", fontSize: isMobile ? 22 : 27, fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>Start with one holding</h2>
        <p style={{ fontSize: 14.5, color: '#C9CDD8', margin: '10px auto 20px', maxWidth: 520, lineHeight: 1.6 }}>
          Add a single ticker and you'll already have a net-worth chart, live prices and a FIRE projection. Add the rest whenever you like.
        </p>
        <Link to="/register" style={{ background: '#22E38A', color: '#04140C', fontWeight: 700, fontSize: 15, padding: '13px 24px', borderRadius: 12, display: 'inline-block' }}>
          Create a free account
        </Link>
      </section>
    </PublicShell>
  )
}

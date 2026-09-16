import fs from 'fs'

// Per-route <title> / meta description / canonical + Open Graph tags for the
// public calculator pages, injected into the SPA's index.html so crawlers and
// link previews see them without running JS. Keep in sync with
// client/src/lib/calculatorPages.ts.
const SITE = 'https://getfreefolio.com'

const PAGES: Record<string, { title: string; description: string }> = {
  '/calculators': {
    title: 'Free Financial Calculators — FIRE, Coast FIRE, Compound Interest, Debt Payoff | getfreefolio',
    description: 'Free calculators for financial independence: FIRE number, Coast FIRE, compound interest with monthly contributions, and avalanche vs. snowball debt payoff.',
  },
  '/calculators/fire': {
    title: 'FIRE Calculator — When Can You Retire Early? | getfreefolio',
    description: 'Free FIRE calculator: find your FIRE number, the age you reach financial independence, and how saving more changes your early-retirement date.',
  },
  '/calculators/coast-fire': {
    title: 'Coast FIRE Calculator — Have You Saved Enough to Coast? | getfreefolio',
    description: 'Free Coast FIRE calculator: see how much you need invested today to retire on time without saving another dollar, and when you will get there.',
  },
  '/calculators/compound-interest': {
    title: 'Compound Interest Calculator with Monthly Contributions | getfreefolio',
    description: 'Free compound interest calculator with monthly contributions and inflation: see how your investments grow, in nominal and today’s dollars.',
  },
  '/calculators/debt-payoff': {
    title: 'Debt Payoff Calculator — Avalanche vs. Snowball | getfreefolio',
    description: 'Free debt payoff calculator: compare the avalanche and snowball methods, see your debt-free date, and how much interest an extra payment saves.',
  },
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Returns a renderer that serves index.html with page-specific head tags.
export function createIndexRenderer(indexPath: string): (urlPath: string) => string {
  let template: string | null = null
  const cache = new Map<string, string>()
  return (urlPath: string) => {
    if (template == null) template = fs.readFileSync(indexPath, 'utf8')
    const path = urlPath.replace(/\/+$/, '') || '/'
    const page = PAGES[path]
    if (!page) return template
    const hit = cache.get(path)
    if (hit) return hit
    const tags = [
      `<title>${esc(page.title)}</title>`,
      `<meta name="description" content="${esc(page.description)}" />`,
      `<link rel="canonical" href="${SITE}${path}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta property="og:site_name" content="getfreefolio" />`,
      `<meta property="og:title" content="${esc(page.title)}" />`,
      `<meta property="og:description" content="${esc(page.description)}" />`,
      `<meta property="og:url" content="${SITE}${path}" />`,
      `<meta name="twitter:card" content="summary" />`,
    ].join('\n    ')
    const html = template
      .replace(/<meta name="description"[^>]*>\s*/i, '')
      .replace(/<title>[\s\S]*?<\/title>/i, tags)
    cache.set(path, html)
    return html
  }
}

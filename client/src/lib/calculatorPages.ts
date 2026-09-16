// Public calculator pages — titles/descriptions are mirrored server-side
// (server/src/seo.ts) so crawlers and link previews see them without JS.
export interface CalculatorPage {
  path: string
  name: string
  title: string
  description: string
  blurb: string
  accent: string
}

export const CALCULATOR_PAGES: CalculatorPage[] = [
  {
    path: '/calculators/fire',
    name: 'FIRE calculator',
    title: 'FIRE Calculator — When Can You Retire Early? | getfreefolio',
    description: 'Free FIRE calculator: find your FIRE number, the age you reach financial independence, and how saving more changes your early-retirement date.',
    blurb: 'Find your FIRE number and the age you can stop working.',
    accent: '#FF7A00',
  },
  {
    path: '/calculators/coast-fire',
    name: 'Coast FIRE calculator',
    title: 'Coast FIRE Calculator — Have You Saved Enough to Coast? | getfreefolio',
    description: 'Free Coast FIRE calculator: see how much you need invested today to retire on time without saving another dollar, and when you will get there.',
    blurb: 'How much you need today so compounding does the rest.',
    accent: '#22E38A',
  },
  {
    path: '/calculators/compound-interest',
    name: 'Compound interest calculator',
    title: 'Compound Interest Calculator with Monthly Contributions | getfreefolio',
    description: 'Free compound interest calculator with monthly contributions and inflation: see how your investments grow, in nominal and today’s dollars.',
    blurb: 'Watch monthly contributions snowball over time.',
    accent: '#9B7CFF',
  },
  {
    path: '/calculators/debt-payoff',
    name: 'Debt payoff calculator',
    title: 'Debt Payoff Calculator — Avalanche vs. Snowball | getfreefolio',
    description: 'Free debt payoff calculator: compare the avalanche and snowball methods, see your debt-free date, and how much interest an extra payment saves.',
    blurb: 'Avalanche vs. snowball — your debt-free date and interest saved.',
    accent: '#35A0FF',
  },
]

export const CALCULATORS_INDEX = {
  path: '/calculators',
  title: 'Free Financial Calculators — FIRE, Coast FIRE, Compound Interest, Debt Payoff | getfreefolio',
  description: 'Free calculators for financial independence: FIRE number, Coast FIRE, compound interest with monthly contributions, and avalanche vs. snowball debt payoff.',
}

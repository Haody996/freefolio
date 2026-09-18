import { Content, FunctionDeclaration, SchemaType } from '@google/generative-ai'

// The "Ask your portfolio" assistant: Gemini decides which calculation to run,
// the browser runs it with the app's tested planning code (client
// lib/assistantTools.ts), and Gemini explains the returned numbers.

export const SYSTEM_PROMPT = `You are the getfreefolio assistant. You help one user understand their own finances: net worth, investments, debts and their retirement plan.

Rules:
- Never calculate projections, success odds, payoff dates or taxes yourself. Call a tool and report its numbers, rounded sensibly ($1.2M, 84%).
- For what-if questions call run_retirement_scenario with only the fields that change. To compare options (for example retiring at 50 with and without paying off the mortgage) call it once per option.
- Say how each result compares with the current plan: success odds, nest egg at retirement, and whether the money lasts. Changes in odds are percentage points ("72% → 84%, up 12 points"), never "12%".
- All plan amounts are in today's dollars. Mention any warnings a tool returns.
- Be concise: 2–5 sentences or a short bulleted list. Plain language; explain any jargon. Use **bold** for key numbers. No tables or headings.
- Educational only: explain trade-offs, never tell the user to buy or sell specific securities, and suggest a tax professional for tax decisions.
- If a question needs data the user hasn't entered (for example no debts), say what to add.
- Stay on personal finance and this user's data.`

const num = (description: string) => ({ type: SchemaType.NUMBER as const, description })
const int = (description: string) => ({ type: SchemaType.INTEGER as const, description })
const names = (description: string) => ({ type: SchemaType.ARRAY as const, description, items: { type: SchemaType.STRING as const } })

export const TOOLS: FunctionDeclaration[] = [
  {
    name: 'run_retirement_scenario',
    description:
      "Run the user's retirement plan with changes and compare it with their current plan. Use for any what-if about retiring earlier/later, spending, saving, Social Security, pensions, returns, a market crash, paying off debts early or moving into bonds. Pass only the fields that change. Returns deterministic projections and Monte Carlo success odds for both.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        label: { type: SchemaType.STRING, description: 'Short name for the scenario, e.g. "Retire at 50, mortgage paid off"' },
        retirementAge: int('Age the user stops working'),
        annualSpending: num("Retirement spending per year in today's dollars (absolute)"),
        spendingChange: num('Change to annual retirement spending, e.g. -5000'),
        monthlyContribution: num('Savings per month until retirement (absolute)'),
        contributionChange: num('Change to monthly savings, e.g. 500'),
        expectedReturnPct: num('Expected nominal annual return, %'),
        inflationPct: num('Inflation, %'),
        socialSecurityAnnual: num('Social Security benefit per year at full retirement age 67'),
        ssStartAge: int('Age to claim Social Security, 62–70'),
        pensionAnnual: num('Pension per year'),
        pensionStartAge: int('Age the pension starts'),
        withdrawalStrategy: { type: SchemaType.STRING, format: 'enum', enum: ['FIXED', 'GUARDRAILS'], description: 'Fixed spending or guardrails (flexible spending)' },
        aumFeePct: num('Advisory / fund fees, % per year'),
        endAge: int('Plan until this age'),
        startingCapitalChange: num('One-time change to investments today, e.g. -40000 for a big purchase or +100000 for an inheritance'),
        payOffDebts: names('Names of debts to pay off today using investments'),
        debtExtraPayment: num('Extra $ per month toward debts on top of minimums'),
        debtStrategy: { type: SchemaType.STRING, format: 'enum', enum: ['AVALANCHE', 'SNOWBALL'], description: 'Debt payoff order' },
        bondShiftPct: num('Move this % of the portfolio into bonds (lower return and volatility)'),
        marketDropPct: num('A one-time market drop, in %, e.g. 30'),
        marketDropAge: int('Age when the market drop hits (default: next year)'),
      },
      required: ['label'],
    },
  },
  {
    name: 'run_debt_payoff',
    description:
      "Compare debt payoff plans with the user's current one: avalanche vs snowball, an extra monthly payment, or paying specific debts off now. Returns months to debt-free, dates and total interest.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        label: { type: SchemaType.STRING, description: 'Short name for the plan' },
        strategy: { type: SchemaType.STRING, format: 'enum', enum: ['AVALANCHE', 'SNOWBALL'], description: 'Payoff order' },
        extraMonthly: num('Extra $ per month on top of minimum payments'),
        payOffDebts: names('Names of debts paid off today with a lump sum'),
      },
      required: ['label'],
    },
  },
  {
    name: 'analyze_retirement_levers',
    description:
      "Rank what would change the user's retirement success odds the most — spending less, retiring later, saving more, claiming Social Security at 70, guardrails spending, more bonds, lower fees, paying debt faster — plus the biggest risks. Use for 'what matters most' or 'how do I improve my odds'.",
  },
  {
    name: 'get_tax_insights',
    description:
      "Tax planning analysis of the user's accounts: asset location (which assets belong in which account type), a Roth conversion ladder that fills a target tax bracket before RMDs, and tax-loss harvesting candidates with replacement funds.",
  },
]

const ROLES = new Set(['user', 'model', 'function'])
const PART_KEYS = new Set(['text', 'functionCall', 'functionResponse', 'thoughtSignature', 'thought'])

// Accept only well-formed conversation turns from the browser.
export function validateContents(raw: unknown): Content[] | string {
  if (!Array.isArray(raw) || raw.length === 0) return 'contents must be a non-empty array'
  if (raw.length > 60) return 'conversation is too long — start a new chat'
  if (JSON.stringify(raw).length > 150_000) return 'conversation is too large — start a new chat'
  for (const c of raw) {
    if (!c || typeof c !== 'object' || !ROLES.has((c as Content).role) || !Array.isArray((c as Content).parts) || (c as Content).parts.length === 0) {
      return 'malformed conversation turn'
    }
    for (const p of (c as Content).parts) {
      if (!p || typeof p !== 'object' || Object.keys(p).some((k) => !PART_KEYS.has(k))) return 'unsupported message part'
    }
  }
  const last = raw[raw.length - 1] as Content
  if (last.role === 'model') return 'the last turn must come from the user or a tool'
  return raw as Content[]
}

export function systemInstruction(context: unknown, today = new Date()): string {
  const json = JSON.stringify(context ?? {})
  return `${SYSTEM_PROMPT}\n\nToday is ${today.toISOString().slice(0, 10)}. The user's current data (JSON, today's dollars):\n${json.slice(0, 30_000)}`
}

export const LEVERS_PROMPT =
  "You explain retirement plan sensitivity results to a user of a personal finance app. You get their baseline plan and a ranked list of levers, each already simulated (Monte Carlo success odds, nest egg). Write 3–4 plain-text sentences (under 100 words): name the three levers that raise the success odds most, citing each one's exact before → after odds from the data (describe differences as percentage points, not percent), then one sentence on the biggest risk listed. Use only numbers in the data. No advice to buy or sell securities, no markdown, no preamble."

export const TAX_PROMPT =
  "You explain tax planning analysis to a user of a personal finance app. You get deterministic results: asset-location findings, a Roth conversion ladder, and tax-loss harvesting candidates with replacement funds. Write a short prioritized summary in plain text (under 130 words, 3–5 sentences): lead with the biggest opportunity, cite exact dollar amounts and ages from the data, name replacement funds only where the data lists them (otherwise pass on the harvesting note), and end by suggesting they confirm with a tax professional. Use only numbers in the data. No markdown, no preamble."

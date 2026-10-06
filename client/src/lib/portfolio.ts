// Portfolio math, formatters, and chart helpers — ported from the design
// prototype (`Portfolio Dashboard.dc.html`) so the numbers and visuals match.

export type Category = 'STOCKS' | 'CRYPTO' | 'CASH' | 'BONDS' | 'METALS' | 'REAL_ESTATE' | 'VEHICLE' | 'OTHER'

export type AccountType =
  | 'TAXABLE'
  | 'TRADITIONAL_401K'
  | 'ROTH_401K'
  | 'TRADITIONAL_IRA'
  | 'ROTH_IRA'
  | 'HSA'
  | 'OTHER'

// Tax treatment buckets: PRE_TAX = tax-deferred (taxed on withdrawal),
// ROTH = post-tax contributions, tax-free growth, TAXABLE = brokerage.
export type TaxTreatment = 'PRE_TAX' | 'ROTH' | 'TAXABLE'

export const ACCOUNT_TYPES: { value: AccountType; label: string; short: string; treatment: TaxTreatment }[] = [
  { value: 'TAXABLE', label: 'Taxable / Brokerage', short: 'Taxable', treatment: 'TAXABLE' },
  { value: 'TRADITIONAL_401K', label: 'Traditional 401(k)', short: '401(k)', treatment: 'PRE_TAX' },
  { value: 'ROTH_401K', label: 'Roth 401(k)', short: 'Roth 401(k)', treatment: 'ROTH' },
  { value: 'TRADITIONAL_IRA', label: 'Traditional IRA', short: 'Trad IRA', treatment: 'PRE_TAX' },
  { value: 'ROTH_IRA', label: 'Roth IRA', short: 'Roth IRA', treatment: 'ROTH' },
  { value: 'HSA', label: 'HSA', short: 'HSA', treatment: 'PRE_TAX' },
  { value: 'OTHER', label: 'Other', short: 'Other', treatment: 'TAXABLE' },
]

const ACCOUNT_BY_VALUE = new Map(ACCOUNT_TYPES.map((a) => [a.value, a]))
export function accountLabel(a: AccountType): string {
  return ACCOUNT_BY_VALUE.get(a)?.short ?? 'Taxable'
}
export function accountTreatment(a: AccountType): TaxTreatment {
  return ACCOUNT_BY_VALUE.get(a)?.treatment ?? 'TAXABLE'
}

export const TREATMENTS: { value: TaxTreatment; label: string; color: string }[] = [
  { value: 'PRE_TAX', label: 'Pre-tax', color: '#FFB020' },
  { value: 'ROTH', label: 'Roth (tax-free)', color: '#22E38A' },
  { value: 'TAXABLE', label: 'Taxable', color: '#35A0FF' },
]

export type AutoFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'SEMIMONTHLY' | 'MONTHLY'

export const AUTO_FREQUENCIES: { value: AutoFrequency; label: string; short: string }[] = [
  { value: 'DAILY', label: 'Daily', short: '/day' },
  { value: 'WEEKLY', label: 'Weekly', short: '/wk' },
  { value: 'BIWEEKLY', label: 'Every 2 weeks', short: '/2wk' },
  { value: 'SEMIMONTHLY', label: 'Twice a month (1st & 15th)', short: '×2/mo' },
  { value: 'MONTHLY', label: 'Monthly', short: '/mo' },
]
const FREQ_SHORT = new Map(AUTO_FREQUENCIES.map((f) => [f.value, f.short]))
export function autoFreqShort(f: AutoFrequency): string {
  return FREQ_SHORT.get(f) ?? ''
}

// Common brokerages/institutions offered as suggestions (free-form entry allowed).
export const INSTITUTIONS = [
  'Charles Schwab',
  'Fidelity',
  'Vanguard',
  'Robinhood',
  'E*TRADE',
  'Merrill',
  'TD Ameritrade',
  'Interactive Brokers',
  'SoFi',
  'Wealthfront',
  'Coinbase',
  'Kraken',
  'Ally Invest',
]

export interface Holding {
  id: string
  symbol: string
  name: string
  category: Category
  accountType: AccountType
  institution: string
  quantity: number
  price: number
  prevClose: number
  autoAmount: number | null
  autoFrequency: AutoFrequency | null
  autoNextAt: string | null
  openingCostPerShare: number | null
  openingAcquiredAt: string | null
  providerId: string | null
  appreciationPct: number | null
}

export interface TreatmentSegment {
  treatment: TaxTreatment
  label: string
  color: string
  value: number
  pct: number
}

export interface BrokerageSegment {
  label: string
  value: number
  pct: number
  color: string
}

// A distinct color palette for grouping by brokerage.
const BROKERAGE_PALETTE = ['#22E38A', '#35A0FF', '#9B7CFF', '#FFB020', '#FF6FB5', '#5AD1C8', '#F5A524', '#7C5CFF', '#FF5470', '#8A90A2']

// Total value grouped by institution / brokerage (blank → "Unassigned").
// Real estate & vehicles aren't held at a brokerage, so they're left out.
export function computeBrokerageBreakdown(all: Holding[]): BrokerageSegment[] {
  const holdings = all.filter((h) => isInvestable(h.category))
  const total = holdings.reduce((s, h) => s + h.quantity * h.price, 0)
  const m = new Map<string, number>()
  for (const h of holdings) {
    const key = (h.institution || '').trim() || 'Unassigned'
    m.set(key, (m.get(key) || 0) + h.quantity * h.price)
  }
  return [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, pct: total ? value / total : 0, color: BROKERAGE_PALETTE[i % BROKERAGE_PALETTE.length] }))
    .filter((s) => s.value > 0)
}

// Investable value grouped by tax treatment (pre-tax / Roth / taxable). Also
// drives the retirement sim's withdrawal buckets, so illiquid assets are excluded.
export function computeTaxBreakdown(all: Holding[]): TreatmentSegment[] {
  const holdings = all.filter((h) => isInvestable(h.category))
  const total = holdings.reduce((s, h) => s + h.quantity * h.price, 0)
  return TREATMENTS.map((t) => {
    const value = holdings
      .filter((h) => accountTreatment(h.accountType) === t.value)
      .reduce((s, h) => s + h.quantity * h.price, 0)
    return { treatment: t.value, label: t.label, color: t.color, value, pct: total ? value / total : 0 }
  }).filter((s) => s.value > 0)
}

// Pre-tax / Roth share of investable assets — the retirement sim's withdrawal
// buckets. With no holdings yet, assume a typical 50% pre-tax / 20% Roth mix.
export function bucketSplit(holdings: Holding[]): { preTaxPct: number; rothPct: number } {
  if (!holdings.length) return { preTaxPct: 0.5, rothPct: 0.2 }
  const b = computeTaxBreakdown(holdings)
  return { preTaxPct: b.find((x) => x.treatment === 'PRE_TAX')?.pct ?? 0, rothPct: b.find((x) => x.treatment === 'ROTH')?.pct ?? 0 }
}

export interface EnrichedHolding extends Holding {
  value: number
  dayChg: number
  dayPct: number
  alloc: number
}

export interface Totals {
  total: number
  day: number
  dayPct: number
  en: EnrichedHolding[]
}

export interface AllocSegment {
  cat: Category
  value: number
  pct: number
  color: string
}

// Design category → display label + accent color.
export const CATEGORIES: Category[] = ['STOCKS', 'CRYPTO', 'CASH', 'BONDS', 'METALS', 'REAL_ESTATE', 'VEHICLE', 'OTHER']

export const CAT_LABEL: Record<Category, string> = {
  STOCKS: 'Stocks',
  CRYPTO: 'Crypto',
  CASH: 'Cash',
  BONDS: 'Bonds',
  METALS: 'Metals',
  REAL_ESTATE: 'Real estate',
  VEHICLE: 'Vehicles',
  OTHER: 'Other',
}

export const CAT_COLOR: Record<Category, string> = {
  STOCKS: '#22E38A',
  CRYPTO: '#FFB020',
  CASH: '#35A0FF',
  BONDS: '#9B7CFF',
  METALS: '#E8C547',
  REAL_ESTATE: '#5AD1C8',
  VEHICLE: '#C084FC',
  OTHER: '#FF6FB5',
}

// Market-priced categories (live quotes, cost basis, performance). The rest are
// tracked at a value you enter — or, for real estate & vehicles, an estimate.
export function isMarketPriced(c: Category): boolean {
  return c === 'STOCKS' || c === 'CRYPTO' || c === 'BONDS' || c === 'METALS'
}

// Real estate & vehicles count toward net worth but not investable assets
// (retirement starting capital, FIRE progress).
export function isInvestable(c: Category): boolean {
  return c !== 'REAL_ESTATE' && c !== 'VEHICLE'
}

export function investableTotal(holdings: Holding[]): number {
  return holdings.filter((h) => isInvestable(h.category)).reduce((s, h) => s + h.quantity * h.price, 0)
}

export function isEstimatedAsset(h: Pick<Holding, 'category' | 'appreciationPct' | 'openingCostPerShare' | 'openingAcquiredAt'>): boolean {
  return (h.category === 'REAL_ESTATE' || h.category === 'VEHICLE') && h.appreciationPct != null && h.openingCostPerShare != null && h.openingAcquiredAt != null
}

// Precious metals, quantity held in troy ounces and priced per ounce.
export const METALS: { symbol: string; name: string }[] = [
  { symbol: 'XAU', name: 'Gold' },
  { symbol: 'XAG', name: 'Silver' },
  { symbol: 'XPT', name: 'Platinum' },
  { symbol: 'XPD', name: 'Palladium' },
]
export const METAL_UNITS: { value: 'oz' | 'g' | 'kg'; label: string; toOz: number }[] = [
  { value: 'oz', label: 'troy oz', toOz: 1 },
  { value: 'g', label: 'grams', toOz: 1 / 31.1034768 },
  { value: 'kg', label: 'kilograms', toOz: 1000 / 31.1034768 },
]

// Unit shown next to a quantity.
export function quantityUnit(c: Category): string {
  if (c === 'METALS') return 'oz'
  if (c === 'CRYPTO') return ''
  return 'sh'
}

// ─── Liabilities ─────────────────────────────────────────────────────

export type LiabilityType = 'MORTGAGE' | 'HELOC' | 'AUTO_LOAN' | 'STUDENT_LOAN' | 'CREDIT_CARD' | 'PERSONAL_LOAN' | 'MEDICAL' | 'MARGIN' | 'OTHER'

export interface Liability {
  id: string
  name: string
  type: LiabilityType
  institution: string
  balance: number
  interestRatePct: number
  minPayment: number
  holdingId: string | null
}

export const LIABILITY_TYPES: { value: LiabilityType; label: string; color: string }[] = [
  { value: 'MORTGAGE', label: 'Mortgage', color: '#5AD1C8' },
  { value: 'HELOC', label: 'HELOC', color: '#38BDF8' },
  { value: 'AUTO_LOAN', label: 'Auto loan', color: '#C084FC' },
  { value: 'STUDENT_LOAN', label: 'Student loan', color: '#35A0FF' },
  { value: 'CREDIT_CARD', label: 'Credit card', color: '#FF5470' },
  { value: 'PERSONAL_LOAN', label: 'Personal loan', color: '#FFB020' },
  { value: 'MEDICAL', label: 'Medical', color: '#FF6FB5' },
  { value: 'MARGIN', label: 'Margin loan', color: '#F5A524' },
  { value: 'OTHER', label: 'Other', color: '#8A90A2' },
]
const LIABILITY_BY_VALUE = new Map(LIABILITY_TYPES.map((t) => [t.value, t]))
export function liabilityLabel(t: LiabilityType): string {
  return LIABILITY_BY_VALUE.get(t)?.label ?? 'Other'
}
export function liabilityColor(t: LiabilityType): string {
  return LIABILITY_BY_VALUE.get(t)?.color ?? '#8A90A2'
}
export function totalDebt(liabilities: Liability[]): number {
  return liabilities.reduce((s, l) => s + l.balance, 0)
}

// ─── Margin loans ────────────────────────────────────────────────────
// A margin loan borrows against a taxable brokerage account and has no required
// payment, so it isn't part of the avalanche/snowball payoff plan. Plans start
// from the account's equity instead: the loan comes off investable assets.

export const isMargin = (l: Pick<Liability, 'type'>) => l.type === 'MARGIN'

// Debts paid down from monthly cash flow (everything except margin).
export function payoffDebts<T extends Pick<Liability, 'type'>>(liabilities: T[]): T[] {
  return liabilities.filter((l) => !isMargin(l))
}

export function marginDebt(liabilities: Liability[]): number {
  return liabilities.filter(isMargin).reduce((s, l) => s + l.balance, 0)
}

// Starting point for retirement plans: investable assets net of margin loans,
// with the loan taken out of the taxable bucket (where margin accounts live).
export function planStart(holdings: Holding[], liabilities: Liability[] = []): { capital: number; preTaxPct: number; rothPct: number; margin: number } {
  const gross = investableTotal(holdings)
  const split = bucketSplit(holdings)
  const margin = Math.min(marginDebt(liabilities), gross)
  const capital = gross - margin
  if (margin <= 0 || capital <= 0) return { capital, ...split, margin }
  const preTax = split.preTaxPct * gross
  const roth = split.rothPct * gross
  return { capital, preTaxPct: Math.min(preTax, capital) / capital, rothPct: Math.min(roth, Math.max(0, capital - preTax)) / capital, margin }
}

// Brokers typically require 25–40% equity; 30% is a common house minimum.
export const MARGIN_MAINTENANCE = 0.3

// The securities a margin loan borrows against: stocks, ETFs and bonds in
// taxable accounts — at the loan's brokerage when any holding names it.
export function marginCollateral(holdings: Holding[], institution: string): { value: number; atInstitution: boolean } {
  const eligible = holdings.filter((h) => accountTreatment(h.accountType) === 'TAXABLE' && (h.category === 'STOCKS' || h.category === 'BONDS'))
  const inst = institution.trim().toLowerCase()
  const atBroker = inst ? eligible.filter((h) => h.institution.trim().toLowerCase() === inst) : []
  const used = atBroker.length ? atBroker : eligible
  return { value: used.reduce((s, h) => s + h.quantity * h.price, 0), atInstitution: atBroker.length > 0 }
}

// Loan-to-value, account equity and how far the account can fall before a
// margin call: the call comes when equity / value < maintenance, i.e. when the
// value drops below loan / (1 − maintenance).
export function marginStatus(loan: number, collateral: number, maintenance = MARGIN_MAINTENANCE): { ltv: number; equityPct: number; callDropPct: number } | null {
  if (collateral <= 0 || loan <= 0) return null
  return {
    ltv: loan / collateral,
    equityPct: (collateral - loan) / collateral,
    callDropPct: Math.max(0, 1 - loan / ((1 - maintenance) * collateral)),
  }
}

export function catColor(c: Category): string {
  return CAT_COLOR[c] || '#8A90A2'
}

// Top-10 crypto by market cap — instant suggestions in the Add Holding modal
// (the picker also browses the live top 100 and searches every coin).
export const TOP_CRYPTO: { symbol: string; name: string }[] = [
  { symbol: 'BTC', name: 'Bitcoin' },
  { symbol: 'ETH', name: 'Ethereum' },
  { symbol: 'USDT', name: 'Tether' },
  { symbol: 'BNB', name: 'BNB' },
  { symbol: 'SOL', name: 'Solana' },
  { symbol: 'XRP', name: 'XRP' },
  { symbol: 'USDC', name: 'USD Coin' },
  { symbol: 'ADA', name: 'Cardano' },
  { symbol: 'DOGE', name: 'Dogecoin' },
  { symbol: 'AVAX', name: 'Avalanche' },
]

// ─── Derived values ──────────────────────────────────────────────────

export function computeTotals(holdings: Holding[]): Totals {
  let total = 0
  let day = 0
  const en: EnrichedHolding[] = holdings.map((h) => {
    const value = h.quantity * h.price
    const dayChg = (h.price - h.prevClose) * h.quantity
    total += value
    day += dayChg
    return { ...h, value, dayChg, dayPct: h.prevClose ? (h.price - h.prevClose) / h.prevClose : 0, alloc: 0 }
  })
  en.forEach((h) => (h.alloc = total ? h.value / total : 0))
  en.sort((a, b) => b.value - a.value)
  return { total, day, dayPct: total - day ? day / (total - day) : 0, en }
}

// A generic allocation slice (used by the donut in both "class" and "ticker" modes).
export interface AllocSlice {
  key: string
  label: string
  value: number
  pct: number
  color: string
}

// Funds that track the same thing and can optionally be grouped into one slice.
const SP500_FUNDS = new Set(['VOO', 'VFIAX', 'VLISX', 'SPY', 'IVV', 'FXAIX', 'SWPPX', 'SPLG', 'VFINX', 'SPXL', 'UPRO'])
const NASDAQ100_FUNDS = new Set(['QQQ', 'QQQM', 'QQEW', 'ONEQ', 'QLD', 'TQQQ'])
// Bitcoin itself (and wrapped BTC) plus US bitcoin ETFs: spot, futures and
// leveraged. Grayscale's mini trust trades as "BTC", which lands here either way.
const BITCOIN_FUNDS = new Set([
  'BTC', 'WBTC', 'CBBTC',
  'IBIT', 'FBTC', 'GBTC', 'BITB', 'ARKB', 'HODL', 'BTCO', 'BRRR', 'EZBC', 'BTCW', 'DEFI',
  'BITO', 'BITX', 'BITU',
])

const SLICE_PALETTE = ['#22E38A', '#35A0FF', '#9B7CFF', '#FFB020', '#FF6FB5', '#5AD1C8', '#F5A524', '#7C5CFF', '#FF5470', '#4ADE80', '#38BDF8', '#C084FC']

function tickerSliceKey(symbol: string, groupIndex: boolean): string {
  const s = symbol.toUpperCase()
  if (groupIndex) {
    if (SP500_FUNDS.has(s)) return 'S&P 500'
    if (NASDAQ100_FUNDS.has(s)) return 'Nasdaq 100'
    if (BITCOIN_FUNDS.has(s)) return 'Bitcoin'
  }
  return s
}

// Allocation slices for the donut: by asset class, or by ticker (optionally
// rolling up S&P 500 / Nasdaq 100 funds and bitcoin + bitcoin ETFs), capped to
// keep the chart readable.
export function computeAllocationSlices(
  holdings: Holding[],
  mode: 'class' | 'ticker',
  groupIndex: boolean,
  maxSlices = 10
): AllocSlice[] {
  const total = holdings.reduce((s, h) => s + h.quantity * h.price, 0)

  if (mode === 'class') {
    const m = new Map<Category, number>()
    for (const h of holdings) m.set(h.category, (m.get(h.category) || 0) + h.quantity * h.price)
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cat, value]) => ({ key: cat, label: CAT_LABEL[cat], value, pct: total ? value / total : 0, color: CAT_COLOR[cat] }))
      .filter((s) => s.value > 0)
  }

  const m = new Map<string, number>()
  for (const h of holdings) {
    const k = tickerSliceKey(h.symbol, groupIndex)
    m.set(k, (m.get(k) || 0) + h.quantity * h.price)
  }
  let entries = [...m.entries()].sort((a, b) => b[1] - a[1])
  if (entries.length > maxSlices) {
    const rest = entries.slice(maxSlices - 1).reduce((s, [, v]) => s + v, 0)
    entries = [...entries.slice(0, maxSlices - 1), ['Other', rest] as [string, number]]
  }
  return entries
    .map(([key, value], i) => ({ key, label: key, value, pct: total ? value / total : 0, color: key === 'Other' ? '#8A90A2' : SLICE_PALETTE[i % SLICE_PALETTE.length] }))
    .filter((s) => s.value > 0)
}

export function computeAllocation(t: Totals): AllocSegment[] {
  const m: Partial<Record<Category, number>> = {}
  t.en.forEach((h) => (m[h.category] = (m[h.category] || 0) + h.value))
  return (Object.keys(m) as Category[])
    .map((c) => ({ cat: c, value: m[c]!, pct: t.total ? m[c]! / t.total : 0, color: catColor(c) }))
    .sort((a, b) => b.value - a.value)
}

// ─── Projection (monthly-compounded compound growth) ─────────────────

export interface ProjectionInput {
  start: number
  monthly: number
  ret: number // annual %
  years: number
  infl: number // annual %
  // Contribution changes: from the start of year `year` (0 = now), contribute
  // `monthly` instead. Later changes override earlier ones.
  changes?: { year: number; monthly: number }[]
}

export interface ProjectionResult extends ProjectionInput {
  nominal: number[]
  real: number[]
  contributed: number[]
  monthlyByYear: number[] // monthly contribution during each year (index 0 = year 1)
  finalNom: number
  finalReal: number
  totalContrib: number
  growth: number
}

// Monthly contribution in effect during year y (0-based).
export function contributionForYear(p: Pick<ProjectionInput, 'monthly' | 'changes'>, y: number): number {
  let m = p.monthly
  for (const c of [...(p.changes ?? [])].sort((a, b) => a.year - b.year)) if (c.year <= y) m = c.monthly
  return m
}

// Monthly compounding; each month grows at return ÷ 12, then the month's
// contribution is added (an ordinary annuity).
export function computeProjection(p: ProjectionInput): ProjectionResult {
  const r = p.ret / 100 / 12
  const nominal: number[] = [p.start]
  const real: number[] = [p.start]
  const contributed: number[] = [p.start]
  const monthlyByYear: number[] = []
  let bal = p.start
  let paid = p.start
  for (let y = 1; y <= p.years; y++) {
    const c = contributionForYear(p, y - 1)
    monthlyByYear.push(c)
    // A whole year at once: start × (1+r)^12 + c × ((1+r)^12 − 1) / r.
    const g = Math.pow(1 + r, 12)
    bal = r === 0 ? bal + c * 12 : bal * g + c * ((g - 1) / r)
    paid += c * 12
    nominal.push(bal)
    real.push(bal / Math.pow(1 + p.infl / 100, y))
    contributed.push(paid)
  }
  const finalNom = nominal[p.years]
  const finalReal = real[p.years]
  const totalContrib = contributed[p.years]
  return { ...p, nominal, real, contributed, monthlyByYear, finalNom, finalReal, totalContrib, growth: finalNom - totalContrib }
}

// ─── Net-worth history ───────────────────────────────────────────────
// If the backend has real snapshots, use them. Otherwise fall back to the
// prototype's seeded random walk, rescaled so the last point == current total.

export interface HistoryPoint {
  date: Date
  value: number
}

export function fallbackHistory(total: number, points = 156): HistoryPoint[] {
  let s = 987654321
  const rng = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
  const arr: number[] = []
  let v = 86000
  for (let i = 0; i < points; i++) {
    v *= 1.0046 + (rng() - 0.5) * 0.045
    arr.push(v)
  }
  const scale = total && arr[points - 1] ? total / arr[points - 1] : 1
  const now = new Date()
  const out: HistoryPoint[] = []
  for (let i = 0; i < points; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - (points - 1 - i) * 7)
    out.push({ date: d, value: arr[i] * scale })
  }
  return out
}

// ─── Formatters ──────────────────────────────────────────────────────

export function fmtUSD(n: number, d = 0): string {
  const sign = n < 0 && Math.abs(n) >= 0.5 * 10 ** -d ? '−' : ''
  return sign + '$' + Math.abs(Number(n)).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export function fmtCompact(n: number): string {
  const a = Math.abs(n)
  const sign = n < 0 && a >= 0.5 ? '−' : ''
  if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M'
  if (a >= 1e3) return sign + '$' + Math.round(a / 1e3) + 'k'
  return sign + '$' + Math.round(a)
}

export function signedUSD(n: number): string {
  return (n >= 0 ? '+' : '−') + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

export function signedPct(x: number): string {
  return (x >= 0 ? '+' : '−') + Math.abs(x * 100).toFixed(2) + '%'
}

export function pct(x: number): string {
  return (x * 100).toFixed(1) + '%'
}

export function mask(str: string, privacy: boolean): string {
  return privacy ? '••••••' : str
}

// ─── SVG chart helpers ───────────────────────────────────────────────

export interface Scale {
  x: (i: number) => number
  y: (v: number) => number
  mn: number
  mx: number
}

export function makeScale(
  vals: number[],
  W: number,
  H: number,
  padL: number,
  padR: number,
  padT: number,
  padB: number,
  fmin?: number
): Scale {
  let mn = Math.min(...vals)
  let mx = Math.max(...vals)
  if (fmin !== undefined) mn = fmin
  const rg = mx - mn || 1
  const pd = rg * 0.12
  if (fmin === undefined) mn -= pd
  mx += pd
  const r2 = mx - mn || 1
  return {
    x: (i) => padL + (i / (vals.length - 1)) * (W - padL - padR),
    y: (v) => padT + (1 - (v - mn) / r2) * (H - padT - padB),
    mn,
    mx,
  }
}

export function linePath(vals: number[], x: (i: number) => number, y: (v: number) => number): string {
  return vals.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ')
}

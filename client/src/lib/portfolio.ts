// Portfolio math, formatters, and chart helpers — ported from the design
// prototype (`Portfolio Dashboard.dc.html`) so the numbers and visuals match.

export type Category = 'STOCKS' | 'CRYPTO' | 'CASH' | 'BONDS' | 'OTHER'

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
export function computeBrokerageBreakdown(holdings: Holding[]): BrokerageSegment[] {
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

// Total value grouped by tax treatment (pre-tax / Roth / taxable).
export function computeTaxBreakdown(holdings: Holding[]): TreatmentSegment[] {
  const total = holdings.reduce((s, h) => s + h.quantity * h.price, 0)
  return TREATMENTS.map((t) => {
    const value = holdings
      .filter((h) => accountTreatment(h.accountType) === t.value)
      .reduce((s, h) => s + h.quantity * h.price, 0)
    return { treatment: t.value, label: t.label, color: t.color, value, pct: total ? value / total : 0 }
  }).filter((s) => s.value > 0)
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
export const CATEGORIES: Category[] = ['STOCKS', 'CRYPTO', 'CASH', 'BONDS', 'OTHER']

export const CAT_LABEL: Record<Category, string> = {
  STOCKS: 'Stocks',
  CRYPTO: 'Crypto',
  CASH: 'Cash',
  BONDS: 'Bonds',
  OTHER: 'Other',
}

export const CAT_COLOR: Record<Category, string> = {
  STOCKS: '#22E38A',
  CRYPTO: '#FFB020',
  CASH: '#35A0FF',
  BONDS: '#9B7CFF',
  OTHER: '#FF6FB5',
}

export function catColor(c: Category): string {
  return CAT_COLOR[c] || '#8A90A2'
}

// Top-10 crypto by market cap — offered as suggestions in the Add Holding modal.
// The ticker is stored as the holding symbol; the server maps it to a CoinGecko id.
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

// Index-fund families that can optionally be grouped into a single slice.
const SP500_FUNDS = new Set(['VOO', 'VFIAX', 'VLISX', 'SPY', 'IVV', 'FXAIX', 'SWPPX', 'SPLG', 'VFINX', 'SPXL', 'UPRO'])
const NASDAQ100_FUNDS = new Set(['QQQ', 'QQQM', 'QQEW', 'ONEQ', 'QLD', 'TQQQ'])

const SLICE_PALETTE = ['#22E38A', '#35A0FF', '#9B7CFF', '#FFB020', '#FF6FB5', '#5AD1C8', '#F5A524', '#7C5CFF', '#FF5470', '#4ADE80', '#38BDF8', '#C084FC']

function tickerSliceKey(symbol: string, groupIndex: boolean): string {
  const s = symbol.toUpperCase()
  if (groupIndex) {
    if (SP500_FUNDS.has(s)) return 'S&P 500'
    if (NASDAQ100_FUNDS.has(s)) return 'Nasdaq 100'
  }
  return s
}

// Allocation slices for the donut: by asset class, or by ticker (optionally
// rolling up S&P 500 / Nasdaq 100 index funds), capped to keep the chart readable.
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
}

export interface ProjectionResult extends ProjectionInput {
  nominal: number[]
  real: number[]
  contributed: number[]
  finalNom: number
  finalReal: number
  totalContrib: number
  growth: number
}

export function computeProjection(p: ProjectionInput): ProjectionResult {
  const r = p.ret / 100 / 12
  const fv = (m: number) =>
    r === 0 ? p.start + p.monthly * m : p.start * Math.pow(1 + r, m) + p.monthly * ((Math.pow(1 + r, m) - 1) / r)
  const nominal: number[] = []
  const real: number[] = []
  const contributed: number[] = []
  for (let y = 0; y <= p.years; y++) {
    const m = y * 12
    const val = fv(m)
    nominal.push(val)
    real.push(val / Math.pow(1 + p.infl / 100, y))
    contributed.push(p.start + p.monthly * 12 * y)
  }
  const finalNom = nominal[p.years]
  const finalReal = real[p.years]
  const totalContrib = contributed[p.years]
  return { ...p, nominal, real, contributed, finalNom, finalReal, totalContrib, growth: finalNom - totalContrib }
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
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export function fmtCompact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M'
  if (a >= 1e3) return '$' + Math.round(n / 1e3) + 'k'
  return '$' + Math.round(n)
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

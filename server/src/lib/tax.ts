import { AccountType, Category, FilingStatus, Holding } from '@prisma/client'

// Tax planning helpers: 2026 federal brackets, asset-location checks, a Roth
// conversion ladder and curated replacement funds for tax-loss harvesting.
// Everything here is deterministic; the AI layer only explains the results.

// ─── 2026 federal brackets (IRS Rev. Proc. 2025-32) ──────────────────
// Upper bound of each bracket's taxable income. Brackets are inflation-indexed,
// so they stay constant in the planner's today's-dollar projections.
const BRACKETS: Record<FilingStatus, [number, number][]> = {
  SINGLE: [
    [10, 12_400],
    [12, 50_400],
    [22, 105_700],
    [24, 201_775],
    [32, 256_225],
    [35, 640_600],
    [37, Infinity],
  ],
  MARRIED_JOINT: [
    [10, 24_800],
    [12, 100_800],
    [22, 211_400],
    [24, 403_550],
    [32, 512_450],
    [35, 768_700],
    [37, Infinity],
  ],
}
export const STANDARD_DEDUCTION: Record<FilingStatus, number> = { SINGLE: 16_100, MARRIED_JOINT: 32_200 }
export const CONVERSION_BRACKETS = [10, 12, 22, 24, 32] as const

// Federal tax on ordinary income (before the standard deduction is applied).
export function incomeTax(grossIncome: number, status: FilingStatus): number {
  let taxable = Math.max(0, grossIncome - STANDARD_DEDUCTION[status])
  let tax = 0
  let lower = 0
  for (const [rate, upper] of BRACKETS[status]) {
    const slice = Math.min(taxable, upper - lower)
    if (slice <= 0) break
    tax += slice * (rate / 100)
    taxable -= slice
    lower = upper
  }
  return tax
}

export function marginalRate(grossIncome: number, status: FilingStatus): number {
  const taxable = Math.max(0, grossIncome - STANDARD_DEDUCTION[status])
  for (const [rate, upper] of BRACKETS[status]) if (taxable < upper) return rate
  return 37
}

// Gross ordinary income that fills the given bracket to the top.
export function bracketCeiling(ratePct: number, status: FilingStatus): number {
  const row = BRACKETS[status].find(([rate]) => rate === ratePct)
  if (!row || !isFinite(row[1])) throw new Error(`No ${ratePct}% bracket`)
  return row[1] + STANDARD_DEDUCTION[status]
}

// ─── Fund classification ─────────────────────────────────────────────

export type TaxClass = 'BOND' | 'MUNI' | 'REIT' | 'HIGH_YIELD' | 'INTERNATIONAL' | 'BROAD_INDEX' | 'GROWTH' | 'COLLECTIBLE' | 'CASH' | 'OTHER'

const sets = (s: string) => new Set(s.split(' '))
const MUNI = sets('MUB VTEB TFI SUB HYD SHM ITM MLN FMHI')
const BOND = sets('BND AGG SCHZ IUSB BNDX TLT VGLT SPTL IEF VGIT SHY VGSH BSV BIV BLV VCIT VCSH LQD HYG JNK USHY TIP VTIP SCHP GOVT FXNAX VBTLX SGOV BIL')
const REIT = sets('VNQ SCHH XLRE USRT IYR RWR VNQI O PLD AMT EQIX SPG PSA WELL DLR')
const HIGH_YIELD = sets('SCHD VYM HDV DVY SPYD JEPI JEPQ DIVO NOBL SDY')
const INTERNATIONAL = sets('VXUS IXUS VEU ACWX VEA IEFA SCHF SPDW EFA VWO IEMG SCHE SPEM EEM VT VTIAX FTIHX')
const BROAD = sets('VTI VOO SPY IVV ITOT SCHB SCHX VV SPLG FXAIX FSKAX SWTSX SWPPX VTSAX VFIAX FZROX RSP')

export function classify(symbol: string, category: Category): TaxClass {
  const s = symbol.toUpperCase()
  if (category === 'CASH') return 'CASH'
  if (category === 'METALS') return 'COLLECTIBLE'
  if (category === 'CRYPTO') return 'GROWTH'
  if (MUNI.has(s)) return 'MUNI'
  if (category === 'BONDS' || BOND.has(s)) return 'BOND'
  if (REIT.has(s)) return 'REIT'
  if (HIGH_YIELD.has(s)) return 'HIGH_YIELD'
  if (INTERNATIONAL.has(s)) return 'INTERNATIONAL'
  if (BROAD.has(s)) return 'BROAD_INDEX'
  // Growth funds and individual stocks: the highest expected growth.
  if (category === 'STOCKS') return 'GROWTH'
  return 'OTHER'
}

// Where each account's gains are taxed. HSAs are tax-free when spent on medical
// costs, so for placement they sit with Roth accounts.
export type TaxBucket = 'TAXABLE' | 'DEFERRED' | 'FREE'
export function bucketOf(a: AccountType): TaxBucket {
  if (a === 'TRADITIONAL_401K' || a === 'TRADITIONAL_IRA') return 'DEFERRED'
  if (a === 'ROTH_401K' || a === 'ROTH_IRA' || a === 'HSA') return 'FREE'
  return 'TAXABLE'
}

// ─── Asset location ──────────────────────────────────────────────────

export interface LocationFinding {
  severity: 'high' | 'medium' | 'low' | 'info' | 'good'
  title: string
  detail: string
  amount: number // $ that could be relocated (0 for informational notes)
  symbols: string[]
}

export interface AssetLocation {
  buckets: Record<TaxBucket, Partial<Record<TaxClass, number>>>
  findings: LocationFinding[]
}

const INCOME_HEAVY: TaxClass[] = ['BOND', 'REIT', 'HIGH_YIELD']
const EQUITY: TaxClass[] = ['BROAD_INDEX', 'GROWTH', 'INTERNATIONAL']

export function assetLocation(holdings: Pick<Holding, 'symbol' | 'category' | 'accountType' | 'quantity' | 'price'>[]): AssetLocation {
  const buckets: AssetLocation['buckets'] = { TAXABLE: {}, DEFERRED: {}, FREE: {} }
  const syms: Record<TaxBucket, Partial<Record<TaxClass, Set<string>>>> = { TAXABLE: {}, DEFERRED: {}, FREE: {} }
  for (const h of holdings) {
    if (h.category === 'REAL_ESTATE' || h.category === 'VEHICLE') continue
    const value = h.quantity * h.price
    if (value <= 0) continue
    const b = bucketOf(h.accountType)
    const c = classify(h.symbol, h.category)
    buckets[b][c] = (buckets[b][c] ?? 0) + value
    ;(syms[b][c] ??= new Set()).add(h.symbol)
  }
  const sum = (b: TaxBucket, classes: TaxClass[]) => classes.reduce((s, c) => s + (buckets[b][c] ?? 0), 0)
  const list = (b: TaxBucket, classes: TaxClass[]) => classes.flatMap((c) => [...(syms[b][c] ?? [])])
  const findings: LocationFinding[] = []

  // 1. Interest / non-qualified dividends taxed yearly in taxable, while
  //    tax-advantaged accounts hold stock funds that could trade places.
  const inefficientTaxable = sum('TAXABLE', INCOME_HEAVY)
  const equityAdvantaged = sum('DEFERRED', EQUITY) + sum('FREE', EQUITY)
  const swappable = Math.min(inefficientTaxable, equityAdvantaged)
  if (swappable >= 1000) {
    findings.push({
      severity: swappable >= 10_000 ? 'high' : 'medium',
      title: 'Hold income-producing funds in tax-advantaged accounts',
      detail: `${list('TAXABLE', INCOME_HEAVY).join(', ')} in your taxable account pay interest or dividends taxed every year as ordinary income, while your retirement accounts hold stock funds. Holding up to ${usd(swappable)} of the income-producing funds inside an IRA/401(k) instead — and the stock funds in taxable — keeps the same overall mix with less tax each year.`,
      amount: swappable,
      symbols: list('TAXABLE', INCOME_HEAVY),
    })
  }

  // 2. Tax-exempt bonds inside tax-sheltered accounts waste their exemption.
  const muniSheltered = (buckets.DEFERRED.MUNI ?? 0) + (buckets.FREE.MUNI ?? 0)
  if (muniSheltered >= 1000) {
    findings.push({
      severity: 'medium',
      title: 'Municipal bonds belong in taxable accounts',
      detail: `${[...list('DEFERRED', ['MUNI']), ...list('FREE', ['MUNI'])].join(', ')} pay tax-free interest at a lower yield — inside an IRA or 401(k) that tax break is wasted. Regular bonds usually yield more there.`,
      amount: muniSheltered,
      symbols: [...list('DEFERRED', ['MUNI']), ...list('FREE', ['MUNI'])],
    })
  }

  // 3. Roth should hold the highest expected growth; bonds grow slowest.
  const bondsInRoth = sum('FREE', ['BOND', 'CASH'])
  const growthDeferred = sum('DEFERRED', ['GROWTH', 'BROAD_INDEX'])
  const rothSwap = Math.min(bondsInRoth, growthDeferred)
  if (rothSwap >= 1000) {
    findings.push({
      severity: 'medium',
      title: 'Give your Roth the highest-growth assets',
      detail: `Your Roth/HSA holds ${usd(bondsInRoth)} in bonds or cash while your traditional accounts hold stocks. Roth growth is never taxed, so swapping up to ${usd(rothSwap)} — bonds in the traditional account, stocks in the Roth — puts the most growth where it's tax-free.`,
      amount: rothSwap,
      symbols: list('FREE', ['BOND', 'CASH']),
    })
  }

  // 4. Foreign tax credit is only usable in taxable accounts.
  const intlSheltered = (buckets.DEFERRED.INTERNATIONAL ?? 0) + (buckets.FREE.INTERNATIONAL ?? 0)
  const taxableEquity = sum('TAXABLE', ['BROAD_INDEX', 'GROWTH'])
  if (intlSheltered >= 5000 && taxableEquity >= 5000) {
    findings.push({
      severity: 'low',
      title: 'International funds get a small edge in taxable',
      detail: `Foreign taxes withheld on ${[...list('DEFERRED', ['INTERNATIONAL']), ...list('FREE', ['INTERNATIONAL'])].join(', ')} can be claimed as a foreign tax credit only in a taxable account. A minor effect — worth considering when you rebalance.`,
      amount: Math.min(intlSheltered, taxableEquity),
      symbols: [...list('DEFERRED', ['INTERNATIONAL']), ...list('FREE', ['INTERNATIONAL'])],
    })
  }

  // 5. Collectibles rate on precious metals held in taxable.
  const metalsTaxable = buckets.TAXABLE.COLLECTIBLE ?? 0
  if (metalsTaxable > 0) {
    findings.push({
      severity: 'info',
      title: 'Precious metals are taxed as collectibles',
      detail: `Long-term gains on gold, silver and other bullion (including most physically backed metal ETFs) in taxable accounts are taxed at up to 28%, not the usual 15–20% long-term rate.`,
      amount: 0,
      symbols: list('TAXABLE', ['COLLECTIBLE']),
    })
  }

  const accountTypes = (['TAXABLE', 'DEFERRED', 'FREE'] as TaxBucket[]).filter((b) => Object.keys(buckets[b]).length > 0)
  if (!findings.some((f) => f.severity !== 'info') && accountTypes.length >= 2) {
    findings.unshift({
      severity: 'good',
      title: 'Your asset location already looks tax-efficient',
      detail: 'Income-producing funds are sheltered and stock funds sit where their growth is taxed least.',
      amount: 0,
      symbols: [],
    })
  }
  return { buckets, findings }
}

// ─── Roth conversion ladder ──────────────────────────────────────────

export interface LadderInput {
  currentAge: number
  retirementAge: number
  convertibleBalance: number // traditional 401(k) + IRA today
  investableTotal: number // all investable assets today
  monthlyContribution: number
  realReturn: number // e.g. 0.048
  socialSecurityAnnual: number // at the chosen claim age
  ssStartAge: number
  pensionAnnual: number
  pensionStartAge: number
  filingStatus: FilingStatus
  targetBracketPct: number
}

export interface LadderYear {
  age: number
  otherIncome: number // taxable pension + Social Security (85%)
  conversion: number
  tax: number
  balance: number // traditional balance at year end, with the ladder
  balanceNoLadder: number
}

export interface Ladder {
  applicable: boolean
  reason?: string
  startAge: number
  endAge: number
  years: LadderYear[]
  totalConverted: number
  totalTax: number
  avgRate: number
  balanceAtStart: number
  rmdAt73: { withLadder: number; withoutLadder: number; bracketWith: number; bracketWithout: number }
  penaltyFreeFromAge: number | null // 5-year rule for early retirees
}

const RMD_AGE = 73
const RMD_DIVISOR_73 = 26.5
const SS_TAXABLE_SHARE = 0.85 // upper bound of Social Security that's taxable

export function rothLadder(p: LadderInput): Ladder {
  const empty = (reason: string): Ladder => ({
    applicable: false,
    reason,
    startAge: 0,
    endAge: 0,
    years: [],
    totalConverted: 0,
    totalTax: 0,
    avgRate: 0,
    balanceAtStart: 0,
    rmdAt73: { withLadder: 0, withoutLadder: 0, bracketWith: 0, bracketWithout: 0 },
    penaltyFreeFromAge: null,
  })
  if (p.convertibleBalance <= 0) return empty('No traditional 401(k) or IRA balance to convert.')
  const startAge = Math.max(p.currentAge, p.retirementAge)
  if (startAge >= RMD_AGE) return empty('Required minimum distributions have already started.')

  // Grow the traditional balance to retirement, with its share of new savings.
  const share = p.investableTotal > 0 ? Math.min(1, p.convertibleBalance / p.investableTotal) : 1
  let balance = p.convertibleBalance
  for (let age = p.currentAge; age < startAge; age++) balance = (balance + p.monthlyContribution * 12 * share) * (1 + p.realReturn)
  const balanceAtStart = balance
  let noLadder = balance

  const ceiling = bracketCeiling(p.targetBracketPct, p.filingStatus)
  const otherIncomeAt = (age: number) => (age >= p.pensionStartAge ? p.pensionAnnual : 0) + (age >= p.ssStartAge ? p.socialSecurityAnnual * SS_TAXABLE_SHARE : 0)

  const years: LadderYear[] = []
  let totalConverted = 0
  let totalTax = 0
  for (let age = startAge; age < RMD_AGE; age++) {
    const other = otherIncomeAt(age)
    const conversion = Math.max(0, Math.min(ceiling - other, balance))
    const tax = incomeTax(other + conversion, p.filingStatus) - incomeTax(other, p.filingStatus)
    balance = (balance - conversion) * (1 + p.realReturn)
    noLadder *= 1 + p.realReturn
    totalConverted += conversion
    totalTax += tax
    years.push({ age, otherIncome: other, conversion, tax, balance, balanceNoLadder: noLadder })
  }

  const rmdWith = balance / RMD_DIVISOR_73
  const rmdWithout = noLadder / RMD_DIVISOR_73
  const other73 = otherIncomeAt(RMD_AGE)
  return {
    applicable: true,
    startAge,
    endAge: RMD_AGE - 1,
    years,
    totalConverted,
    totalTax,
    avgRate: totalConverted > 0 ? totalTax / totalConverted : 0,
    balanceAtStart,
    rmdAt73: {
      withLadder: rmdWith,
      withoutLadder: rmdWithout,
      bracketWith: marginalRate(other73 + rmdWith, p.filingStatus),
      bracketWithout: marginalRate(other73 + rmdWithout, p.filingStatus),
    },
    // Converted amounts can be withdrawn penalty-free 5 years later (before 59½).
    penaltyFreeFromAge: startAge < 59.5 && totalConverted > 0 ? startAge + 5 : null,
  }
}

// ─── Replacement funds for tax-loss harvesting ───────────────────────

export interface Replacement {
  symbol: string
  name: string
  tracks: string
}

// Fund → index it tracks. Funds in the same group give similar exposure;
// suggestions always track a DIFFERENT index than the fund being sold.
const FUNDS: Record<string, { name: string; tracks: string; group: string }> = {
  VOO: { name: 'Vanguard S&P 500', tracks: 'S&P 500', group: 'us-large' },
  IVV: { name: 'iShares Core S&P 500', tracks: 'S&P 500', group: 'us-large' },
  SPY: { name: 'SPDR S&P 500', tracks: 'S&P 500', group: 'us-large' },
  SPLG: { name: 'SPDR Portfolio S&P 500', tracks: 'S&P 500', group: 'us-large' },
  FXAIX: { name: 'Fidelity 500 Index', tracks: 'S&P 500', group: 'us-large' },
  SWPPX: { name: 'Schwab S&P 500 Index', tracks: 'S&P 500', group: 'us-large' },
  VFIAX: { name: 'Vanguard 500 Index Admiral', tracks: 'S&P 500', group: 'us-large' },
  VTI: { name: 'Vanguard Total Stock Market', tracks: 'CRSP US Total Market', group: 'us-large' },
  VTSAX: { name: 'Vanguard Total Stock Market Admiral', tracks: 'CRSP US Total Market', group: 'us-large' },
  ITOT: { name: 'iShares Core S&P Total US Stock Market', tracks: 'S&P Total Market', group: 'us-large' },
  SCHB: { name: 'Schwab US Broad Market', tracks: 'Dow Jones US Broad Stock Market', group: 'us-large' },
  SCHX: { name: 'Schwab US Large-Cap', tracks: 'Dow Jones US Large-Cap Total Stock Market', group: 'us-large' },
  VV: { name: 'Vanguard Large-Cap', tracks: 'CRSP US Large Cap', group: 'us-large' },
  FSKAX: { name: 'Fidelity Total Market Index', tracks: 'Dow Jones US Total Stock Market', group: 'us-large' },
  QQQ: { name: 'Invesco QQQ', tracks: 'Nasdaq-100', group: 'us-growth' },
  QQQM: { name: 'Invesco Nasdaq 100', tracks: 'Nasdaq-100', group: 'us-growth' },
  VUG: { name: 'Vanguard Growth', tracks: 'CRSP US Large Cap Growth', group: 'us-growth' },
  SCHG: { name: 'Schwab US Large-Cap Growth', tracks: 'Dow Jones US Large-Cap Growth', group: 'us-growth' },
  IWF: { name: 'iShares Russell 1000 Growth', tracks: 'Russell 1000 Growth', group: 'us-growth' },
  MGK: { name: 'Vanguard Mega Cap Growth', tracks: 'CRSP US Mega Cap Growth', group: 'us-growth' },
  VXUS: { name: 'Vanguard Total International Stock', tracks: 'FTSE Global All Cap ex US', group: 'intl-total' },
  IXUS: { name: 'iShares Core MSCI Total International', tracks: 'MSCI ACWI ex USA IMI', group: 'intl-total' },
  VEU: { name: 'Vanguard FTSE All-World ex-US', tracks: 'FTSE All-World ex US', group: 'intl-total' },
  VEA: { name: 'Vanguard FTSE Developed Markets', tracks: 'FTSE Developed All Cap ex US', group: 'intl-dev' },
  IEFA: { name: 'iShares Core MSCI EAFE', tracks: 'MSCI EAFE IMI', group: 'intl-dev' },
  SPDW: { name: 'SPDR Portfolio Developed World ex-US', tracks: 'S&P Developed ex-US BMI', group: 'intl-dev' },
  VWO: { name: 'Vanguard FTSE Emerging Markets', tracks: 'FTSE Emerging Markets All Cap China A Inclusion', group: 'intl-em' },
  IEMG: { name: 'iShares Core MSCI Emerging Markets', tracks: 'MSCI Emerging Markets IMI', group: 'intl-em' },
  SPEM: { name: 'SPDR Portfolio Emerging Markets', tracks: 'S&P Emerging BMI', group: 'intl-em' },
  BND: { name: 'Vanguard Total Bond Market', tracks: 'Bloomberg US Aggregate Float Adjusted', group: 'us-bond' },
  AGG: { name: 'iShares Core US Aggregate Bond', tracks: 'Bloomberg US Aggregate', group: 'us-bond' },
  IUSB: { name: 'iShares Core Total USD Bond Market', tracks: 'Bloomberg US Universal', group: 'us-bond' },
  TLT: { name: 'iShares 20+ Year Treasury', tracks: 'ICE US Treasury 20+ Year', group: 'long-treasury' },
  VGLT: { name: 'Vanguard Long-Term Treasury', tracks: 'Bloomberg US Long Treasury', group: 'long-treasury' },
  SCHD: { name: 'Schwab US Dividend Equity', tracks: 'Dow Jones US Dividend 100', group: 'dividend' },
  VYM: { name: 'Vanguard High Dividend Yield', tracks: 'FTSE High Dividend Yield', group: 'dividend' },
  DGRO: { name: 'iShares Core Dividend Growth', tracks: 'Morningstar US Dividend Growth', group: 'dividend' },
  VNQ: { name: 'Vanguard Real Estate', tracks: 'MSCI US IMI Real Estate 25/50', group: 'reit' },
  SCHH: { name: 'Schwab US REIT', tracks: 'Dow Jones Equity All REIT Capped', group: 'reit' },
  USRT: { name: 'iShares Core US REIT', tracks: 'FTSE Nareit Equity REITs', group: 'reit' },
}

// Preferred swap order within each group.
const GROUP_ORDER: Record<string, string[]> = {
  'us-large': ['VTI', 'ITOT', 'SCHB', 'VOO', 'SCHX', 'VV'],
  'us-growth': ['VUG', 'SCHG', 'IWF', 'QQQM', 'MGK'],
  'intl-total': ['VXUS', 'IXUS', 'VEU'],
  'intl-dev': ['VEA', 'IEFA', 'SPDW'],
  'intl-em': ['VWO', 'IEMG', 'SPEM'],
  'us-bond': ['BND', 'AGG', 'IUSB'],
  'long-treasury': ['TLT', 'VGLT'],
  dividend: ['SCHD', 'VYM', 'DGRO'],
  reit: ['VNQ', 'SCHH', 'USRT'],
}

// Individual stocks → sector funds with similar exposure (not identical).
const SECTOR_FUNDS: Record<string, { sector: string; funds: [string, string][] }> = {
  tech: { sector: 'technology', funds: [['XLK', 'Technology Select Sector SPDR'], ['VGT', 'Vanguard Information Technology']] },
  semis: { sector: 'semiconductors', funds: [['SMH', 'VanEck Semiconductor'], ['SOXX', 'iShares Semiconductor']] },
  comm: { sector: 'communication services', funds: [['XLC', 'Communication Services Select Sector SPDR'], ['VOX', 'Vanguard Communication Services']] },
  discretionary: { sector: 'consumer discretionary', funds: [['XLY', 'Consumer Discretionary Select Sector SPDR'], ['VCR', 'Vanguard Consumer Discretionary']] },
  financials: { sector: 'financials', funds: [['XLF', 'Financial Select Sector SPDR'], ['VFH', 'Vanguard Financials']] },
  health: { sector: 'health care', funds: [['XLV', 'Health Care Select Sector SPDR'], ['VHT', 'Vanguard Health Care']] },
  energy: { sector: 'energy', funds: [['XLE', 'Energy Select Sector SPDR'], ['VDE', 'Vanguard Energy']] },
  staples: { sector: 'consumer staples', funds: [['XLP', 'Consumer Staples Select Sector SPDR'], ['VDC', 'Vanguard Consumer Staples']] },
}
const STOCK_SECTOR: Record<string, keyof typeof SECTOR_FUNDS> = Object.fromEntries(
  (
    [
      ['tech', 'AAPL MSFT ORCL CRM ADBE IBM NOW INTU CSCO ACN PLTR'],
      ['semis', 'NVDA AMD AVGO INTC QCOM TSM MU TXN AMAT LRCX ASML ARM'],
      ['comm', 'GOOGL GOOG META NFLX DIS TMUS VZ T'],
      ['discretionary', 'AMZN TSLA HD NKE MCD SBUX LOW BKNG'],
      ['financials', 'JPM BAC WFC GS MS C V MA AXP BRK-B BRK.B SCHW BLK PYPL'],
      ['health', 'UNH JNJ LLY PFE MRK ABBV TMO ABT AMGN'],
      ['energy', 'XOM CVX COP OXY SLB'],
      ['staples', 'KO PEP PG COST WMT PM MO CL'],
    ] as [keyof typeof SECTOR_FUNDS, string][]
  ).flatMap(([sector, list]) => list.split(' ').map((s) => [s, sector]))
)

export function replacementsFor(symbol: string, category: string): { replacements: Replacement[]; note: string } {
  const s = symbol.toUpperCase()
  if (category === 'CRYPTO') {
    return { replacements: [], note: 'Tax rules for crypto wash sales have been changing — confirm the current rule before rebuying the same coin within 30 days.' }
  }
  const fund = FUNDS[s]
  if (fund) {
    const replacements = (GROUP_ORDER[fund.group] ?? [])
      .filter((alt) => alt !== s && FUNDS[alt] && FUNDS[alt].tracks !== fund.tracks)
      .slice(0, 3)
      .map((alt) => ({ symbol: alt, name: FUNDS[alt].name, tracks: FUNDS[alt].tracks }))
    return { replacements, note: `Similar exposure through a different index than ${fund.tracks}.` }
  }
  const sector = STOCK_SECTOR[s]
  if (sector) {
    const info = SECTOR_FUNDS[sector]
    return {
      replacements: info.funds.map(([sym, name]) => ({ symbol: sym, name, tracks: `${info.sector} sector` })),
      note: `A ${info.sector} sector fund keeps similar exposure while you wait out the 30-day window.`,
    }
  }
  return { replacements: [], note: 'Look for a broad or sector fund with similar exposure that tracks a different index.' }
}

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US')

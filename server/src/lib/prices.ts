import axios from 'axios'

export type AssetTypeLike = 'STOCK' | 'ETF' | 'CRYPTO' | 'MUTUAL_FUND' | 'METAL' | 'OTHER'

export interface Quote {
  symbol: string
  price: number
  prevClose: number
  currency: string
}

const COINGECKO_BASE = process.env.COINGECKO_API_BASE || 'https://api.coingecko.com/api/v3'
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'
// Yahoo rejects requests without a browser-ish User-Agent.
const YAHOO_HEADERS = { 'User-Agent': 'Mozilla/5.0' }

const DAY = 86_400_000

// Top crypto tickers → CoinGecko coin ids. Holdings store the ticker (e.g. BTC)
// and, when picked from search, the exact coin id in `providerId`. Unknown
// tickers without an id fall back to the lowercased symbol (works for many coins).
export const CRYPTO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  USDC: 'usd-coin',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  AVAX: 'avalanche-2',
  TON: 'the-open-network',
  TRX: 'tron',
  LINK: 'chainlink',
  DOT: 'polkadot',
  MATIC: 'matic-network',
}

// Precious metals, priced per troy ounce from the front-month COMEX/NYMEX
// futures on Yahoo (closely tracks spot; no API key).
export const METALS: Record<string, { name: string; yahoo: string }> = {
  XAU: { name: 'Gold', yahoo: 'GC=F' },
  XAG: { name: 'Silver', yahoo: 'SI=F' },
  XPT: { name: 'Platinum', yahoo: 'PL=F' },
  XPD: { name: 'Palladium', yahoo: 'PA=F' },
}

// Map a holding category to the price provider's asset routing. Categories
// without market prices (cash, other, real estate, vehicles) return null.
export function assetTypeForCategory(category: string): AssetTypeLike | null {
  const c = category.toUpperCase()
  if (c === 'CRYPTO') return 'CRYPTO'
  if (c === 'METALS') return 'METAL'
  if (c === 'STOCKS' || c === 'BONDS' || c === 'STOCK' || c === 'ETF') return 'STOCK'
  return null
}

function cryptoId(symbol: string, providerId?: string | null): string {
  return providerId || CRYPTO_IDS[symbol.toUpperCase()] || symbol.toLowerCase()
}

// The Yahoo symbol to query: metals map to their futures contract.
function yahooSymbol(symbol: string, assetType: AssetTypeLike): string {
  const sym = symbol.toUpperCase()
  if (assetType === 'METAL') return METALS[sym]?.yahoo ?? sym
  return sym
}

// Stocks/ETFs/metals via Yahoo Finance's public chart endpoint (no API key).
// The `meta` block carries the latest price and the previous close directly.
async function fetchYahooQuote(symbol: string, querySymbol: string): Promise<Quote | null> {
  try {
    // range=1d so chartPreviousClose is the PRIOR trading day's close (true 24h /
    // daily change). A wider range makes it the close before the whole window.
    const { data } = await axios.get(`${YAHOO_BASE}/${encodeURIComponent(querySymbol)}`, {
      params: { range: '1d', interval: '1d' },
      headers: YAHOO_HEADERS,
      timeout: 8000,
    })
    const meta = data?.chart?.result?.[0]?.meta
    const price = meta?.regularMarketPrice
    if (typeof price === 'number' && price > 0) {
      const prev = meta.previousClose ?? meta.chartPreviousClose
      const prevClose = typeof prev === 'number' && prev > 0 ? prev : price
      return { symbol: symbol.toUpperCase(), price, prevClose, currency: meta.currency || 'USD' }
    }
    return null
  } catch (err) {
    console.error(`[prices] yahoo quote failed for ${querySymbol}:`, String(err))
    return null
  }
}

// CoinGecko keys prices by internal coin id.
// include_24hr_change lets us derive the previous close from the current price.
async function fetchCryptoQuote(symbol: string, providerId?: string | null): Promise<Quote | null> {
  const id = cryptoId(symbol, providerId)
  try {
    const { data } = await axios.get(`${COINGECKO_BASE}/simple/price`, {
      params: { ids: id, vs_currencies: 'usd', include_24hr_change: 'true' },
      timeout: 8000,
    })
    const row = data?.[id]
    const price = row?.usd
    if (typeof price === 'number' && price > 0) {
      const chg = typeof row.usd_24h_change === 'number' ? row.usd_24h_change : 0
      const prevClose = chg !== 0 ? price / (1 + chg / 100) : price
      return { symbol: symbol.toUpperCase(), price, prevClose, currency: 'USD' }
    }
    return null
  } catch (err) {
    console.error(`[prices] coingecko failed for ${symbol} (${id}):`, String(err))
    return null
  }
}

// Fetch a single quote, routing by asset type.
export async function getQuote(symbol: string, assetType: AssetTypeLike, providerId?: string | null): Promise<Quote | null> {
  if (assetType === 'CRYPTO') return fetchCryptoQuote(symbol, providerId)
  return fetchYahooQuote(symbol, yahooSymbol(symbol, assetType))
}

// Fetch many quotes; skips (and logs) any that fail so one bad symbol can't sink the batch.
export async function getQuotes(
  items: { symbol: string; assetType: AssetTypeLike; providerId?: string | null }[]
): Promise<Quote[]> {
  const results = await Promise.all(items.map((i) => getQuote(i.symbol, i.assetType, i.providerId)))
  return results.filter((q): q is Quote => q !== null)
}

// ─── Crypto discovery (picker beyond the top 10) ─────────────────────

export interface CryptoCoin {
  id: string // CoinGecko id
  symbol: string
  name: string
  rank: number | null
  thumb: string
}

const TOP_COINS_TTL = 6 * 60 * 60 * 1000
let topCoins: { at: number; coins: CryptoCoin[] } | null = null

// Top 100 coins by market cap (cached 6h — CoinGecko's free tier is rate limited).
export async function getTopCryptos(): Promise<CryptoCoin[]> {
  if (topCoins && Date.now() - topCoins.at < TOP_COINS_TTL) return topCoins.coins
  try {
    const { data } = await axios.get(`${COINGECKO_BASE}/coins/markets`, {
      params: { vs_currency: 'usd', order: 'market_cap_desc', per_page: 100, page: 1 },
      timeout: 10000,
    })
    const coins: CryptoCoin[] = (Array.isArray(data) ? data : []).map((c: any) => ({
      id: c.id,
      symbol: String(c.symbol || '').toUpperCase(),
      name: c.name,
      rank: c.market_cap_rank ?? null,
      thumb: c.image || '',
    }))
    if (coins.length) topCoins = { at: Date.now(), coins }
    return coins
  } catch (err) {
    console.error('[prices] coingecko markets failed:', String(err))
    return topCoins?.coins ?? []
  }
}

const SEARCH_TTL = 60 * 60 * 1000
const searchCache = new Map<string, { at: number; coins: CryptoCoin[] }>()

// Search every coin CoinGecko lists by name or ticker (cached per query for 1h).
export async function searchCryptos(query: string): Promise<CryptoCoin[]> {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const hit = searchCache.get(q)
  if (hit && Date.now() - hit.at < SEARCH_TTL) return hit.coins
  try {
    const { data } = await axios.get(`${COINGECKO_BASE}/search`, { params: { query: q }, timeout: 8000 })
    const coins: CryptoCoin[] = (data?.coins || []).slice(0, 25).map((c: any) => ({
      id: c.id,
      symbol: String(c.symbol || '').toUpperCase(),
      name: c.name,
      rank: c.market_cap_rank ?? null,
      thumb: c.thumb || '',
    }))
    searchCache.set(q, { at: Date.now(), coins })
    if (searchCache.size > 500) searchCache.delete(searchCache.keys().next().value as string)
    return coins
  } catch (err) {
    console.error(`[prices] coingecko search failed for "${q}":`, String(err))
    return []
  }
}

// ─── Historical daily prices (net-worth history, performance, digests) ──

export interface HistPoint {
  date: string // YYYY-MM-DD
  price: number
}

// One year of daily history per series, fetched at most once per UTC day. Both
// raw closes (valuation) and dividend-adjusted closes (total return) are kept.
interface HistSeries {
  close: HistPoint[]
  adjusted: HistPoint[]
}
const historyCache = new Map<string, { day: string; series: HistSeries }>()

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10)
}

// Crypto history via CoinGecko market_chart (free, daily granularity up to ~365d).
// Crypto has no dividends, so adjusted == close.
async function fetchCryptoHistory(id: string): Promise<HistSeries | null> {
  try {
    const { data } = await axios.get(`${COINGECKO_BASE}/coins/${encodeURIComponent(id)}/market_chart`, {
      params: { vs_currency: 'usd', days: 365, interval: 'daily' },
      timeout: 12000,
    })
    const prices: [number, number][] = data?.prices || []
    // Collapse to one point per day (the final "now" point can share a date).
    const byDay = new Map<string, number>()
    for (const [ts, price] of prices) byDay.set(new Date(ts).toISOString().slice(0, 10), price)
    const close = [...byDay.entries()].map(([date, price]) => ({ date, price }))
    return { close, adjusted: close }
  } catch (err) {
    console.error(`[prices] coingecko history failed for ${id}:`, String(err))
    return null
  }
}

// Stock/ETF/metal daily history via Yahoo Finance's chart endpoint (no key).
async function fetchYahooHistory(querySymbol: string): Promise<HistSeries | null> {
  try {
    const { data } = await axios.get(`${YAHOO_BASE}/${encodeURIComponent(querySymbol)}`, {
      params: { range: '1y', interval: '1d' },
      headers: YAHOO_HEADERS,
      timeout: 12000,
    })
    const result = data?.chart?.result?.[0]
    const ts: number[] = result?.timestamp || []
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close || []
    const adj: (number | null)[] = result?.indicators?.adjclose?.[0]?.adjclose || []
    const close: HistPoint[] = []
    const adjusted: HistPoint[] = []
    for (let i = 0; i < ts.length; i++) {
      const date = new Date(ts[i] * 1000).toISOString().slice(0, 10)
      const c = closes[i]
      if (typeof c === 'number') close.push({ date, price: c })
      const a = typeof adj[i] === 'number' ? adj[i] : c
      if (typeof a === 'number') adjusted.push({ date, price: a })
    }
    return { close, adjusted }
  } catch (err) {
    console.error(`[prices] yahoo history failed for ${querySymbol}:`, String(err))
    return null
  }
}

async function loadHistory(symbol: string, assetType: AssetTypeLike, providerId?: string | null): Promise<HistSeries> {
  const key = assetType === 'CRYPTO' ? `crypto:${cryptoId(symbol, providerId)}` : `yahoo:${yahooSymbol(symbol, assetType)}`
  const today = utcDay()
  const hit = historyCache.get(key)
  if (hit && hit.day === today) return hit.series

  const series =
    assetType === 'CRYPTO'
      ? await fetchCryptoHistory(cryptoId(symbol, providerId))
      : await fetchYahooHistory(yahooSymbol(symbol, assetType))
  if (!series) return hit?.series ?? { close: [], adjusted: [] } // serve stale on failure
  historyCache.set(key, { day: today, series })
  return series
}

// Daily prices for the last `days` calendar days (max ~1 year). `adjusted`
// returns dividend-adjusted closes for total-return math.
export async function getHistory(
  symbol: string,
  assetType: AssetTypeLike,
  days: number,
  opts: { providerId?: string | null; adjusted?: boolean } = {}
): Promise<HistPoint[]> {
  const series = await loadHistory(symbol, assetType, opts.providerId)
  const cutoff = utcDay(new Date(Date.now() - days * DAY))
  return (opts.adjusted ? series.adjusted : series.close).filter((p) => p.date >= cutoff)
}

// Run async tasks with bounded concurrency (keeps provider rate limits happy).
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

import axios from 'axios'

export type AssetTypeLike = 'STOCK' | 'ETF' | 'CRYPTO' | 'MUTUAL_FUND' | 'OTHER'

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

// Top crypto tickers → CoinGecko coin ids. Holdings store the ticker (e.g. BTC);
// the provider translates it here. Unknown tickers fall back to the lowercased
// symbol as the id (which works for many coins).
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

// Stocks/ETFs via Yahoo Finance's public chart endpoint (no API key). The `meta`
// block carries the latest price and the previous close directly.
async function fetchStockQuote(symbol: string): Promise<Quote | null> {
  try {
    // range=1d so chartPreviousClose is the PRIOR trading day's close (true 24h /
    // daily change). A wider range makes it the close before the whole window.
    const { data } = await axios.get(`${YAHOO_BASE}/${encodeURIComponent(symbol.toUpperCase())}`, {
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
    console.error(`[prices] yahoo quote failed for ${symbol}:`, String(err))
    return null
  }
}

// CoinGecko keys prices by internal coin id; we translate the ticker via CRYPTO_IDS.
// include_24hr_change lets us derive the previous close from the current price.
async function fetchCryptoQuote(symbol: string): Promise<Quote | null> {
  const id = CRYPTO_IDS[symbol.toUpperCase()] || symbol.toLowerCase()
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
export async function getQuote(symbol: string, assetType: AssetTypeLike): Promise<Quote | null> {
  if (assetType === 'CRYPTO') return fetchCryptoQuote(symbol)
  return fetchStockQuote(symbol)
}

// Fetch many quotes; skips (and logs) any that fail so one bad symbol can't sink the batch.
export async function getQuotes(
  items: { symbol: string; assetType: AssetTypeLike }[]
): Promise<Quote[]> {
  const results = await Promise.all(items.map((i) => getQuote(i.symbol, i.assetType)))
  return results.filter((q): q is Quote => q !== null)
}

// ─── Historical daily prices (for reconstructing net-worth history) ──

export interface HistPoint {
  date: string // YYYY-MM-DD
  price: number
}

// Crypto history via CoinGecko market_chart (free, daily granularity up to ~365d).
async function fetchCryptoHistory(symbol: string, days: number): Promise<HistPoint[]> {
  const id = CRYPTO_IDS[symbol.toUpperCase()] || symbol.toLowerCase()
  try {
    const { data } = await axios.get(`${COINGECKO_BASE}/coins/${id}/market_chart`, {
      params: { vs_currency: 'usd', days, interval: 'daily' },
      timeout: 12000,
    })
    const prices: [number, number][] = data?.prices || []
    return prices.map(([ts, price]) => ({ date: new Date(ts).toISOString().slice(0, 10), price }))
  } catch (err) {
    console.error(`[prices] coingecko history failed for ${symbol}:`, String(err))
    return []
  }
}

// Stock/ETF daily history via Yahoo Finance's chart endpoint (no key).
async function fetchStockHistory(symbol: string, days: number): Promise<HistPoint[]> {
  try {
    const { data } = await axios.get(`${YAHOO_BASE}/${encodeURIComponent(symbol.toUpperCase())}`, {
      params: { range: '1y', interval: '1d' },
      headers: YAHOO_HEADERS,
      timeout: 12000,
    })
    const result = data?.chart?.result?.[0]
    const ts: number[] = result?.timestamp || []
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close || []
    const out: HistPoint[] = []
    for (let i = 0; i < ts.length; i++) {
      const price = closes[i]
      if (typeof price === 'number') {
        out.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), price })
      }
    }
    return out.slice(-days)
  } catch (err) {
    console.error(`[prices] yahoo history failed for ${symbol}:`, String(err))
    return []
  }
}

export async function getHistory(
  symbol: string,
  assetType: AssetTypeLike,
  days: number
): Promise<HistPoint[]> {
  if (assetType === 'CRYPTO') return fetchCryptoHistory(symbol, days)
  return fetchStockHistory(symbol, days)
}

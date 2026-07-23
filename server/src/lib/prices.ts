import axios from 'axios'

export type AssetTypeLike = 'STOCK' | 'ETF' | 'CRYPTO' | 'MUTUAL_FUND' | 'OTHER'

export interface Quote {
  symbol: string
  price: number
  currency: string
}

const FINNHUB_KEY = process.env.FINNHUB_API_KEY
const COINGECKO_BASE = process.env.COINGECKO_API_BASE || 'https://api.coingecko.com/api/v3'

// Finnhub covers US stocks/ETFs. Returns null if no key configured or symbol unknown.
async function fetchStockQuote(symbol: string): Promise<Quote | null> {
  if (!FINNHUB_KEY) return null
  try {
    const { data } = await axios.get('https://finnhub.io/api/v1/quote', {
      params: { symbol: symbol.toUpperCase(), token: FINNHUB_KEY },
      timeout: 8000,
    })
    // `c` is the current price; Finnhub returns 0 for unknown symbols.
    if (typeof data?.c === 'number' && data.c > 0) {
      return { symbol: symbol.toUpperCase(), price: data.c, currency: 'USD' }
    }
    return null
  } catch (err) {
    console.error(`[prices] finnhub failed for ${symbol}:`, String(err))
    return null
  }
}

// CoinGecko's public API keys prices by their internal coin id (e.g. "bitcoin"),
// so callers pass the coin id as the holding symbol for crypto.
async function fetchCryptoQuote(coinId: string): Promise<Quote | null> {
  try {
    const { data } = await axios.get(`${COINGECKO_BASE}/simple/price`, {
      params: { ids: coinId.toLowerCase(), vs_currencies: 'usd' },
      timeout: 8000,
    })
    const price = data?.[coinId.toLowerCase()]?.usd
    if (typeof price === 'number' && price > 0) {
      return { symbol: coinId.toLowerCase(), price, currency: 'USD' }
    }
    return null
  } catch (err) {
    console.error(`[prices] coingecko failed for ${coinId}:`, String(err))
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

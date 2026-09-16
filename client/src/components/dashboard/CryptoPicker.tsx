import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import { inputStyle } from '../ui/styles'

export interface CryptoCoin {
  id: string
  symbol: string
  name: string
  rank: number | null
  thumb: string
}

// Ticker field with a dropdown that browses the top 100 coins and searches every
// coin CoinGecko lists. Picking a coin pins its exact CoinGecko id so tickers
// shared by several coins price correctly.
export default function CryptoPicker({
  value,
  providerId,
  onType,
  onPick,
}: {
  value: string
  providerId: string | null
  onType: (text: string) => void
  onPick: (coin: CryptoCoin) => void
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [debounced, setDebounced] = useState(value)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), 350)
    return () => clearTimeout(t)
  }, [value])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const topQ = useQuery<{ coins: CryptoCoin[] }>({
    queryKey: ['crypto', 'top'],
    queryFn: async () => (await api.get('/prices/crypto/top')).data,
    staleTime: 6 * 60 * 60 * 1000,
    enabled: open,
  })
  const q = value.trim().toLowerCase()
  const localHits = useMemo(() => {
    const top = topQ.data?.coins ?? []
    if (!q) return top
    return top.filter((c) => c.symbol.toLowerCase().startsWith(q) || c.name.toLowerCase().includes(q))
  }, [topQ.data, q])

  // Only hit the search API when the top 100 doesn't have an exact ticker match.
  const needSearch = open && debounced.length >= 2 && !localHits.some((c) => c.symbol.toLowerCase() === debounced.toLowerCase())
  const searchQ = useQuery<{ coins: CryptoCoin[] }>({
    queryKey: ['crypto', 'search', debounced.toLowerCase()],
    queryFn: async () => (await api.get('/prices/crypto/search', { params: { q: debounced } })).data,
    staleTime: 60 * 60 * 1000,
    enabled: needSearch,
  })

  const results = useMemo(() => {
    const seen = new Set<string>()
    const out: CryptoCoin[] = []
    for (const c of [...localHits, ...(needSearch ? searchQ.data?.coins ?? [] : [])]) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      out.push(c)
    }
    return out.slice(0, 40)
  }, [localHits, searchQ.data, needSearch])

  function pick(c: CryptoCoin) {
    onPick(c)
    setOpen(false)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={(e) => {
          onType(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open) return
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(results.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault()
            pick(results[active])
          } else if (e.key === 'Escape') setOpen(false)
        }}
        placeholder="Search e.g. BTC, Pepe"
        aria-label="Crypto ticker"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        style={{ ...inputStyle, fontWeight: 600, textTransform: value ? 'uppercase' : 'none' }}
      />
      {providerId && !open && <div style={{ position: 'absolute', right: 10, top: 13, fontSize: 10, color: '#22E38A', fontWeight: 700 }}>✓</div>}
      {open && (
        <div
          role="listbox"
          style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', left: 0, width: 'min(320px, 80vw)', maxHeight: 280, overflowY: 'auto', background: '#1C1F27', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.5)', padding: 4 }}
        >
          {!q && <div style={{ fontSize: 11, color: '#8A90A2', padding: '6px 8px', fontWeight: 700, letterSpacing: 0.5 }}>TOP 100 BY MARKET CAP</div>}
          {results.map((c, i) => (
            <div
              key={c.id}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(c)
              }}
              onMouseEnter={() => setActive(i)}
              style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', background: i === active ? 'rgba(34,227,138,0.1)' : 'transparent' }}
            >
              {c.thumb ? <img src={c.thumb} alt="" width={20} height={20} style={{ borderRadius: '50%', flexShrink: 0 }} /> : <span style={{ width: 20 }} />}
              <span style={{ fontWeight: 700, fontSize: 13 }}>{c.symbol}</span>
              <span style={{ fontSize: 13, color: '#C9CDD8', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              {c.rank != null && <span style={{ fontSize: 11, color: '#8A90A2' }}>#{c.rank}</span>}
            </div>
          ))}
          {(topQ.isLoading || (needSearch && searchQ.isFetching)) && <div style={{ fontSize: 12, color: '#8A90A2', padding: '8px' }}>Searching…</div>}
          {!topQ.isLoading && !searchQ.isFetching && results.length === 0 && (
            <div style={{ fontSize: 12, color: '#8A90A2', padding: '8px' }}>{q.length < 2 ? 'Type to search every coin.' : 'No coins found — you can still enter the ticker manually.'}</div>
          )}
        </div>
      )}
    </div>
  )
}

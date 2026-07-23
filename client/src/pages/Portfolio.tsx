import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import api from '../lib/api'
import { formatCurrency, formatDate } from '../lib/format'
import Spinner from '../components/ui/Spinner'

interface Account {
  id: string
  name: string
  isInvestment: boolean
  currency: string
}
interface Holding {
  id: string
  symbol: string
  assetType: string
  quantity: number
  costBasis: number | null
  price: number | null
  priceAsOf: string | null
  marketValue: number | null
  gain: number | null
}

const ASSET_TYPES = ['STOCK', 'ETF', 'CRYPTO', 'MUTUAL_FUND', 'OTHER']

export default function Portfolio() {
  const accounts = useQuery<{ accounts: Account[] }>({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get('/accounts')).data,
  })

  if (accounts.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  const investmentAccounts = (accounts.data?.accounts ?? []).filter((a) => a.isInvestment)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <p className="text-sm text-slate-500">
          Holdings inside your investment accounts, valued from live market prices.
        </p>
      </div>

      {investmentAccounts.length === 0 ? (
        <p className="rounded-2xl bg-white py-10 text-center text-sm text-slate-400 ring-1 ring-slate-200">
          No investment accounts yet. Create one on the Accounts page (check “Investment account”).
        </p>
      ) : (
        investmentAccounts.map((a) => <AccountHoldings key={a.id} account={a} />)
      )}
    </div>
  )
}

function AccountHoldings({ account }: { account: Account }) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)

  const holdings = useQuery<{ holdings: Holding[] }>({
    queryKey: ['holdings', account.id],
    queryFn: async () => (await api.get(`/holdings/${account.id}`)).data,
  })

  const add = useMutation({
    mutationFn: async (body: Record<string, unknown>) =>
      (await api.post(`/holdings/${account.id}`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holdings', account.id] })
      qc.invalidateQueries({ queryKey: ['networth'] })
      setAdding(false)
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/holdings/entry/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['holdings', account.id] })
      qc.invalidateQueries({ queryKey: ['networth'] })
    },
  })

  const list = holdings.data?.holdings ?? []
  const total = list.reduce((s, h) => s + (h.marketValue ?? 0), 0)

  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold">{account.name}</h2>
          <div className="text-sm text-slate-500">{formatCurrency(total, account.currency)}</div>
        </div>
        <button
          onClick={() => setAdding((s) => !s)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      {adding && <HoldingForm onSubmit={(b) => add.mutate(b)} pending={add.isPending} />}

      {holdings.isLoading ? (
        <div className="py-6 text-center">
          <Spinner />
        </div>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">No holdings in this account yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 font-medium">Symbol</th>
                <th className="py-2 font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Price</th>
                <th className="py-2 text-right font-medium">Value</th>
                <th className="py-2 text-right font-medium">Gain</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {list.map((h) => (
                <tr key={h.id}>
                  <td className="py-2.5">
                    <div className="font-medium">{h.symbol.toUpperCase()}</div>
                    <div className="text-xs text-slate-400">{h.assetType.toLowerCase()}</div>
                  </td>
                  <td className="py-2.5">{h.quantity}</td>
                  <td className="py-2.5 text-right">
                    {h.price != null ? (
                      <>
                        {formatCurrency(h.price)}
                        {h.priceAsOf && (
                          <div className="text-xs text-slate-400">{formatDate(h.priceAsOf)}</div>
                        )}
                      </>
                    ) : (
                      <span className="text-slate-400">no quote</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right font-medium">
                    {h.marketValue != null ? formatCurrency(h.marketValue) : '—'}
                  </td>
                  <td
                    className={`py-2.5 text-right ${
                      h.gain == null
                        ? 'text-slate-400'
                        : h.gain >= 0
                          ? 'text-emerald-600'
                          : 'text-red-500'
                    }`}
                  >
                    {h.gain != null
                      ? `${h.gain >= 0 ? '+' : ''}${formatCurrency(h.gain)}`
                      : '—'}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => remove.mutate(h.id)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function HoldingForm({
  onSubmit,
  pending,
}: {
  onSubmit: (body: Record<string, unknown>) => void
  pending: boolean
}) {
  const [symbol, setSymbol] = useState('')
  const [assetType, setAssetType] = useState('STOCK')
  const [quantity, setQuantity] = useState('')
  const [costBasis, setCostBasis] = useState('')

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          symbol,
          assetType,
          quantity: Number(quantity),
          costBasis: costBasis ? Number(costBasis) : undefined,
        })
      }}
      className="mb-4 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3"
    >
      <input
        required
        placeholder={assetType === 'CRYPTO' ? 'coin id (e.g. bitcoin)' : 'Symbol (e.g. AAPL)'}
        value={symbol}
        onChange={(e) => setSymbol(e.target.value)}
        className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
      />
      <select
        value={assetType}
        onChange={(e) => setAssetType(e.target.value)}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
      >
        {ASSET_TYPES.map((t) => (
          <option key={t} value={t}>
            {t.toLowerCase()}
          </option>
        ))}
      </select>
      <input
        required
        type="number"
        step="any"
        placeholder="Quantity"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
      />
      <input
        type="number"
        step="0.01"
        placeholder="Cost basis (opt)"
        value={costBasis}
        onChange={(e) => setCostBasis(e.target.value)}
        className="w-32 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {pending ? 'Adding…' : 'Add holding'}
      </button>
    </form>
  )
}

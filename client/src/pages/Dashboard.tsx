import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { TrendingUp, TrendingDown, RefreshCw } from 'lucide-react'
import api from '../lib/api'
import { formatCurrency, formatCompact, formatDate } from '../lib/format'
import Spinner from '../components/ui/Spinner'

interface AccountValue {
  accountId: string
  name: string
  kind: 'ASSET' | 'LIABILITY'
  category: string
  value: number
}
interface Current {
  totalAssets: number
  totalLiabilities: number
  netWorth: number
  accounts: AccountValue[]
}
interface HistoryPoint {
  date: string
  totalAssets: number
  totalLiabilities: number
  netWorth: number
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <div className="text-sm text-slate-500">{label}</div>
      <div
        className={`mt-1 text-2xl font-bold ${
          tone === 'up' ? 'text-emerald-600' : tone === 'down' ? 'text-red-500' : 'text-slate-900'
        }`}
      >
        {value}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const qc = useQueryClient()

  const current = useQuery<Current>({
    queryKey: ['networth', 'current'],
    queryFn: async () => (await api.get('/networth/current')).data,
  })
  const history = useQuery<{ history: HistoryPoint[] }>({
    queryKey: ['networth', 'history'],
    queryFn: async () => (await api.get('/networth/history?days=365')).data,
  })

  const snapshot = useMutation({
    mutationFn: async () => (await api.post('/networth/snapshot')).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['networth'] })
    },
  })

  if (current.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  const nw = current.data
  const points = history.data?.history ?? []
  const chartData = points.map((p) => ({ ...p, label: formatDate(p.date) }))

  const first = points[0]?.netWorth
  const last = points[points.length - 1]?.netWorth ?? nw?.netWorth ?? 0
  const change = first != null ? last - first : 0

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Net worth</h1>
          <p className="text-sm text-slate-500">Your assets minus liabilities, tracked over time.</p>
        </div>
        <button
          onClick={() => snapshot.mutate()}
          disabled={snapshot.isPending}
          className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${snapshot.isPending ? 'animate-spin' : ''}`} />
          Recalculate
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Net worth" value={formatCurrency(nw?.netWorth ?? 0)} />
        <StatCard label="Total assets" value={formatCurrency(nw?.totalAssets ?? 0)} tone="up" />
        <StatCard
          label="Total liabilities"
          value={formatCurrency(nw?.totalLiabilities ?? 0)}
          tone="down"
        />
      </div>

      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Trend</h2>
          {first != null && (
            <span
              className={`flex items-center gap-1 text-sm font-medium ${
                change >= 0 ? 'text-emerald-600' : 'text-red-500'
              }`}
            >
              {change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {formatCurrency(Math.abs(change))} over {points.length} snapshots
            </span>
          )}
        </div>

        {chartData.length < 2 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            Not enough history yet — snapshots accumulate daily. Add accounts and check back.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ left: 4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#94a3b8' }} minTickGap={40} />
              <YAxis
                tick={{ fontSize: 12, fill: '#94a3b8' }}
                tickFormatter={(v) => formatCompact(Number(v))}
                width={56}
              />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Area
                type="monotone"
                dataKey="netWorth"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#nw)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="mb-4 font-semibold">Breakdown by account</h2>
        {nw && nw.accounts.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {nw.accounts.map((a) => (
              <div key={a.accountId} className="flex items-center justify-between py-2.5">
                <div>
                  <div className="text-sm font-medium">{a.name}</div>
                  <div className="text-xs text-slate-400">{a.category.replace('_', ' ')}</div>
                </div>
                <div
                  className={`text-sm font-semibold ${
                    a.kind === 'LIABILITY' ? 'text-red-500' : 'text-slate-900'
                  }`}
                >
                  {a.kind === 'LIABILITY' ? '−' : ''}
                  {formatCurrency(a.value)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-slate-400">
            No accounts yet. Add one on the Accounts page.
          </p>
        )}
      </div>
    </div>
  )
}

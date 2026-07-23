import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts'
import { Flame, RefreshCw } from 'lucide-react'
import api from '../lib/api'
import { formatCurrency, formatCompact } from '../lib/format'
import Spinner from '../components/ui/Spinner'

interface Plan {
  currentAge: number
  retirementAge: number
  currentSavings: number
  annualContribution: number
  annualExpenses: number
  expectedReturnPct: number
  inflationPct: number
  withdrawalRatePct: number
}
interface Projection {
  fireNumber: number
  realReturnPct: number
  fireAge: number | null
  yearsToFire: number | null
  balanceAtRetirement: number
  onTrack: boolean
  projection: { age: number; year: number; balance: number }[]
}

const FIELDS: { key: keyof Plan; label: string; suffix?: string; step?: string }[] = [
  { key: 'currentAge', label: 'Current age' },
  { key: 'retirementAge', label: 'Target retirement age' },
  { key: 'currentSavings', label: 'Current savings', suffix: '$' },
  { key: 'annualContribution', label: 'Annual contribution', suffix: '$' },
  { key: 'annualExpenses', label: 'Annual expenses in retirement', suffix: '$' },
  { key: 'expectedReturnPct', label: 'Expected return', suffix: '%', step: '0.1' },
  { key: 'inflationPct', label: 'Inflation', suffix: '%', step: '0.1' },
  { key: 'withdrawalRatePct', label: 'Safe withdrawal rate', suffix: '%', step: '0.1' },
]

export default function Retirement() {
  const qc = useQueryClient()
  const [form, setForm] = useState<Plan | null>(null)

  const query = useQuery<{ plan: Plan; projection: Projection }>({
    queryKey: ['retirement'],
    queryFn: async () => (await api.get('/retirement')).data,
  })

  useEffect(() => {
    if (query.data?.plan && !form) setForm(query.data.plan)
  }, [query.data, form])

  const save = useMutation({
    mutationFn: async (body: Plan) => (await api.put('/retirement', body)).data,
    onSuccess: (data) => {
      qc.setQueryData(['retirement'], data)
    },
  })

  const sync = useMutation({
    mutationFn: async () => (await api.post('/retirement/sync-savings')).data,
    onSuccess: (data) => {
      qc.setQueryData(['retirement'], data)
      setForm(data.plan)
    },
  })

  if (query.isLoading || !form) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  const projection = query.data?.projection
  const chartData = projection?.projection ?? []

  function update(key: keyof Plan, value: string) {
    setForm((f) => (f ? { ...f, [key]: Number(value) } : f))
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Early retirement (FIRE)</h1>
        <p className="text-sm text-slate-500">
          When does your portfolio cover your expenses forever? Projection is in today's dollars.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_1fr]">
        {/* Inputs */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (form) save.mutate(form)
          }}
          className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200"
        >
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs font-medium text-slate-500">{f.label}</span>
              <div className="mt-1 flex items-center rounded-lg border border-slate-300 focus-within:border-emerald-500">
                {f.suffix === '$' && <span className="pl-3 text-sm text-slate-400">$</span>}
                <input
                  type="number"
                  step={f.step || '1'}
                  value={form[f.key]}
                  onChange={(e) => update(f.key, e.target.value)}
                  className="w-full bg-transparent px-3 py-2 text-sm outline-none"
                />
                {f.suffix === '%' && <span className="pr-3 text-sm text-slate-400">%</span>}
              </div>
            </label>
          ))}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={save.isPending}
              className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {save.isPending ? 'Calculating…' : 'Recalculate'}
            </button>
            <button
              type="button"
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
              title="Set current savings from your live net worth"
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${sync.isPending ? 'animate-spin' : ''}`} />
              Sync
            </button>
          </div>
        </form>

        {/* Results */}
        <div className="space-y-4">
          {projection && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 text-white">
                <div className="flex items-center gap-1.5 text-sm text-emerald-50">
                  <Flame className="h-4 w-4" /> FIRE number
                </div>
                <div className="mt-1 text-2xl font-bold">
                  {formatCompact(projection.fireNumber)}
                </div>
                <div className="mt-1 text-xs text-emerald-50">
                  {formatCurrency(projection.fireNumber)}
                </div>
              </div>
              <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm text-slate-500">Financially independent at</div>
                <div className="mt-1 text-2xl font-bold">
                  {projection.fireAge != null ? `Age ${projection.fireAge}` : 'Not reached'}
                </div>
                {projection.yearsToFire != null && (
                  <div className="mt-1 text-xs text-slate-400">
                    in {projection.yearsToFire} years
                  </div>
                )}
              </div>
              <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
                <div className="text-sm text-slate-500">At target age</div>
                <div
                  className={`mt-1 text-2xl font-bold ${
                    projection.onTrack ? 'text-emerald-600' : 'text-amber-500'
                  }`}
                >
                  {formatCompact(projection.balanceAtRetirement)}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {projection.onTrack ? 'On track ✓' : 'Short of goal'}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="mb-4 font-semibold">Projected portfolio (today's dollars)</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ left: 4, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="age"
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  tickFormatter={(v) => `${v}`}
                  minTickGap={30}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  tickFormatter={(v) => formatCompact(Number(v))}
                  width={56}
                />
                <Tooltip
                  formatter={(v) => formatCurrency(Number(v))}
                  labelFormatter={(l) => `Age ${l}`}
                />
                {projection && (
                  <ReferenceLine
                    y={projection.fireNumber}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    label={{ value: 'FIRE', fontSize: 11, fill: '#10b981', position: 'right' }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="balance"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

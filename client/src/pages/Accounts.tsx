import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil } from 'lucide-react'
import api from '../lib/api'
import { formatCurrency, formatDate } from '../lib/format'
import Spinner from '../components/ui/Spinner'

interface Balance {
  id: string
  amount: number
  date: string
}
interface Account {
  id: string
  name: string
  kind: 'ASSET' | 'LIABILITY'
  category: string
  institution: string | null
  currency: string
  isInvestment: boolean
  includeInNetWorth: boolean
  balances: Balance[]
  _count: { holdings: number }
}

const CATEGORIES = [
  'CASH',
  'INVESTMENT',
  'RETIREMENT',
  'REAL_ESTATE',
  'CRYPTO',
  'VEHICLE',
  'LOAN',
  'CREDIT_CARD',
  'MORTGAGE',
  'OTHER',
]

const LIABILITY_CATS = new Set(['LOAN', 'CREDIT_CARD', 'MORTGAGE'])

export default function Accounts() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  const accounts = useQuery<{ accounts: Account[] }>({
    queryKey: ['accounts'],
    queryFn: async () => (await api.get('/accounts')).data,
  })

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await api.post('/accounts', body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['networth'] })
      setShowForm(false)
    },
  })

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/accounts/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['networth'] })
    },
  })

  const updateBalance = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) =>
      (await api.post(`/balances/${id}`, { amount })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      qc.invalidateQueries({ queryKey: ['networth'] })
    },
  })

  if (accounts.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  const list = accounts.data?.accounts ?? []

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Accounts</h1>
          <p className="text-sm text-slate-500">
            Assets and liabilities. Investment accounts hold securities — manage those on Portfolio.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          Add account
        </button>
      </div>

      {showForm && <AccountForm onSubmit={(b) => create.mutate(b)} pending={create.isPending} />}

      <div className="space-y-3">
        {list.length === 0 && (
          <p className="rounded-2xl bg-white py-10 text-center text-sm text-slate-400 ring-1 ring-slate-200">
            No accounts yet. Add your first one above.
          </p>
        )}

        {list.map((a) => (
          <AccountRow
            key={a.id}
            account={a}
            onDelete={() => remove.mutate(a.id)}
            onUpdateBalance={(amount) => updateBalance.mutate({ id: a.id, amount })}
          />
        ))}
      </div>
    </div>
  )
}

function AccountRow({
  account,
  onDelete,
  onUpdateBalance,
}: {
  account: Account
  onDelete: () => void
  onUpdateBalance: (amount: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(String(account.balances[0]?.amount ?? ''))
  const latest = account.balances[0]

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{account.name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                account.kind === 'LIABILITY'
                  ? 'bg-red-50 text-red-600'
                  : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {account.category.replace('_', ' ').toLowerCase()}
            </span>
            {account.isInvestment && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">
                {account._count.holdings} holdings
              </span>
            )}
          </div>
          {account.institution && (
            <div className="mt-0.5 text-xs text-slate-400">{account.institution}</div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {!account.isInvestment && (
            <div className="text-right">
              <div className="font-semibold">
                {latest ? formatCurrency(latest.amount, account.currency) : '—'}
              </div>
              {latest && (
                <div className="text-xs text-slate-400">as of {formatDate(latest.date)}</div>
              )}
            </div>
          )}
          {!account.isInvestment && (
            <button
              onClick={() => setEditing((e) => !e)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Update balance"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onDelete}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
            title="Delete account"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {editing && !account.isInvestment && (
        <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="New balance"
            className="w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => {
              if (amount) {
                onUpdateBalance(Number(amount))
                setEditing(false)
              }
            }}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Save
          </button>
        </div>
      )}
    </div>
  )
}

function AccountForm({
  onSubmit,
  pending,
}: {
  onSubmit: (body: Record<string, unknown>) => void
  pending: boolean
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('CASH')
  const [institution, setInstitution] = useState('')
  const [openingBalance, setOpeningBalance] = useState('')
  const [isInvestment, setIsInvestment] = useState(false)

  const kind = LIABILITY_CATS.has(category) ? 'LIABILITY' : 'ASSET'

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({
          name,
          category,
          kind,
          institution: institution || undefined,
          isInvestment,
          openingBalance: openingBalance ? Number(openingBalance) : undefined,
        })
      }}
      className="grid grid-cols-1 gap-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:grid-cols-2"
    >
      <input
        required
        placeholder="Account name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {c.replace('_', ' ').toLowerCase()}
          </option>
        ))}
      </select>
      <input
        placeholder="Institution (optional)"
        value={institution}
        onChange={(e) => setInstitution(e.target.value)}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
      />
      <input
        type="number"
        step="0.01"
        placeholder={isInvestment ? 'Value comes from holdings' : 'Opening balance'}
        value={openingBalance}
        onChange={(e) => setOpeningBalance(e.target.value)}
        disabled={isInvestment}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-400"
      />
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={isInvestment}
          onChange={(e) => setIsInvestment(e.target.checked)}
          className="h-4 w-4 accent-emerald-600"
        />
        Investment account (tracks holdings & live prices)
      </label>
      <div className="flex justify-end sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Create account'}
        </button>
      </div>
    </form>
  )
}

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import api from '../lib/api'
import { clearAuth } from '../lib/auth'
import Spinner from '../components/ui/Spinner'

interface ProfileData {
  id: string
  email: string
  baseCurrency: string
  createdAt: string
  profile: { firstName: string; lastName: string } | null
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'INR']

export default function Profile() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [baseCurrency, setBaseCurrency] = useState('USD')
  const [saved, setSaved] = useState(false)

  const query = useQuery<{ profile: ProfileData }>({
    queryKey: ['profile'],
    queryFn: async () => (await api.get('/profile')).data,
  })

  useEffect(() => {
    const p = query.data?.profile
    if (p) {
      setFirstName(p.profile?.firstName ?? '')
      setLastName(p.profile?.lastName ?? '')
      setBaseCurrency(p.baseCurrency)
    }
  }, [query.data])

  const save = useMutation({
    mutationFn: async () =>
      (await api.patch('/profile', { firstName, lastName, baseCurrency })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    )
  }

  const p = query.data?.profile

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Profile</h1>

      <div className="space-y-4 rounded-2xl bg-white p-6 ring-1 ring-slate-200">
        <div>
          <span className="text-xs font-medium text-slate-500">Email</span>
          <div className="mt-1 text-sm">{p?.email}</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-slate-500">First name</span>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Last name</span>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-slate-500">Reporting currency</span>
          <select
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
          {saved && <span className="text-sm text-emerald-600">Saved ✓</span>}
        </div>
      </div>

      <button
        onClick={() => {
          clearAuth()
          navigate('/login')
        }}
        className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
      >
        <LogOut className="h-4 w-4" />
        Log out
      </button>
    </div>
  )
}

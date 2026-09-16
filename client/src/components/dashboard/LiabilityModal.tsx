import { useState } from 'react'
import { LIABILITY_TYPES, liabilityColor, fmtUSD, CAT_LABEL } from '../../lib/portfolio'
import type { Liability, LiabilityType, Holding } from '../../lib/portfolio'
import { simulatePayoff, monthsLabel } from '../../lib/debts'
import MoneyInput from './MoneyInput'
import { inputStyle, labelStyle, primaryBtn, dangerBtn, modalBackdrop, modalCard, closeBtn } from '../ui/styles'

export interface LiabilityPayload {
  name: string
  type: LiabilityType
  institution: string
  balance: number
  interestRatePct: number
  minPayment: number
  holdingId: string | null
}

const PLACEHOLDER: Record<LiabilityType, string> = {
  MORTGAGE: 'e.g. Home mortgage',
  HELOC: 'e.g. Home equity line',
  AUTO_LOAN: 'e.g. Car loan',
  STUDENT_LOAN: 'e.g. Federal student loans',
  CREDIT_CARD: 'e.g. Chase Sapphire',
  PERSONAL_LOAN: 'e.g. SoFi personal loan',
  MEDICAL: 'e.g. Hospital bill',
  OTHER: 'e.g. Family loan',
}

export default function LiabilityModal({
  editing,
  securable,
  saving,
  error,
  onClose,
  onSave,
  onDelete,
}: {
  editing: Liability | null
  securable: Holding[] // real estate & vehicles a debt can be secured by
  saving?: boolean
  error?: string
  onClose: () => void
  onSave: (p: LiabilityPayload) => void
  onDelete: (l: Liability) => void
}) {
  const [type, setType] = useState<LiabilityType>(editing?.type ?? 'CREDIT_CARD')
  const [name, setName] = useState(editing?.name ?? '')
  const [institution, setInstitution] = useState(editing?.institution ?? '')
  const [balance, setBalance] = useState(editing ? String(editing.balance) : '')
  const [rate, setRate] = useState(editing ? String(editing.interestRatePct) : '')
  const [payment, setPayment] = useState(editing ? String(editing.minPayment) : '')
  const [holdingId, setHoldingId] = useState(editing?.holdingId ?? '')

  const bal = parseFloat(balance) || 0
  const apr = parseFloat(rate) || 0
  const pay = parseFloat(payment) || 0
  const preview = bal > 0 && pay > 0 ? simulatePayoff([{ id: 'x', name, balance: bal, ratePct: apr, minPayment: pay }], 'AVALANCHE') : null
  const monthlyInterest = (bal * apr) / 100 / 12

  function save() {
    onSave({
      name: name.trim() || LIABILITY_TYPES.find((t) => t.value === type)!.label,
      type,
      institution: institution.trim(),
      balance: bal,
      interestRatePct: apr,
      minPayment: pay,
      holdingId: holdingId || null,
    })
  }

  return (
    <div onClick={onClose} style={modalBackdrop}>
      <div onClick={(e) => e.stopPropagation()} style={modalCard} role="dialog" aria-label={editing ? 'Edit debt' : 'Add debt'}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ fontFamily: "'Space Grotesk'", fontSize: 19, fontWeight: 700 }}>{editing ? 'Edit debt' : 'Add debt'}</div>
          <button onClick={onClose} style={closeBtn} aria-label="Close">×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={labelStyle}>Type</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 6 }}>
              {LIABILITY_TYPES.map((t) => {
                const sel = type === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    style={{ padding: '7px 4px', borderRadius: 9, border: '1px solid ' + (sel ? liabilityColor(t.value) : 'rgba(255,255,255,0.1)'), background: sel ? liabilityColor(t.value) : 'transparent', color: sel ? '#04140C' : '#8A90A2', fontSize: 12, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={PLACEHOLDER[type]} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>Lender</label>
              <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="optional" style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={labelStyle}>Balance owed</label>
            <MoneyInput value={balance} onChange={setBalance} prefix="$" placeholder="0" ariaLabel="Balance owed" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>Interest (APR)</label>
              <MoneyInput value={rate} onChange={setRate} suffix="%" placeholder="0" ariaLabel="Interest rate" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>Monthly payment</label>
              <MoneyInput value={payment} onChange={setPayment} prefix="$" placeholder="minimum" ariaLabel="Monthly payment" />
            </div>
          </div>
          {(type === 'MORTGAGE' || type === 'HELOC') && (
            <div style={{ fontSize: 12, color: '#8A90A2', marginTop: -6 }}>Use principal + interest only — leave out escrow for taxes and insurance.</div>
          )}

          {securable.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle}>Secured by</label>
              <select value={holdingId} onChange={(e) => setHoldingId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="" style={{ background: '#16181F' }}>Nothing (unsecured)</option>
                {securable.map((h) => (
                  <option key={h.id} value={h.id} style={{ background: '#16181F' }}>
                    {h.name || h.symbol} · {CAT_LABEL[h.category]} ({fmtUSD(h.quantity * h.price)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {bal > 0 && (
            <div style={{ fontSize: 12.5, color: '#C9CDD8', background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.5 }}>
              {pay <= monthlyInterest ? (
                <span style={{ color: '#FF5470' }}>
                  This payment doesn't cover the {fmtUSD(monthlyInterest)}/mo in interest — the balance will never go down.
                </span>
              ) : preview ? (
                <>
                  At {fmtUSD(pay)}/mo: paid off in <b style={{ color: '#F2F4F8' }}>{monthsLabel(preview.months)}</b>, costing{' '}
                  <b style={{ color: '#FF5470' }}>{fmtUSD(preview.totalInterest)}</b> in interest.
                </>
              ) : (
                'Add a monthly payment to see your payoff timeline.'
              )}
            </div>
          )}

          {error && <div style={{ fontSize: 13, color: '#FF5470' }}>{error}</div>}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            {editing && (
              <button onClick={() => onDelete(editing)} style={dangerBtn}>
                Delete
              </button>
            )}
            <button onClick={save} disabled={saving} style={{ ...primaryBtn, marginLeft: 'auto', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : editing ? 'Save debt' : 'Add debt'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

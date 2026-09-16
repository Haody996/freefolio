import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import Spinner from '../components/ui/Spinner'
import { panel, panelTitle, pageTitle, secondaryBtn } from '../components/ui/styles'

type Frequency = 'OFF' | 'WEEKLY' | 'MONTHLY'

interface DigestSettings {
  email: string
  digestFrequency: Frequency
  lastDigestAt: string | null
  emailEnabled: boolean
}

const OPTIONS: { value: Frequency; title: string; sub: string }[] = [
  { value: 'WEEKLY', title: 'Weekly', sub: 'Every Monday morning' },
  { value: 'MONTHLY', title: 'Monthly', sub: 'On the 1st of each month' },
  { value: 'OFF', title: 'Off', sub: 'No digest emails' },
]

export default function Settings() {
  const qc = useQueryClient()
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const q = useQuery<DigestSettings>({
    queryKey: ['digest', 'settings'],
    queryFn: async () => (await api.get('/digest/settings')).data,
  })

  const update = useMutation({
    mutationFn: async (frequency: Frequency) => (await api.put('/digest/settings', { frequency })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['digest', 'settings'] }),
  })

  const previewFreq: Exclude<Frequency, 'OFF'> = q.data?.digestFrequency === 'MONTHLY' ? 'MONTHLY' : 'WEEKLY'
  const loadPreview = useMutation({
    mutationFn: async () => (await api.get('/digest/preview', { params: { frequency: previewFreq } })).data as { subject: string; html: string },
    onSuccess: (d) => setPreview(d),
  })
  const sendTest = useMutation({
    mutationFn: async () => (await api.post('/digest/test', { frequency: previewFreq })).data as { to: string },
    onSuccess: (d) => setTestMsg({ ok: true, text: `Sent to ${d.to}` }),
    onError: (err: any) => setTestMsg({ ok: false, text: err.response?.data?.error || 'Sending failed' }),
  })

  if (q.isLoading || !q.data) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    )
  }
  const s = q.data
  const current = update.isPending && update.variables ? update.variables : s.digestFrequency

  return (
    <>
      <header>
        <h1 style={pageTitle}>Settings</h1>
        <div style={{ color: '#8A90A2', fontSize: 13, marginTop: 4 }}>Signed in as {s.email}</div>
      </header>

      <section style={panel}>
        <div style={panelTitle}>Email digest</div>
        <div style={{ fontSize: 13.5, color: '#C9CDD8', lineHeight: 1.55, marginBottom: 16, maxWidth: 620 }}>
          A short summary in your inbox: how your net worth changed, your biggest movers, and your progress toward FIRE.
        </div>

        <div role="radiogroup" aria-label="Digest frequency" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, maxWidth: 620 }}>
          {OPTIONS.map((o) => {
            const active = current === o.value
            return (
              <button
                key={o.value}
                role="radio"
                aria-checked={active}
                onClick={() => update.mutate(o.value)}
                style={{ textAlign: 'left', padding: '13px 15px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', color: 'inherit', background: active ? 'rgba(34,227,138,0.08)' : 'rgba(255,255,255,0.03)', border: `1px solid ${active ? 'rgba(34,227,138,0.5)' : 'rgba(255,255,255,0.07)'}` }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
                  <span style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${active ? '#22E38A' : '#5B6172'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22E38A' }} />}
                  </span>
                  {o.title}
                </div>
                <div style={{ fontSize: 12, color: '#8A90A2', marginTop: 3, marginLeft: 22 }}>{o.sub}</div>
              </button>
            )
          })}
        </div>

        {!s.emailEnabled && (
          <div style={{ marginTop: 14, fontSize: 12.5, color: '#F2C879', background: 'rgba(255,176,32,0.08)', border: '1px solid rgba(255,176,32,0.25)', borderRadius: 10, padding: '9px 12px', maxWidth: 620 }}>
            Email delivery isn't switched on for this server yet — your choice is saved and digests will start once it is.
          </div>
        )}
        {s.lastDigestAt && <div style={{ marginTop: 12, fontSize: 12, color: '#8A90A2' }}>Last sent {new Date(s.lastDigestAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => (preview ? setPreview(null) : loadPreview.mutate())} style={secondaryBtn} disabled={loadPreview.isPending}>
            {loadPreview.isPending ? 'Loading…' : preview ? 'Hide preview' : 'Preview email'}
          </button>
          <button
            onClick={() => {
              setTestMsg(null)
              sendTest.mutate()
            }}
            style={{ ...secondaryBtn, opacity: s.emailEnabled ? 1 : 0.5, cursor: s.emailEnabled ? 'pointer' : 'not-allowed' }}
            disabled={!s.emailEnabled || sendTest.isPending}
            title={s.emailEnabled ? 'Send the digest to yourself now' : 'Email delivery is not configured'}
          >
            {sendTest.isPending ? 'Sending…' : 'Send me a test'}
          </button>
          {testMsg && <span style={{ fontSize: 12.5, color: testMsg.ok ? '#22E38A' : '#FF5470' }}>{testMsg.text}</span>}
        </div>

        {preview && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: '#8A90A2', marginBottom: 6 }}>
              Subject: <b style={{ color: '#C9CDD8' }}>{preview.subject}</b>
            </div>
            <iframe title="Digest preview" srcDoc={preview.html} sandbox="" style={{ width: '100%', maxWidth: 640, height: 720, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, background: '#0E0F13' }} />
          </div>
        )}
      </section>
    </>
  )
}

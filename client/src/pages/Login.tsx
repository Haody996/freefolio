import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { setToken, setUser } from '../lib/auth'
import GoogleSignInButton from '../components/ui/GoogleSignInButton'
import Spinner from '../components/ui/Spinner'
import AuthShell from '../components/ui/AuthShell'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/login', { email, password })
      setToken(data.token)
      setUser(data.user)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Track your net worth and plan your escape.">
      {error && <div style={errorBox}>{error}</div>}
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={input} />
        <input type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={input} />
        <button type="submit" disabled={loading} style={primaryBtn}>
          {loading ? <Spinner className="border-white/40 border-t-white" /> : 'Log in'}
        </button>
      </form>

      <div style={divider}>
        <div style={line} /> or <div style={line} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <GoogleSignInButton onError={setError} />
      </div>

      <p style={{ marginTop: 22, textAlign: 'center', fontSize: 14, color: '#8A90A2' }}>
        No account?{' '}
        <Link to="/register" style={{ fontWeight: 700 }}>
          Sign up
        </Link>
      </p>
    </AuthShell>
  )
}

const input: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  padding: '11px 13px',
  color: '#F2F4F8',
  fontFamily: 'inherit',
  fontSize: 14,
}
const primaryBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  width: '100%',
  padding: '11px 0',
  borderRadius: 10,
  border: 'none',
  background: '#22E38A',
  color: '#04140C',
  fontWeight: 700,
  fontSize: 14,
  fontFamily: 'inherit',
  cursor: 'pointer',
}
const errorBox: React.CSSProperties = {
  marginBottom: 16,
  borderRadius: 10,
  background: 'rgba(255,84,112,0.1)',
  border: '1px solid rgba(255,84,112,0.3)',
  padding: '9px 12px',
  fontSize: 13,
  color: '#FF5470',
}
const divider: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  margin: '16px 0',
  fontSize: 12,
  color: '#8A90A2',
}
const line: React.CSSProperties = { height: 1, flex: 1, background: 'rgba(255,255,255,0.1)' }

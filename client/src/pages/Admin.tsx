import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, ShieldOff, Trash2, Users } from 'lucide-react'
import api from '../lib/api'
import { getUser } from '../lib/auth'
import { useIsMobile } from '../lib/useIsMobile'
import { fmtUSD, fmtCompact } from '../lib/portfolio'
import Spinner from '../components/ui/Spinner'

interface AdminUser {
  id: string
  email: string
  isAdmin: boolean
  createdAt: string
  name: string
  holdingsCount: number
  snapshots: number
  netWorth: number
}

const panel: React.CSSProperties = {
  background: '#16181F',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 18,
  padding: 24,
}

export default function Admin() {
  const qc = useQueryClient()
  const isMobile = useIsMobile()
  const me = getUser()
  const allowed = me?.isAdmin === true

  const q = useQuery<{ users: AdminUser[] }>({
    queryKey: ['admin', 'users'],
    queryFn: async () => (await api.get('/admin/users')).data,
    enabled: allowed,
  })

  const toggleAdmin = useMutation({
    mutationFn: async ({ id, isAdmin }: { id: string; isAdmin: boolean }) => (await api.patch(`/admin/users/${id}`, { isAdmin })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })
  const removeUser = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/users/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
  })

  // Client-side gate (the API enforces it server-side regardless).
  if (!allowed || !me) return <Navigate to="/" replace />

  const users = q.data?.users ?? []
  const totalNW = users.reduce((s, u) => s + u.netWorth, 0)

  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Users className="h-6 w-6" style={{ color: '#9B7CFF' }} />
        <div>
          <h1 style={{ margin: 0, fontFamily: "'Space Grotesk'", fontSize: 25, fontWeight: 700, letterSpacing: -0.5 }}>Admin</h1>
          <div style={{ color: '#8A90A2', fontSize: 13, marginTop: 4 }}>Manage all users on getfreefolio.</div>
        </div>
      </header>

      {/* Summary tiles */}
      <section style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 14 }}>
        <Tile label="Total users" value={String(users.length)} />
        <Tile label="Admins" value={String(users.filter((u) => u.isAdmin).length)} />
        <Tile label="Assets under tracking" value={fmtCompact(totalNW)} />
      </section>

      <section style={panel}>
        {q.isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spinner />
          </div>
        ) : users.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#8A90A2', fontSize: 13 }}>No users yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#8A90A2', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  <th style={th}>User</th>
                  <th style={{ ...th, textAlign: 'right' }}>Holdings</th>
                  <th style={{ ...th, textAlign: 'right' }}>Net worth</th>
                  <th style={{ ...th, textAlign: 'center' }}>Joined</th>
                  <th style={{ ...th, textAlign: 'center' }}>Role</th>
                  <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isMe = u.id === me.id
                  return (
                    <tr key={u.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <td style={td}>
                        <div style={{ fontWeight: 700 }}>
                          {u.email}
                          {isMe && <span style={{ marginLeft: 6, fontSize: 10, color: '#22E38A', fontWeight: 700 }}>you</span>}
                        </div>
                        {u.name && <div style={{ fontSize: 12, color: '#8A90A2' }}>{u.name}</div>}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{u.holdingsCount}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtUSD(u.netWorth)}</td>
                      <td style={{ ...td, textAlign: 'center', color: '#8A90A2' }}>{new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {u.isAdmin ? (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#9B7CFF', background: 'rgba(155,124,255,0.14)', borderRadius: 6, padding: '2px 8px' }}>Admin</span>
                        ) : (
                          <span style={{ fontSize: 11, color: '#8A90A2' }}>User</span>
                        )}
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            title={u.isAdmin ? 'Revoke admin' : 'Make admin'}
                            disabled={isMe || toggleAdmin.isPending}
                            onClick={() => toggleAdmin.mutate({ id: u.id, isAdmin: !u.isAdmin })}
                            style={iconBtn(isMe)}
                          >
                            {u.isAdmin ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                          </button>
                          <button
                            title="Delete user"
                            disabled={isMe || removeUser.isPending}
                            onClick={() => {
                              if (confirm(`Delete ${u.email}? This removes all their data and can't be undone.`)) removeUser.mutate(u.id)
                            }}
                            style={{ ...iconBtn(isMe), color: isMe ? '#3A3F4C' : '#FF5470' }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...panel, padding: 18 }}>
      <div style={{ fontSize: 11, letterSpacing: 0.6, color: '#8A90A2', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: "'Space Grotesk'", fontSize: 26, fontWeight: 700, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '6px 10px', fontWeight: 700 }
const td: React.CSSProperties = { padding: '12px 10px', verticalAlign: 'top' }
function iconBtn(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: disabled ? '#3A3F4C' : '#8A90A2',
    cursor: disabled ? 'default' : 'pointer',
  }
}

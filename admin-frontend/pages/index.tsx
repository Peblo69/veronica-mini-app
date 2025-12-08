import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { AuthGate } from '../components/AuthGate'

const ADMIN_GATEWAY = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL || ''

async function callAdmin(action: string, body: Record<string, any> = {}, token: string, actor: string) {
  const res = await fetch(ADMIN_GATEWAY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': token,
      'x-admin-actor': actor || 'admin-ui',
    },
    body: JSON.stringify({ action, ...body }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Admin request failed')
  }
  return res.json()
}

export default function AdminHome() {
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [token, setToken] = useState('')
  const [actor, setActor] = useState('')

  useEffect(() => {
    const savedToken = sessionStorage.getItem('admin_token') || ''
    const savedActor = sessionStorage.getItem('admin_actor') || ''
    if (savedToken) setToken(savedToken)
    if (savedActor) setActor(savedActor)
  }, [])

  const ready = Boolean(token && ADMIN_GATEWAY)

  const { data: stats, mutate: refreshStats } = useSWR(
    ready ? ['stats', token, actor] : null,
    async () => callAdmin('stats', {}, token, actor),
    { refreshInterval: 15000 }
  )

  const { data: overview } = useSWR(
    ready ? ['stats_overview', token, actor] : null,
    async () => callAdmin('stats_overview', {}, token, actor),
    { refreshInterval: 20000 }
  )

  const { data: salesByDay } = useSWR(
    ready ? ['sales_by_day', token, actor] : null,
    async () => callAdmin('sales_by_day', {}, token, actor),
    { refreshInterval: 20000 }
  )

  const { data: topCreators } = useSWR(
    ready ? ['top_creators', token, actor] : null,
    async () => callAdmin('top_creators', {}, token, actor),
    { refreshInterval: 30000 }
  )

  const { data: topBuyers } = useSWR(
    ready ? ['top_buyers', token, actor] : null,
    async () => callAdmin('top_buyers', {}, token, actor),
    { refreshInterval: 30000 }
  )

  const { data: users, mutate: refreshUsers } = useSWR(
    ready ? ['users', token, actor] : null,
    async () => callAdmin('list_users', { limit: 20 }, token, actor),
    { refreshInterval: 30000 }
  )

  const { data: posts, mutate: refreshPosts } = useSWR(
    ready ? ['posts', token, actor] : null,
    async () => callAdmin('list_posts', { limit: 20 }, token, actor),
    { refreshInterval: 30000 }
  )

  const { data: audit, mutate: refreshAudit } = useSWR(
    ready ? ['audit', token, actor] : null,
    async () => callAdmin('list_audit', { limit: 30 }, token, actor),
    { refreshInterval: 45000 }
  )

  const { data: orders, mutate: refreshOrders } = useSWR(
    ready ? ['orders', token, actor] : null,
    async () => callAdmin('list_orders', { limit: 50 }, token, actor),
    { refreshInterval: 20000 }
  )

  const run = async (fn: () => Promise<any>) => {
    setLoading(true)
    setMessage(null)
    try {
      await fn()
      setMessage('Action completed')
      refreshStats()
      refreshUsers()
      refreshPosts()
      refreshAudit()
      refreshOrders()
    } catch (e: any) {
      setMessage(e?.message || 'Action failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthGate>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <header className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">Admin</p>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-[11px] text-white/50">Actor: {actor || 'unset'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                refreshStats()
                refreshUsers()
                refreshPosts()
                refreshAudit()
              }}
              className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-sm"
              disabled={loading || !ready}
            >
              Refresh
            </button>
            <button
              onClick={() => {
                sessionStorage.removeItem('admin_token')
                sessionStorage.removeItem('admin_actor')
                setToken('')
                setActor('')
              }}
              className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-400/30 text-sm text-red-100"
            >
              Logout
            </button>
          </div>
        </header>

        {!ready && (
          <div className="rounded-xl bg-white/5 border border-white/10 p-4 mb-6">
            <div className="text-sm font-semibold mb-2">Enter admin token</div>
            <div className="flex flex-col gap-2">
              <input
                type="password"
                placeholder="Admin token"
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <input
                type="text"
                placeholder="Actor (e.g., your email)"
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm"
                value={actor}
                onChange={(e) => setActor(e.target.value)}
              />
              <button
                onClick={() => {
                  if (!token) return
                  sessionStorage.setItem('admin_token', token)
                  sessionStorage.setItem('admin_actor', actor || 'admin-ui')
                  setMessage(null)
                }}
                className="px-3 py-2 rounded-lg bg-white text-black text-sm font-semibold"
              >
                Save & Continue
              </button>
            </div>
            <p className="text-[11px] text-white/50 mt-2">
              Token is stored in sessionStorage only. Keep this URL private.
            </p>
          </div>
        )}

        {message && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-sm">
            {message}
          </div>
        )}

          <div className="grid md:grid-cols-3 gap-3 mb-6">
            <StatCard label="Users" value={stats?.data?.users ?? '—'} />
            <StatCard label="Posts" value={stats?.data?.posts ?? '—'} />
            <StatCard label="Comments" value={stats?.data?.comments ?? '—'} />
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <Panel title="Orders (30d)">
              <div className="space-y-2 text-xs">
                {(overview?.data ?? []).map((row: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                    <div className="flex flex-col">
                      <span className="font-semibold text-white">{row.reference_type} • {row.status}</span>
                      <span className="text-white/60">Gross {row.gross} | Net {row.net} | Fee {row.fees}</span>
                    </div>
                    <div className="text-white font-semibold">{row.order_count} orders</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Top Creators (30d)">
              <div className="space-y-2 text-xs">
                {(topCreators?.data ?? []).map((row: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                    <div>
                      <div className="font-semibold text-white">Creator {row.creator_id}</div>
                      <div className="text-white/60">Orders {row.orders}</div>
                    </div>
                    <div className="text-white font-semibold">{row.net} net</div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <Panel title="Recent Orders">
              <div className="space-y-2 text-xs max-h-80 overflow-auto pr-1">
                {(orders?.data ?? []).map((o: any) => (
                  <div key={o.id} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-white">Order #{o.id} • {o.reference_type}</div>
                      <span className="text-[11px] text-white/60">{new Date(o.created_at).toLocaleString()}</span>
                    </div>
                    <div className="text-white/70">User {o.user_id} → Creator {o.creator_id ?? '—'}</div>
                    <div className="flex items-center gap-3 text-[11px] text-white/70 mt-1">
                      <span>Status: {o.status}</span>
                      <span>Gross: {o.amount}</span>
                      <span>Fee: {o.fee}</span>
                      <span>Net: {o.net}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Top Buyers (30d)">
              <div className="space-y-2 text-xs">
                {(topBuyers?.data ?? []).map((row: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                    <div>
                      <div className="font-semibold text-white">User {row.user_id}</div>
                      <div className="text-white/60">Orders {row.orders}</div>
                    </div>
                    <div className="text-white font-semibold">{row.gross} gross</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Sales by Day (30d)">
              <div className="space-y-2 text-xs">
                {(salesByDay?.data ?? []).map((row: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                    <div>
                      <div className="font-semibold text-white">{new Date(row.day).toLocaleDateString()}</div>
                      <div className="text-white/60">{row.orders} orders</div>
                    </div>
                    <div className="text-white font-semibold">Gross {row.gross}</div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Panel title="Recent Users">
            <div className="space-y-2 max-h-96 overflow-auto pr-1">
              {(users?.data ?? []).map((u: any) => (
                <div key={u.telegram_id} className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                  <div>
                    <div className="font-semibold text-sm">{u.username || u.telegram_id}</div>
                    <div className="text-xs text-white/60">
                      {u.first_name} {u.last_name} • {u.is_creator ? 'Creator' : 'User'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {u.is_locked && <span className="text-[10px] px-2 py-1 rounded bg-red-500/20 border border-red-400/30 text-red-200">Locked</span>}
                    <button
                      disabled={loading}
                      onClick={() => run(() => callAdmin(u.is_locked ? 'unlock_user' : 'lock_user', { userId: u.telegram_id }, token, actor))}
                      className="text-xs px-2 py-1 rounded bg-white/10 border border-white/15"
                    >
                      {u.is_locked ? 'Unlock' : 'Lock'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Recent Posts">
            <div className="space-y-2 max-h-96 overflow-auto pr-1">
              {(posts?.data ?? []).map((p: any) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                  <div>
                    <div className="font-semibold text-sm">Post #{p.id}</div>
                    <div className="text-xs text-white/60">
                      Creator {p.creator_id} • {p.visibility} • Likes {p.likes_count ?? 0}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={loading}
                      onClick={() => run(() => callAdmin('set_post_visibility', { postId: p.id, visibility: 'public' }, token, actor))}
                      className="text-[11px] px-2 py-1 rounded bg-white/10 border border-white/15"
                    >
                      Public
                    </button>
                    <button
                      disabled={loading}
                      onClick={() => run(() => callAdmin('set_post_visibility', { postId: p.id, visibility: 'followers' }, token, actor))}
                      className="text-[11px] px-2 py-1 rounded bg-white/10 border border-white/15"
                    >
                      Followers
                    </button>
                    <button
                      disabled={loading}
                      onClick={() => run(() => callAdmin('delete_post', { postId: p.id }, token, actor))}
                      className="text-[11px] px-2 py-1 rounded bg-red-500/20 border border-red-400/40 text-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Audit (last 30)">
            <div className="space-y-2 max-h-96 overflow-auto pr-1">
              {(audit?.data ?? []).map((row: any) => (
                <div key={row.id} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{row.actor}</span>
                    <span className="text-[11px] text-white/60">{new Date(row.created_at).toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-white/80">{row.action}</div>
                  {row.metadata && Object.keys(row.metadata).length > 0 && (
                    <pre className="mt-1 text-[11px] text-white/60 whitespace-pre-wrap break-all">
                      {JSON.stringify(row.metadata)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </AuthGate>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3">
      <div className="text-xs text-white/60">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
      <div className="text-sm font-semibold mb-2">{title}</div>
      {children}
    </div>
  )
}

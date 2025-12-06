import { useState } from 'react'
import useSWR from 'swr'

const ADMIN_GATEWAY = process.env.NEXT_PUBLIC_ADMIN_GATEWAY_URL || ''
const ADMIN_TOKEN = process.env.NEXT_PUBLIC_ADMIN_TOKEN || ''

type Fetcher<T> = (url: string) => Promise<T>

const fetcher: Fetcher<any> = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Request failed')
  return res.json()
}

async function callAdmin(action: string, body: Record<string, any> = {}) {
  const res = await fetch(ADMIN_GATEWAY, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': ADMIN_TOKEN,
      'x-admin-actor': 'admin-ui',
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

  const { data: stats, mutate: refreshStats } = useSWR(
    `${ADMIN_GATEWAY}?action=stats`,
    async () => callAdmin('stats'),
    { refreshInterval: 15000 }
  )

  const { data: users, mutate: refreshUsers } = useSWR(
    `${ADMIN_GATEWAY}?action=list_users`,
    async () => callAdmin('list_users', { limit: 20 }),
    { refreshInterval: 30000 }
  )

  const { data: posts, mutate: refreshPosts } = useSWR(
    `${ADMIN_GATEWAY}?action=list_posts`,
    async () => callAdmin('list_posts', { limit: 20 }),
    { refreshInterval: 30000 }
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
    } catch (e: any) {
      setMessage(e?.message || 'Action failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <header className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">Admin</p>
            <h1 className="text-2xl font-bold">Dashboard</h1>
          </div>
          <button
            onClick={() => {
              refreshStats()
              refreshUsers()
              refreshPosts()
            }}
            className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/10 text-sm"
            disabled={loading}
          >
            Refresh
          </button>
        </header>

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
                      onClick={() => run(() => callAdmin(u.is_locked ? 'unlock_user' : 'lock_user', { userId: u.telegram_id }))}
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
                      onClick={() => run(() => callAdmin('set_post_visibility', { postId: p.id, visibility: 'public' }))}
                      className="text-[11px] px-2 py-1 rounded bg-white/10 border border-white/15"
                    >
                      Public
                    </button>
                    <button
                      disabled={loading}
                      onClick={() => run(() => callAdmin('set_post_visibility', { postId: p.id, visibility: 'followers' }))}
                      className="text-[11px] px-2 py-1 rounded bg-white/10 border border-white/15"
                    >
                      Followers
                    </button>
                    <button
                      disabled={loading}
                      onClick={() => run(() => callAdmin('delete_post', { postId: p.id }))}
                      className="text-[11px] px-2 py-1 rounded bg-red-500/20 border border-red-400/40 text-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
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

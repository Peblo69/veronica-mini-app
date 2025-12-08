import { useEffect, useState } from 'react'
import { Session } from '@supabase/supabase-js'
import { getSupabase } from '../lib/supabaseClient'

const allowedAdmins = (process.env.NEXT_PUBLIC_ALLOWED_ADMINS || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const supabase = getSupabase()

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => {
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  const isAllowed = session?.user?.email && allowedAdmins.length > 0
    ? allowedAdmins.includes(session.user.email.toLowerCase())
    : Boolean(session?.user?.email)

  const handleSignIn = async () => {
    setLoading(true)
    setMessage(null)
    if (!supabase) {
      setMessage('Supabase not configured')
      setLoading(false)
      return
    }
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: typeof window !== 'undefined' ? window.location.href : undefined },
      })
      if (error) throw error
      setMessage('Check your email for the magic link.')
    } catch (e: any) {
      setMessage(e?.message || 'Sign-in failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    await supabase?.auth.signOut()
    setSession(null)
  }

  if (!supabase) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white/5 border border-white/10 p-5 text-center space-y-2">
          <h1 className="text-xl font-bold">Admin Login</h1>
          <p className="text-sm text-white/70">Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.</p>
        </div>
      </div>
    )
  }

  if (!session || !isAllowed) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white/5 border border-white/10 p-5">
          <h1 className="text-xl font-bold mb-2">Admin Login</h1>
          <p className="text-xs text-white/60 mb-4">
            Enter your admin email to receive a magic link. Allowed: {allowedAdmins.length > 0 ? allowedAdmins.join(', ') : 'any email'}
          </p>
          <input
            type="email"
            placeholder="you@example.com"
            className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm mb-3"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            onClick={handleSignIn}
            disabled={loading || !email}
            className="w-full bg-white text-black font-semibold rounded-lg py-2 text-sm"
          >
            {loading ? 'Sending…' : 'Send magic link'}
          </button>
          {message && <p className="text-xs text-white/70 mt-3">{message}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="text-sm text-white/70">Signed in as {session.user.email}</div>
        <button
          onClick={handleSignOut}
          className="text-xs px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-400/30 text-red-100"
        >
          Sign out
        </button>
      </div>
      {children}
    </div>
  )
}

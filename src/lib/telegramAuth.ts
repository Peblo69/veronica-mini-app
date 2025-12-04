import { supabase } from './supabase'

const TELEGRAM_AUTH_URL = import.meta.env.VITE_TELEGRAM_AUTH_URL

interface TelegramAuthResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: {
    telegram_id: number
    username?: string
    first_name?: string
    last_name?: string
    is_creator?: boolean
    is_verified?: boolean
    balance?: number
  }
}

interface AuthSession {
  accessToken: string
  expiresAt: number
  user: TelegramAuthResponse['user']
}

let currentSession: AuthSession | null = null

// Get Telegram initData from WebApp
function getTelegramInitData(): string | null {
  try {
    const WebApp = (window as any).Telegram?.WebApp
    if (WebApp?.initData) {
      return WebApp.initData
    }
  } catch (e) {
    console.warn('Could not get Telegram initData:', e)
  }
  return null
}

// Authenticate with Telegram using the Edge Function
export async function authenticateWithTelegram(): Promise<AuthSession | null> {
  // Check if we have a valid session
  if (currentSession && currentSession.expiresAt > Date.now()) {
    return currentSession
  }

  const initData = getTelegramInitData()
  if (!initData) {
    console.warn('No Telegram initData available - running outside of Telegram?')
    return null
  }

  if (!TELEGRAM_AUTH_URL) {
    console.warn('VITE_TELEGRAM_AUTH_URL not configured - using legacy auth')
    return null
  }

  try {
    const response = await fetch(TELEGRAM_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ initData }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      console.error('Telegram auth failed:', error)
      return null
    }

    const data: TelegramAuthResponse = await response.json()

    // Store session
    currentSession = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in * 1000) - 60000, // 1 min buffer
      user: data.user,
    }

    // Set session on Supabase client (for RLS-enabled queries)
    await supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: '', // We don't use refresh tokens
    })

    return currentSession
  } catch (error) {
    console.error('Error authenticating with Telegram:', error)
    return null
  }
}

// Get current session
export function getCurrentSession(): AuthSession | null {
  if (currentSession && currentSession.expiresAt > Date.now()) {
    return currentSession
  }
  return null
}

// Get current authenticated user
export function getCurrentUser(): TelegramAuthResponse['user'] | null {
  return currentSession?.user || null
}

// Check if authenticated
export function isAuthenticated(): boolean {
  return currentSession !== null && currentSession.expiresAt > Date.now()
}

// Clear session (logout)
export function clearSession(): void {
  currentSession = null
  supabase.auth.signOut()
}

// Re-authenticate if session is expired or about to expire
export async function ensureAuthenticated(): Promise<boolean> {
  if (currentSession && currentSession.expiresAt > Date.now() + 300000) {
    // More than 5 mins left
    return true
  }
  const session = await authenticateWithTelegram()
  return session !== null
}

import { supabase } from './supabase'

export interface UserSettings {
  user_id: number
  // Notifications
  notifications_likes: boolean
  notifications_comments: boolean
  notifications_follows: boolean
  notifications_messages: boolean
  notifications_subscriptions: boolean
  notifications_tips: boolean
  email_notifications: boolean
  // Privacy
  show_online_status: boolean
  allow_messages_from: 'everyone' | 'followers' | 'subscribers' | 'nobody'
  show_activity_status: boolean
  profile_visibility: 'public' | 'followers_only' | 'private'
  // Content
  show_nsfw_content: boolean
  autoplay_videos: boolean
  data_saver_mode: boolean
  blur_sensitive_content: boolean
  // Appearance
  theme: 'light' | 'dark' | 'system'
  accent_color: string
  // Language
  language: string
  // Creator settings
  default_post_visibility: 'public' | 'followers' | 'subscribers'
  watermark_enabled: boolean
  auto_message_new_subscribers: boolean
  welcome_message: string
  // Metadata
  created_at?: string
  updated_at?: string
}

export const defaultSettings: Omit<UserSettings, 'user_id'> = {
  // Notifications
  notifications_likes: true,
  notifications_comments: true,
  notifications_follows: true,
  notifications_messages: true,
  notifications_subscriptions: true,
  notifications_tips: true,
  email_notifications: false,
  // Privacy
  show_online_status: true,
  allow_messages_from: 'everyone',
  show_activity_status: true,
  profile_visibility: 'public',
  // Content
  show_nsfw_content: false,
  autoplay_videos: true,
  data_saver_mode: false,
  blur_sensitive_content: true,
  // Appearance
  theme: 'light',
  accent_color: '#0095f6',
  // Language
  language: 'en',
  // Creator settings
  default_post_visibility: 'public',
  watermark_enabled: false,
  auto_message_new_subscribers: false,
  welcome_message: 'Thanks for subscribing! 💕'
}

export async function getUserSettings(userId: number): Promise<UserSettings> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    console.warn('[settingsApi] Missing settings row, initializing defaults for', userId, error)
    return initializeUserSettings(userId)
  }

  return data as UserSettings
}

export async function updateUserSettings(userId: number, updates: Partial<UserSettings>): Promise<boolean> {
  const { error } = await supabase
    .from('user_settings')
    .upsert({
      user_id: userId,
      ...updates,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })

  if (error) {
    console.error('[settingsApi] Failed to update settings:', error)
    return false
  }

  return true
}

export async function initializeUserSettings(userId: number): Promise<UserSettings> {
  const settings = { user_id: userId, ...defaultSettings }

  const { error } = await supabase
    .from('user_settings')
    .upsert(settings, { onConflict: 'user_id' })

  if (error) {
    console.error('Failed to initialize settings:', error)
    throw error
  }

  return settings
}

// Blocked users management
export async function getBlockedUsers(userId: number): Promise<{ user_id: number; username: string; avatar_url: string }[]> {
  const { data } = await supabase
    .from('blocked_users')
    .select('blocked_user_id, users!blocked_user_id(username, avatar_url)')
    .eq('user_id', userId)

  return (data || []).map((b: any) => ({
    user_id: b.blocked_user_id,
    username: b.users?.username || 'Unknown',
    avatar_url: b.users?.avatar_url
  }))
}

export async function blockUser(userId: number, blockedUserId: number): Promise<boolean> {
  const { error } = await supabase
    .from('blocked_users')
    .insert({ user_id: userId, blocked_user_id: blockedUserId })

  return !error
}

export async function unblockUser(userId: number, blockedUserId: number): Promise<boolean> {
  const { error } = await supabase
    .from('blocked_users')
    .delete()
    .eq('user_id', userId)
    .eq('blocked_user_id', blockedUserId)

  return !error
}

// Session/Device management
export async function getActiveSessions(userId: number): Promise<any[]> {
  const { data } = await supabase
    .from('user_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('last_active', { ascending: false })

  return data || []
}

export async function terminateSession(sessionId: string): Promise<boolean> {
  const { error } = await supabase
    .from('user_sessions')
    .delete()
    .eq('id', sessionId)

  return !error
}

// Data export
export async function requestDataExport(userId: number): Promise<boolean> {
  const { error } = await supabase
    .from('data_export_requests')
    .insert({ user_id: userId, status: 'pending' })

  return !error
}

// Account deletion
export async function requestAccountDeletion(userId: number): Promise<boolean> {
  const { error } = await supabase
    .from('account_deletion_requests')
    .insert({ user_id: userId, status: 'pending' })

  return !error
}

// Update user profile data
export async function updateProfile(userId: number, updates: {
  first_name?: string
  last_name?: string
  username?: string
  bio?: string
  subscription_price?: number
}): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('telegram_id', userId)

  return !error
}

export const languages = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'es', name: 'Spanish', native: 'Español' },
  { code: 'fr', name: 'French', native: 'Français' },
  { code: 'de', name: 'German', native: 'Deutsch' },
  { code: 'it', name: 'Italian', native: 'Italiano' },
  { code: 'pt', name: 'Portuguese', native: 'Português' },
  { code: 'ru', name: 'Russian', native: 'Русский' },
  { code: 'ja', name: 'Japanese', native: '日本語' },
  { code: 'ko', name: 'Korean', native: '한국어' },
  { code: 'zh', name: 'Chinese', native: '中文' },
  { code: 'ar', name: 'Arabic', native: 'العربية' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'tr', name: 'Turkish', native: 'Türkçe' },
  { code: 'nl', name: 'Dutch', native: 'Nederlands' },
  { code: 'pl', name: 'Polish', native: 'Polski' }
]

export const accentColors = [
  { name: 'Blue', value: '#0095f6' },
  { name: 'Purple', value: '#8b5cf6' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' }
]

const SESSION_STORAGE_KEY = 'veronica_session_id'

function getDeviceInfo() {
  if (typeof window === 'undefined') {
    return {
      device_name: 'Unknown device',
      device_type: 'web',
      platform: 'unknown'
    }
  }

  const tgPlatform = (window as any).Telegram?.WebApp?.platform
  const ua = navigator.userAgent || 'Unknown'
  const platform = navigator.platform || 'unknown'

  return {
    device_name: tgPlatform ? `Telegram ${tgPlatform}` : ua.split('(')[0]?.trim() || 'Web Client',
    device_type: tgPlatform || 'web',
    platform
  }
}

export async function registerSession(userId: number): Promise<string | null> {
  try {
    if (typeof window === 'undefined') return null

    const storageKey = `${SESSION_STORAGE_KEY}_${userId}`
    let sessionId = window.localStorage.getItem(storageKey)
    if (!sessionId) {
      sessionId = crypto.randomUUID()
      window.localStorage.setItem(storageKey, sessionId)
    }

    const info = getDeviceInfo()
    const { error } = await supabase
      .from('user_sessions')
      .upsert(
        {
          id: sessionId,
          user_id: userId,
          device_name: info.device_name,
          device_type: info.device_type,
          location: null,
          ip_address: null,
          last_active: new Date().toISOString()
        },
        { onConflict: 'id' }
      )

    if (error) {
      console.error('[settingsApi] Failed to register session', error)
      return null
    }

    return sessionId
  } catch (err) {
    console.error('[settingsApi] Session registration error', err)
    return null
  }
}

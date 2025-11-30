import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://eigfbxjheuwxmtdfnvqc.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpZ2ZieGpoZXV3eG10ZGZudnFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ0NDQ4NjEsImV4cCI6MjA4MDAyMDg2MX0.ilFCYkPxz8qJ3Yaw9Lt14JvdFlUsENKLYWXLYrHO8vA'

// Custom storage that handles restricted contexts (like Telegram WebApp)
const customStorage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Storage not available, ignore
    }
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key)
    } catch {
      // Storage not available, ignore
    }
  },
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: customStorage,
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
})

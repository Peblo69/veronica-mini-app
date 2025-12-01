import { supabase } from './supabase'
import { type User, type Post } from './api'

// ============================================
// ADMIN API
// ============================================

export interface AdminUser {
  id: number
  telegram_id: number
  username: string
  role: 'admin' | 'super_admin' | 'moderator'
  permissions: {
    view_users: boolean
    edit_users: boolean
    delete_posts: boolean
    manage_applications: boolean
    view_messages: boolean
    view_analytics: boolean
  }
  is_active: boolean
  created_at: string
  last_login: string
}

export interface CreatorApplication {
  id: number
  user_id: number
  legal_name: string
  date_of_birth: string
  country: string
  city: string
  email: string
  phone: string
  content_type: 'sfw' | 'nsfw'
  is_ai_generated: boolean
  content_categories: string[]
  content_description: string
  instagram_url: string
  twitter_url: string
  tiktok_url: string
  other_platforms: string
  status: 'pending' | 'approved' | 'rejected' | 'requires_info'
  rejection_reason: string
  reviewed_at: string
  created_at: string
  user?: User
}

export interface Report {
  id: number
  reporter_id: number
  reported_type: 'user' | 'post' | 'message'
  reported_id: string
  reason: string
  description: string
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed'
  created_at: string
  reporter?: User
}

export interface PlatformStats {
  total_users: number
  total_creators: number
  total_posts: number
  pending_applications: number
  pending_reports: number
  new_users_today: number
  revenue_today: number
}

// Check if user is admin
export async function checkIsAdmin(telegramId: number): Promise<AdminUser | null> {
  const { data } = await supabase
    .from('admin_users')
    .select('*')
    .eq('telegram_id', telegramId)
    .eq('is_active', true)
    .single()

  if (data) {
    // Update last login
    await supabase
      .from('admin_users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', data.id)
  }

  return data as AdminUser | null
}

// Get all users with pagination
export async function getAllUsers(page = 1, limit = 20, search?: string) {
  let query = supabase
    .from('users')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  if (search) {
    query = query.or(`username.ilike.%${search}%,first_name.ilike.%${search}%`)
  }

  const { data, count } = await query
  return { users: data as User[], total: count || 0 }
}

// Get user by ID with full details
export async function getUserDetails(telegramId: number) {
  const [userRes, postsRes, followersRes, followingRes] = await Promise.all([
    supabase.from('users').select('*').eq('telegram_id', telegramId).single(),
    supabase.from('posts').select('*').eq('creator_id', telegramId).order('created_at', { ascending: false }),
    supabase.from('follows').select('*, follower:users!follower_id(*)').eq('following_id', telegramId),
    supabase.from('follows').select('*, following:users!following_id(*)').eq('follower_id', telegramId),
  ])

  return {
    user: userRes.data as User,
    posts: postsRes.data as Post[],
    followers: followersRes.data,
    following: followingRes.data,
  }
}

// Update user (admin)
export async function adminUpdateUser(telegramId: number, updates: Partial<User & { admin_notes?: string, is_banned?: boolean, banned_reason?: string }>) {
  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('telegram_id', telegramId)
  return !error
}

// Ban user
export async function banUser(telegramId: number, reason: string, adminId: number) {
  const { error } = await supabase
    .from('users')
    .update({
      is_banned: true,
      banned_at: new Date().toISOString(),
      banned_reason: reason,
      banned_by: adminId
    })
    .eq('telegram_id', telegramId)
  return !error
}

// Unban user
export async function unbanUser(telegramId: number) {
  const { error } = await supabase
    .from('users')
    .update({
      is_banned: false,
      banned_at: null,
      banned_reason: null,
      banned_by: null
    })
    .eq('telegram_id', telegramId)
  return !error
}

// Get all posts with pagination
export async function getAllPosts(page = 1, limit = 20, filters?: { visibility?: string, is_nsfw?: boolean, is_hidden?: boolean }) {
  let query = supabase
    .from('posts')
    .select('*, creator:users!creator_id(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1)

  if (filters?.visibility) query = query.eq('visibility', filters.visibility)
  if (filters?.is_nsfw !== undefined) query = query.eq('is_nsfw', filters.is_nsfw)
  if (filters?.is_hidden !== undefined) query = query.eq('is_hidden', filters.is_hidden)

  const { data, count } = await query
  return { posts: data as Post[], total: count || 0 }
}

// Delete post (hide)
export async function hidePost(postId: number, reason: string, adminId: number) {
  const { error } = await supabase
    .from('posts')
    .update({
      is_hidden: true,
      hidden_reason: reason,
      hidden_by: adminId,
      hidden_at: new Date().toISOString()
    })
    .eq('id', postId)
  return !error
}

// Permanently delete post
export async function deletePost(postId: number) {
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)
  return !error
}

// Get all creator applications
export async function getApplications(status?: string) {
  let query = supabase
    .from('creator_applications')
    .select('*, user:users!user_id(*)')
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data } = await query
  return data as CreatorApplication[]
}

// Approve application
export async function approveApplication(applicationId: number, userId: number) {
  // Update application status
  const { error: appError } = await supabase
    .from('creator_applications')
    .update({
      status: 'approved',
      reviewed_at: new Date().toISOString()
    })
    .eq('id', applicationId)

  if (appError) return false

  // Update user to creator
  const { error: userError } = await supabase
    .from('users')
    .update({
      is_creator: true,
      is_verified: true,
      application_status: 'approved'
    })
    .eq('telegram_id', userId)

  return !userError
}

// Reject application
export async function rejectApplication(applicationId: number, userId: number, reason: string) {
  const { error: appError } = await supabase
    .from('creator_applications')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', applicationId)

  if (appError) return false

  const { error: userError } = await supabase
    .from('users')
    .update({ application_status: 'rejected' })
    .eq('telegram_id', userId)

  return !userError
}

// Get reports
export async function getReports(status?: string) {
  let query = supabase
    .from('reports')
    .select('*, reporter:users!reporter_id(*)')
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data } = await query
  return data as Report[]
}

// Get platform stats
export async function getPlatformStats(): Promise<PlatformStats> {
  const now = new Date()
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const endOfDay = new Date(startOfDay)
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1)
  const startIso = startOfDay.toISOString()
  const endIso = endOfDay.toISOString()

  const [usersRes, creatorsRes, postsRes, applicationsRes, reportsRes, newUsersRes, revenueRes] = await Promise.all([
    supabase.from('users').select('id', { count: 'exact', head: true }),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_creator', true),
    supabase.from('posts').select('id', { count: 'exact', head: true }),
    supabase.from('creator_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', startIso),
    supabase
      .from('transactions')
      .select('amount')
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .eq('status', 'completed'),
  ])

  const revenueToday = (revenueRes.data || []).reduce((sum: number, row: { amount: number }) => {
    const amount = typeof row.amount === 'number' ? row.amount : Number(row.amount || 0)
    return sum + (isNaN(amount) ? 0 : amount)
  }, 0)

  return {
    total_users: usersRes.count || 0,
    total_creators: creatorsRes.count || 0,
    total_posts: postsRes.count || 0,
    pending_applications: applicationsRes.count || 0,
    pending_reports: reportsRes.count || 0,
    new_users_today: newUsersRes.count || 0,
    revenue_today: Number(revenueToday.toFixed(2)),
  }
}

// Log admin activity
export async function logAdminActivity(adminId: number, action: string, targetType: string, targetId: string, details?: any) {
  await supabase
    .from('admin_activity_log')
    .insert({
      admin_id: adminId,
      action,
      target_type: targetType,
      target_id: targetId,
      details,
    })
}

// Get messages for a user (admin view)
export async function getUserMessages(userId: number) {
  const { data } = await supabase
    .from('messages')
    .select('*, sender:users!sender_id(*), receiver:users!receiver_id(*)')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(100)

  return data || []
}

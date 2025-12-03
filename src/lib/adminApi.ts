import { type User, type Post } from './api'

const ADMIN_API_BASE_URL = import.meta.env.VITE_ADMIN_API_BASE_URL
const ADMIN_API_TOKEN = import.meta.env.VITE_ADMIN_API_TOKEN

type AdminAction =
  | 'check_admin'
  | 'list_users'
  | 'user_details'
  | 'update_user'
  | 'ban_user'
  | 'unban_user'
  | 'list_posts'
  | 'hide_post'
  | 'delete_post'
  | 'list_applications'
  | 'approve_application'
  | 'reject_application'
  | 'list_reports'
  | 'platform_stats'
  | 'log_activity'
  | 'user_messages'

interface AdminRequestPayload {
  action: AdminAction
  data?: Record<string, unknown>
}

async function adminRequest<T = any>(payload: AdminRequestPayload): Promise<T> {
  if (!ADMIN_API_BASE_URL) {
    throw new Error(
      'Secure admin backend is not configured. Set VITE_ADMIN_API_BASE_URL to a protected endpoint (worker, API route, etc.).'
    )
  }

  const response = await fetch(ADMIN_API_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(ADMIN_API_TOKEN ? { Authorization: `Bearer ${ADMIN_API_TOKEN}` } : {}),
    },
    body: JSON.stringify(payload),
    credentials: 'include',
  })

  if (response.status === 204) {
    return null as T
  }

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Admin API (${response.status}): ${text || 'Unknown error'}`)
  }

  return (await response.json()) as T
}

// ============================================
// TYPES
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

// ============================================
// ACTION WRAPPERS
// ============================================

export async function checkIsAdmin(telegramId: number): Promise<AdminUser | null> {
  return adminRequest<AdminUser | null>({
    action: 'check_admin',
    data: { telegramId },
  })
}

export async function getAllUsers(page = 1, limit = 20, search?: string) {
  return adminRequest<{ users: User[]; total: number }>({
    action: 'list_users',
    data: { page, limit, search },
  })
}

export async function getUserDetails(telegramId: number) {
  return adminRequest<{
    user: User
    posts: Post[]
    followers: any[]
    following: any[]
  }>({
    action: 'user_details',
    data: { telegramId },
  })
}

export async function adminUpdateUser(
  telegramId: number,
  updates: Partial<User & { admin_notes?: string; is_banned?: boolean; banned_reason?: string }>
) {
  await adminRequest({
    action: 'update_user',
    data: { telegramId, updates },
  })
  return true
}

export async function banUser(telegramId: number, reason: string, adminId: number) {
  await adminRequest({
    action: 'ban_user',
    data: { telegramId, reason, adminId },
  })
  return true
}

export async function unbanUser(telegramId: number) {
  await adminRequest({
    action: 'unban_user',
    data: { telegramId },
  })
  return true
}

export async function getAllPosts(page = 1, limit = 20, filters?: { visibility?: string; is_nsfw?: boolean; is_hidden?: boolean }) {
  return adminRequest<{ posts: Post[]; total: number }>({
    action: 'list_posts',
    data: { page, limit, filters },
  })
}

export async function hidePost(postId: number, reason: string, adminId: number) {
  await adminRequest({
    action: 'hide_post',
    data: { postId, reason, adminId },
  })
  return true
}

export async function deletePost(postId: number) {
  await adminRequest({
    action: 'delete_post',
    data: { postId },
  })
  return true
}

export async function getApplications(status?: string) {
  return adminRequest<CreatorApplication[]>({
    action: 'list_applications',
    data: { status },
  })
}

export async function approveApplication(applicationId: number, userId: number) {
  await adminRequest({
    action: 'approve_application',
    data: { applicationId, userId },
  })
  return true
}

export async function rejectApplication(applicationId: number, userId: number, reason: string) {
  await adminRequest({
    action: 'reject_application',
    data: { applicationId, userId, reason },
  })
  return true
}

export async function getReports(status?: string) {
  return adminRequest<Report[]>({
    action: 'list_reports',
    data: { status },
  })
}

export async function getPlatformStats(): Promise<PlatformStats> {
  return adminRequest<PlatformStats>({
    action: 'platform_stats',
  })
}

export async function logAdminActivity(adminId: number, action: string, targetType: string, targetId: string, details?: any) {
  await adminRequest({
    action: 'log_activity',
    data: { adminId, action, targetType, targetId, details },
  })
}

export async function getUserMessages(userId: number) {
  return adminRequest({
    action: 'user_messages',
    data: { userId },
  })
}

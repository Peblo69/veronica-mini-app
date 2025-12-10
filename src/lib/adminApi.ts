import { supabase } from './supabase'
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
  | 'list_conversations'
  | 'user_messages'
  | 'conversation_messages'
  | 'delete_message'
  | 'list_posts'
  | 'hide_post'
  | 'unhide_post'
  | 'delete_post'
  | 'list_applications'
  | 'approve_application'
  | 'reject_application'
  | 'list_reports'
  | 'update_report'
  | 'get_reported_content'
  | 'list_flagged_content'
  | 'review_flagged_content'
  | 'add_flagged_content'
  | 'list_announcements'
  | 'create_announcement'
  | 'update_announcement'
  | 'delete_announcement'
  | 'platform_stats'
  | 'activity_log'
  | 'recent_activity'
  | 'list_admins'
  | 'create_admin'
  | 'update_admin'
  | 'delete_admin'

interface AdminRequestPayload {
  action: AdminAction
  data?: Record<string, unknown>
}

async function adminRequest<T = any>(payload: AdminRequestPayload): Promise<T> {
  if (!ADMIN_API_BASE_URL) {
    throw new Error('Admin API not configured')
  }

  const response = await fetch(ADMIN_API_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(ADMIN_API_TOKEN ? { Authorization: `Bearer ${ADMIN_API_TOKEN}` } : {}),
    },
    body: JSON.stringify(payload),
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
    ban_users: boolean
    delete_posts: boolean
    manage_applications: boolean
    view_messages: boolean
    view_analytics: boolean
    manage_reports: boolean
    post_announcements: boolean
    manage_admins: boolean
  }
  is_active: boolean
  created_at: string
  last_login: string
  created_by?: number
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
  reported_type: 'user' | 'post' | 'message' | 'comment' | 'story'
  reported_id: string
  reason: string
  description: string
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed'
  priority: 'low' | 'normal' | 'high' | 'critical'
  reviewed_by?: number
  reviewed_at?: string
  resolution_notes?: string
  created_at: string
  reporter?: User
}

export interface FlaggedContent {
  id: number
  content_type: 'post' | 'message' | 'story' | 'avatar' | 'comment'
  content_id: string
  user_id: number
  flag_reason: string
  flag_categories: Record<string, boolean>
  flag_scores: Record<string, number>
  media_url?: string
  text_content?: string
  status: 'pending' | 'approved' | 'rejected' | 'auto_blocked'
  reviewed_by?: number
  reviewed_at?: string
  review_notes?: string
  created_at: string
  user?: User
}

export interface Announcement {
  id: number
  title: string
  content: string
  type: 'info' | 'warning' | 'update' | 'maintenance' | 'promotion'
  target_audience: 'all' | 'creators' | 'subscribers' | 'new_users'
  is_active: boolean
  is_dismissible: boolean
  starts_at: string
  ends_at?: string
  created_by: number
  created_at: string
  updated_at: string
}

export interface PlatformStats {
  total_users: number
  total_creators: number
  total_posts: number
  pending_applications: number
  pending_reports: number
  pending_flagged: number
  new_users_today: number
  new_users_week: number
  new_posts_week: number
  messages_week: number
  active_users_today: number
}

export interface AdminActivityLog {
  id: number
  admin_id: number
  action: string
  target_type?: string
  target_id?: string
  details?: any
  created_at: string
  admin?: AdminUser
}

export interface Conversation {
  id: number
  participant1_id: number
  participant2_id: number
  last_message_at: string
  created_at: string
  participant1?: User
  participant2?: User
  messages?: any[]
}

export interface Message {
  id: number
  conversation_id: number
  sender_id: number
  receiver_id: number
  content?: string
  media_url?: string
  media_type?: string
  created_at: string
  sender?: User
  receiver?: User
}

export interface UserBan {
  id: number
  user_id: number
  reason: string
  banned_by: number
  banned_at: string
  unbanned_at?: string
  unbanned_by?: number
  is_permanent: boolean
  expires_at?: string
}

// ============================================
// AUTH
// ============================================

export async function checkIsAdmin(telegramId: number): Promise<AdminUser | null> {
  return adminRequest<AdminUser | null>({
    action: 'check_admin',
    data: { telegramId },
  })
}

// ============================================
// USERS
// ============================================

export async function getAllUsers(page = 1, limit = 20, search?: string, filter?: string) {
  return adminRequest<{ users: User[]; total: number }>({
    action: 'list_users',
    data: { page, limit, search, filter },
  })
}

export async function getUserDetails(telegramId: number) {
  return adminRequest<{
    user: User
    posts: Post[]
    followers: any[]
    following: any[]
    subscriptions: any[]
    transactions: any[]
    bans: UserBan[]
  }>({
    action: 'user_details',
    data: { telegramId },
  })
}

export async function adminUpdateUser(
  telegramId: number,
  updates: Partial<User & { admin_notes?: string }>,
  adminId: number
) {
  await adminRequest({
    action: 'update_user',
    data: { telegramId, updates, adminId },
  })
  return true
}

export async function banUser(
  telegramId: number,
  reason: string,
  adminId: number,
  isPermanent = false,
  duration?: number
) {
  await adminRequest({
    action: 'ban_user',
    data: { telegramId, reason, adminId, isPermanent, duration },
  })
  return true
}

export async function unbanUser(telegramId: number, adminId: number) {
  await adminRequest({
    action: 'unban_user',
    data: { telegramId, adminId },
  })
  return true
}

// ============================================
// MESSAGES
// ============================================

export async function listConversations(page = 1, limit = 50, search?: string) {
  return adminRequest<{ conversations: Conversation[]; total: number }>({
    action: 'list_conversations',
    data: { page, limit, search },
  })
}

export async function getUserMessages(userId: number, page = 1, limit = 100) {
  return adminRequest<{ messages: Message[]; total: number }>({
    action: 'user_messages',
    data: { userId, page, limit },
  })
}

export async function getConversationMessages(conversationId: number, page = 1, limit = 100) {
  return adminRequest<{ messages: Message[]; total: number }>({
    action: 'conversation_messages',
    data: { conversationId, page, limit },
  })
}

export async function deleteMessage(messageId: number, adminId: number, reason?: string) {
  await adminRequest({
    action: 'delete_message',
    data: { messageId, adminId, reason },
  })
  return true
}

// ============================================
// POSTS
// ============================================

export async function getAllPosts(
  page = 1,
  limit = 20,
  filters?: { visibility?: string; is_nsfw?: boolean; is_hidden?: boolean; creator_id?: number }
) {
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

export async function unhidePost(postId: number, adminId: number) {
  await adminRequest({
    action: 'unhide_post',
    data: { postId, adminId },
  })
  return true
}

export async function deletePost(postId: number, adminId: number, reason?: string) {
  await adminRequest({
    action: 'delete_post',
    data: { postId, adminId, reason },
  })
  return true
}

// ============================================
// APPLICATIONS
// ============================================

export async function getApplications(status?: string, page = 1, limit = 50) {
  return adminRequest<{ applications: CreatorApplication[]; total: number }>({
    action: 'list_applications',
    data: { status, page, limit },
  })
}

export async function approveApplication(applicationId: number, userId: number, adminId: number) {
  await adminRequest({
    action: 'approve_application',
    data: { applicationId, userId, adminId },
  })
  return true
}

export async function rejectApplication(applicationId: number, userId: number, reason: string, adminId: number) {
  await adminRequest({
    action: 'reject_application',
    data: { applicationId, userId, reason, adminId },
  })
  return true
}

// ============================================
// REPORTS
// ============================================

export async function getReports(status?: string, priority?: string, page = 1, limit = 50) {
  return adminRequest<{ reports: Report[]; total: number }>({
    action: 'list_reports',
    data: { status, priority, page, limit },
  })
}

export async function updateReport(reportId: number, updates: Partial<Report>, adminId: number) {
  await adminRequest({
    action: 'update_report',
    data: { reportId, updates, adminId },
  })
  return true
}

export async function getReportedContent(reportedType: string, reportedId: string) {
  return adminRequest<{ content: any }>({
    action: 'get_reported_content',
    data: { reportedType, reportedId },
  })
}

// ============================================
// FLAGGED CONTENT (MODERATION QUEUE)
// ============================================

export async function getFlaggedContent(status = 'pending', page = 1, limit = 50) {
  return adminRequest<{ flagged: FlaggedContent[]; total: number }>({
    action: 'list_flagged_content',
    data: { status, page, limit },
  })
}

export async function reviewFlaggedContent(
  flaggedId: number,
  decision: 'approved' | 'rejected',
  adminId: number,
  notes?: string
) {
  await adminRequest({
    action: 'review_flagged_content',
    data: { flaggedId, decision, adminId, notes },
  })
  return true
}

export async function addFlaggedContent(
  contentType: string,
  contentId: string,
  userId: number,
  reason: string,
  categories?: Record<string, boolean>,
  scores?: Record<string, number>,
  mediaUrl?: string,
  textContent?: string
) {
  await adminRequest({
    action: 'add_flagged_content',
    data: { contentType, contentId, userId, reason, categories, scores, mediaUrl, textContent },
  })
  return true
}

// ============================================
// ANNOUNCEMENTS
// ============================================

export async function getAnnouncements(includeInactive = false) {
  return adminRequest<Announcement[]>({
    action: 'list_announcements',
    data: { includeInactive },
  })
}

export async function createAnnouncement(
  title: string,
  content: string,
  adminId: number,
  options?: {
    type?: string
    targetAudience?: string
    isDismissible?: boolean
    startsAt?: string
    endsAt?: string
  }
) {
  return adminRequest<Announcement>({
    action: 'create_announcement',
    data: { title, content, adminId, ...options },
  })
}

export async function updateAnnouncement(announcementId: number, updates: Partial<Announcement>, adminId: number) {
  await adminRequest({
    action: 'update_announcement',
    data: { announcementId, updates, adminId },
  })
  return true
}

export async function deleteAnnouncement(announcementId: number, adminId: number) {
  await adminRequest({
    action: 'delete_announcement',
    data: { announcementId, adminId },
  })
  return true
}

// ============================================
// STATS & ACTIVITY
// ============================================

export async function getPlatformStats(): Promise<PlatformStats> {
  return adminRequest<PlatformStats>({
    action: 'platform_stats',
  })
}

export async function getActivityLog(page = 1, limit = 50, adminId?: number) {
  return adminRequest<{ logs: AdminActivityLog[]; total: number }>({
    action: 'activity_log',
    data: { page, limit, adminId },
  })
}

export async function getRecentActivity(limit = 20) {
  return adminRequest<{
    recentUsers: any[]
    recentPosts: any[]
    recentMessages: any[]
  }>({
    action: 'recent_activity',
    data: { limit },
  })
}

// ============================================
// ADMIN MANAGEMENT
// ============================================

export async function listAdmins() {
  return adminRequest<AdminUser[]>({
    action: 'list_admins',
  })
}

export async function createAdmin(
  telegramId: number,
  username: string,
  role: string,
  permissions: Record<string, boolean>,
  createdBy: number
) {
  return adminRequest<AdminUser>({
    action: 'create_admin',
    data: { telegramId, username, role, permissions, createdBy },
  })
}

export async function updateAdmin(adminTargetId: number, updates: Partial<AdminUser>, adminId: number) {
  await adminRequest({
    action: 'update_admin',
    data: { adminTargetId, updates, adminId },
  })
  return true
}

export async function deleteAdmin(adminTargetId: number, adminId: number) {
  await adminRequest({
    action: 'delete_admin',
    data: { adminTargetId, adminId },
  })
  return true
}

// ============================================
// REAL-TIME SUBSCRIPTIONS
// ============================================

export function subscribeToNewUsers(callback: (user: User) => void) {
  return supabase
    .channel('admin-new-users')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, (payload) => {
      callback(payload.new as User)
    })
    .subscribe()
}

export function subscribeToNewPosts(callback: (post: Post) => void) {
  return supabase
    .channel('admin-new-posts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
      callback(payload.new as Post)
    })
    .subscribe()
}

export function subscribeToNewMessages(callback: (message: Message) => void) {
  return supabase
    .channel('admin-new-messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      callback(payload.new as Message)
    })
    .subscribe()
}

export function subscribeToReports(callback: (report: Report) => void) {
  return supabase
    .channel('admin-reports')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, (payload) => {
      callback(payload.new as Report)
    })
    .subscribe()
}

export function subscribeToFlaggedContent(callback: (flagged: FlaggedContent) => void) {
  return supabase
    .channel('admin-flagged')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'flagged_content' }, (payload) => {
      callback(payload.new as FlaggedContent)
    })
    .subscribe()
}

export function subscribeToApplications(callback: (app: CreatorApplication) => void) {
  return supabase
    .channel('admin-applications')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'creator_applications' }, (payload) => {
      callback(payload.new as CreatorApplication)
    })
    .subscribe()
}

export function subscribeToAllActivity(callbacks: {
  onNewUser?: (user: User) => void
  onNewPost?: (post: Post) => void
  onNewMessage?: (message: Message) => void
  onNewReport?: (report: Report) => void
  onNewFlagged?: (flagged: FlaggedContent) => void
  onNewApplication?: (app: CreatorApplication) => void
}) {
  const channel = supabase.channel('admin-all-activity')

  if (callbacks.onNewUser) {
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users' }, (payload) => {
      callbacks.onNewUser!(payload.new as User)
    })
  }

  if (callbacks.onNewPost) {
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, (payload) => {
      callbacks.onNewPost!(payload.new as Post)
    })
  }

  if (callbacks.onNewMessage) {
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      callbacks.onNewMessage!(payload.new as Message)
    })
  }

  if (callbacks.onNewReport) {
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, (payload) => {
      callbacks.onNewReport!(payload.new as Report)
    })
  }

  if (callbacks.onNewFlagged) {
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'flagged_content' }, (payload) => {
      callbacks.onNewFlagged!(payload.new as FlaggedContent)
    })
  }

  if (callbacks.onNewApplication) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'creator_applications' }, (payload) => {
      callbacks.onNewApplication!(payload.new as CreatorApplication)
    })
  }

  return channel.subscribe()
}

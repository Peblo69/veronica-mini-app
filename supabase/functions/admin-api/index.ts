// deno-lint-ignore-file no-explicit-any
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const adminApiToken = Deno.env.get('ADMIN_API_TOKEN') ?? ''

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for admin API function.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface AdminRequestBody {
  action?: string
  data?: Record<string, unknown>
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...corsHeaders,
    },
  })
}

async function ensureAuthorized(req: Request): Promise<Response | null> {
  if (!adminApiToken) {
    console.warn('ADMIN_API_TOKEN not set, allowing all requests (dev mode).')
    return null
  }

  const header = req.headers.get('authorization') ?? ''
  if (header !== `Bearer ${adminApiToken}`) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }
  return null
}

// Helper to log admin activity
async function logActivity(adminId: number, action: string, targetType?: string, targetId?: string, details?: any) {
  await supabase.from('admin_activity_log').insert({
    admin_id: adminId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  })
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const authResult = await ensureAuthorized(req)
  if (authResult) {
    return authResult
  }

  let body: AdminRequestBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const action = body.action
  const data = body.data || {}

  if (!action) {
    return jsonResponse({ error: 'Missing action' }, 400)
  }

  try {
    switch (action) {
      // ============================================
      // ADMIN AUTHENTICATION
      // ============================================
      case 'check_admin': {
        const telegramId = Number(data.telegramId)
        const { data: admin } = await supabase
          .from('admin_users')
          .select('*')
          .eq('telegram_id', telegramId)
          .eq('is_active', true)
          .single()

        if (admin) {
          await supabase
            .from('admin_users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', admin.id)
        }

        return jsonResponse(admin ?? null)
      }

      // ============================================
      // USER MANAGEMENT
      // ============================================
      case 'list_users': {
        const page = Number(data.page ?? 1)
        const limit = Number(data.limit ?? 20)
        const search = (data.search as string) || undefined
        const filter = (data.filter as string) || undefined

        let query = supabase
          .from('users')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range((page - 1) * limit, page * limit - 1)

        if (search) {
          query = query.or(
            `username.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,telegram_id.eq.${search.replace(/\D/g, '') || '0'}`,
          )
        }

        if (filter === 'creators') query = query.eq('is_creator', true)
        if (filter === 'banned') query = query.eq('is_banned', true)
        if (filter === 'verified') query = query.eq('is_verified', true)

        const { data: users, count, error } = await query
        if (error) throw error

        return jsonResponse({ users, total: count ?? 0 })
      }

      case 'user_details': {
        const telegramId = Number(data.telegramId)
        const [userRes, postsRes, followersRes, followingRes, subscriptionsRes, transactionsRes, bansRes] = await Promise.all([
          supabase.from('users').select('*').eq('telegram_id', telegramId).single(),
          supabase.from('posts').select('*').eq('creator_id', telegramId).order('created_at', { ascending: false }).limit(50),
          supabase.from('follows').select('*, follower:users!follower_id(*)').eq('following_id', telegramId),
          supabase.from('follows').select('*, following:users!following_id(*)').eq('follower_id', telegramId),
          supabase.from('subscriptions').select('*, subscriber:users!subscriber_id(*)').eq('creator_id', telegramId),
          supabase.from('stars_transactions').select('*').eq('user_id', telegramId).order('created_at', { ascending: false }).limit(50),
          supabase.from('user_bans').select('*').eq('user_id', telegramId).order('banned_at', { ascending: false }),
        ])

        return jsonResponse({
          user: userRes.data,
          posts: postsRes.data ?? [],
          followers: followersRes.data ?? [],
          following: followingRes.data ?? [],
          subscriptions: subscriptionsRes.data ?? [],
          transactions: transactionsRes.data ?? [],
          bans: bansRes.data ?? [],
        })
      }

      case 'update_user': {
        const telegramId = Number(data.telegramId)
        const updates = data.updates as Record<string, unknown>
        const adminId = Number(data.adminId)

        await supabase
          .from('users')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('telegram_id', telegramId)

        await logActivity(adminId, 'update_user', 'user', String(telegramId), updates)
        return jsonResponse({ success: true })
      }

      case 'ban_user': {
        const telegramId = Number(data.telegramId)
        const reason = (data.reason as string) ?? 'No reason provided'
        const adminId = Number(data.adminId)
        const isPermanent = Boolean(data.isPermanent)
        const duration = Number(data.duration) || 0 // hours

        let expiresAt = null
        if (!isPermanent && duration > 0) {
          expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000).toISOString()
        }

        await supabase.from('user_bans').insert({
          user_id: telegramId,
          reason,
          banned_by: adminId,
          is_permanent: isPermanent,
          expires_at: expiresAt,
        })

        await supabase
          .from('users')
          .update({
            is_banned: true,
            banned_reason: reason,
            banned_at: new Date().toISOString()
          })
          .eq('telegram_id', telegramId)

        await logActivity(adminId, 'ban_user', 'user', String(telegramId), { reason, isPermanent, duration })
        return jsonResponse({ success: true })
      }

      case 'unban_user': {
        const telegramId = Number(data.telegramId)
        const adminId = Number(data.adminId)

        // Update the most recent ban record
        await supabase
          .from('user_bans')
          .update({
            unbanned_at: new Date().toISOString(),
            unbanned_by: adminId
          })
          .eq('user_id', telegramId)
          .is('unbanned_at', null)
          .order('banned_at', { ascending: false })
          .limit(1)

        await supabase
          .from('users')
          .update({ is_banned: false, banned_reason: null, banned_at: null })
          .eq('telegram_id', telegramId)

        await logActivity(adminId, 'unban_user', 'user', String(telegramId))
        return jsonResponse({ success: true })
      }

      // ============================================
      // MESSAGES - READ ANY CONVERSATION
      // ============================================
      case 'list_conversations': {
        const page = Number(data.page ?? 1)
        const limit = Number(data.limit ?? 50)
        const search = (data.search as string) || undefined

        let query = supabase
          .from('conversations')
          .select(`
            *,
            participant1:users!participant1_id(*),
            participant2:users!participant2_id(*),
            messages(id, content, created_at, sender_id)
          `, { count: 'exact' })
          .order('last_message_at', { ascending: false })
          .range((page - 1) * limit, page * limit - 1)

        const { data: conversations, count, error } = await query
        if (error) throw error

        return jsonResponse({ conversations, total: count ?? 0 })
      }

      case 'user_messages': {
        const userId = Number(data.userId)
        const page = Number(data.page ?? 1)
        const limit = Number(data.limit ?? 100)

        const { data: messages, count, error } = await supabase
          .from('messages')
          .select('*, sender:users!sender_id(*), receiver:users!receiver_id(*)', { count: 'exact' })
          .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
          .order('created_at', { ascending: false })
          .range((page - 1) * limit, page * limit - 1)

        if (error) throw error
        return jsonResponse({ messages, total: count ?? 0 })
      }

      case 'conversation_messages': {
        const conversationId = Number(data.conversationId)
        const page = Number(data.page ?? 1)
        const limit = Number(data.limit ?? 100)

        const { data: messages, count, error } = await supabase
          .from('messages')
          .select('*, sender:users!sender_id(*)', { count: 'exact' })
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .range((page - 1) * limit, page * limit - 1)

        if (error) throw error
        return jsonResponse({ messages: messages?.reverse() ?? [], total: count ?? 0 })
      }

      case 'delete_message': {
        const messageId = Number(data.messageId)
        const adminId = Number(data.adminId)
        const reason = (data.reason as string) ?? 'Admin deleted'

        await supabase.from('messages').delete().eq('id', messageId)
        await logActivity(adminId, 'delete_message', 'message', String(messageId), { reason })
        return jsonResponse({ success: true })
      }

      // ============================================
      // POSTS MANAGEMENT
      // ============================================
      case 'list_posts': {
        const page = Number(data.page ?? 1)
        const limit = Number(data.limit ?? 20)
        const filters = (data.filters ?? {}) as Record<string, unknown>

        let query = supabase
          .from('posts')
          .select('*, creator:users!creator_id(*)', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range((page - 1) * limit, page * limit - 1)

        if (filters.visibility) query = query.eq('visibility', filters.visibility)
        if (typeof filters.is_nsfw === 'boolean') query = query.eq('is_nsfw', filters.is_nsfw)
        if (typeof filters.is_hidden === 'boolean') query = query.eq('is_hidden', filters.is_hidden)
        if (filters.creator_id) query = query.eq('creator_id', filters.creator_id)

        const { data: posts, count, error } = await query
        if (error) throw error

        return jsonResponse({ posts, total: count ?? 0 })
      }

      case 'hide_post': {
        const postId = Number(data.postId)
        const reason = (data.reason as string) ?? 'No reason provided'
        const adminId = Number(data.adminId)

        await supabase
          .from('posts')
          .update({
            is_hidden: true,
            hidden_reason: reason,
            hidden_by: adminId,
            hidden_at: new Date().toISOString(),
          })
          .eq('id', postId)

        await logActivity(adminId, 'hide_post', 'post', String(postId), { reason })
        return jsonResponse({ success: true })
      }

      case 'unhide_post': {
        const postId = Number(data.postId)
        const adminId = Number(data.adminId)

        await supabase
          .from('posts')
          .update({
            is_hidden: false,
            hidden_reason: null,
            hidden_by: null,
            hidden_at: null,
          })
          .eq('id', postId)

        await logActivity(adminId, 'unhide_post', 'post', String(postId))
        return jsonResponse({ success: true })
      }

      case 'delete_post': {
        const postId = Number(data.postId)
        const adminId = Number(data.adminId)
        const reason = (data.reason as string) ?? 'Admin deleted'

        // Get post details before deletion for logging
        const { data: post } = await supabase.from('posts').select('*').eq('id', postId).single()

        await supabase.from('posts').delete().eq('id', postId)
        await logActivity(adminId, 'delete_post', 'post', String(postId), { reason, post })
        return jsonResponse({ success: true })
      }

      // ============================================
      // CREATOR APPLICATIONS
      // ============================================
      case 'list_applications': {
        const status = (data.status as string) || undefined
        const page = Number(data.page ?? 1)
        const limit = Number(data.limit ?? 50)

        let query = supabase
          .from('creator_applications')
          .select('*, user:users!user_id(*)', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range((page - 1) * limit, page * limit - 1)

        if (status) query = query.eq('status', status)

        const { data: applications, count, error } = await query
        if (error) throw error
        return jsonResponse({ applications: applications ?? [], total: count ?? 0 })
      }

      case 'approve_application': {
        const applicationId = Number(data.applicationId)
        const userId = Number(data.userId)
        const adminId = Number(data.adminId)

        await supabase
          .from('creator_applications')
          .update({
            status: 'approved',
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', applicationId)

        await supabase
          .from('users')
          .update({
            is_creator: true,
            is_verified: true,
            application_status: 'approved',
          })
          .eq('telegram_id', userId)

        await logActivity(adminId, 'approve_application', 'application', String(applicationId), { userId })
        return jsonResponse({ success: true })
      }

      case 'reject_application': {
        const applicationId = Number(data.applicationId)
        const userId = Number(data.userId)
        const reason = (data.reason as string) ?? 'Rejected'
        const adminId = Number(data.adminId)

        await supabase
          .from('creator_applications')
          .update({
            status: 'rejected',
            rejection_reason: reason,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', applicationId)

        await supabase.from('users').update({ application_status: 'rejected' }).eq('telegram_id', userId)

        await logActivity(adminId, 'reject_application', 'application', String(applicationId), { userId, reason })
        return jsonResponse({ success: true })
      }

      // ============================================
      // REPORTS MANAGEMENT
      // ============================================
      case 'list_reports': {
        const status = (data.status as string) || undefined
        const priority = (data.priority as string) || undefined
        const page = Number(data.page ?? 1)
        const limit = Number(data.limit ?? 50)

        let query = supabase
          .from('reports')
          .select('*, reporter:users!reporter_id(*)', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range((page - 1) * limit, page * limit - 1)

        if (status) query = query.eq('status', status)
        if (priority) query = query.eq('priority', priority)

        const { data: reports, count, error } = await query
        if (error) throw error
        return jsonResponse({ reports: reports ?? [], total: count ?? 0 })
      }

      case 'update_report': {
        const reportId = Number(data.reportId)
        const updates = data.updates as Record<string, unknown>
        const adminId = Number(data.adminId)

        await supabase
          .from('reports')
          .update({
            ...updates,
            reviewed_by: adminId,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', reportId)

        await logActivity(adminId, 'update_report', 'report', String(reportId), updates)
        return jsonResponse({ success: true })
      }

      case 'get_reported_content': {
        const reportedType = data.reportedType as string
        const reportedId = data.reportedId as string

        let content = null

        if (reportedType === 'user') {
          const { data } = await supabase.from('users').select('*').eq('telegram_id', reportedId).single()
          content = data
        } else if (reportedType === 'post') {
          const { data } = await supabase.from('posts').select('*, creator:users!creator_id(*)').eq('id', reportedId).single()
          content = data
        } else if (reportedType === 'message') {
          const { data } = await supabase.from('messages').select('*, sender:users!sender_id(*)').eq('id', reportedId).single()
          content = data
        } else if (reportedType === 'comment') {
          const { data } = await supabase.from('comments').select('*, user:users!user_id(*)').eq('id', reportedId).single()
          content = data
        }

        return jsonResponse({ content })
      }

      // ============================================
      // FLAGGED CONTENT (AI MODERATION QUEUE)
      // ============================================
      case 'list_flagged_content': {
        const status = (data.status as string) || 'pending'
        const page = Number(data.page ?? 1)
        const limit = Number(data.limit ?? 50)

        const { data: flagged, count, error } = await supabase
          .from('flagged_content')
          .select('*, user:users!user_id(*)', { count: 'exact' })
          .eq('status', status)
          .order('created_at', { ascending: false })
          .range((page - 1) * limit, page * limit - 1)

        if (error) throw error
        return jsonResponse({ flagged: flagged ?? [], total: count ?? 0 })
      }

      case 'review_flagged_content': {
        const flaggedId = Number(data.flaggedId)
        const decision = data.decision as 'approved' | 'rejected'
        const adminId = Number(data.adminId)
        const notes = (data.notes as string) || ''

        await supabase
          .from('flagged_content')
          .update({
            status: decision,
            reviewed_by: adminId,
            reviewed_at: new Date().toISOString(),
            review_notes: notes,
          })
          .eq('id', flaggedId)

        // If rejected, also hide/delete the content
        if (decision === 'rejected') {
          const { data: flagged } = await supabase.from('flagged_content').select('*').eq('id', flaggedId).single()
          if (flagged) {
            if (flagged.content_type === 'post') {
              await supabase.from('posts').update({ is_hidden: true, hidden_reason: 'AI flagged - admin rejected' }).eq('id', flagged.content_id)
            } else if (flagged.content_type === 'message') {
              await supabase.from('messages').delete().eq('id', flagged.content_id)
            }
          }
        }

        await logActivity(adminId, 'review_flagged', 'flagged_content', String(flaggedId), { decision, notes })
        return jsonResponse({ success: true })
      }

      case 'add_flagged_content': {
        const contentType = data.contentType as string
        const contentId = data.contentId as string
        const userId = Number(data.userId)
        const reason = data.reason as string
        const categories = data.categories || {}
        const scores = data.scores || {}
        const mediaUrl = data.mediaUrl as string
        const textContent = data.textContent as string

        await supabase.from('flagged_content').insert({
          content_type: contentType,
          content_id: contentId,
          user_id: userId,
          flag_reason: reason,
          flag_categories: categories,
          flag_scores: scores,
          media_url: mediaUrl,
          text_content: textContent,
        })

        return jsonResponse({ success: true })
      }

      // ============================================
      // ANNOUNCEMENTS
      // ============================================
      case 'list_announcements': {
        const includeInactive = Boolean(data.includeInactive)

        let query = supabase
          .from('announcements')
          .select('*')
          .order('created_at', { ascending: false })

        if (!includeInactive) {
          query = query.eq('is_active', true)
        }

        const { data: announcements, error } = await query
        if (error) throw error
        return jsonResponse(announcements ?? [])
      }

      case 'create_announcement': {
        const adminId = Number(data.adminId)
        const announcement = {
          title: data.title as string,
          content: data.content as string,
          type: (data.type as string) || 'info',
          target_audience: (data.targetAudience as string) || 'all',
          is_dismissible: data.isDismissible !== false,
          starts_at: data.startsAt || new Date().toISOString(),
          ends_at: data.endsAt || null,
          created_by: adminId,
        }

        const { data: created, error } = await supabase
          .from('announcements')
          .insert(announcement)
          .select()
          .single()

        if (error) throw error

        await logActivity(adminId, 'create_announcement', 'announcement', String(created.id), announcement)
        return jsonResponse(created)
      }

      case 'update_announcement': {
        const announcementId = Number(data.announcementId)
        const updates = data.updates as Record<string, unknown>
        const adminId = Number(data.adminId)

        await supabase
          .from('announcements')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', announcementId)

        await logActivity(adminId, 'update_announcement', 'announcement', String(announcementId), updates)
        return jsonResponse({ success: true })
      }

      case 'delete_announcement': {
        const announcementId = Number(data.announcementId)
        const adminId = Number(data.adminId)

        await supabase.from('announcements').delete().eq('id', announcementId)
        await logActivity(adminId, 'delete_announcement', 'announcement', String(announcementId))
        return jsonResponse({ success: true })
      }

      // ============================================
      // PLATFORM STATS
      // ============================================
      case 'platform_stats': {
        const now = new Date()
        const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
        const endOfDay = new Date(startOfDay)
        endOfDay.setUTCDate(endOfDay.getUTCDate() + 1)

        const startOfWeek = new Date(startOfDay)
        startOfWeek.setUTCDate(startOfWeek.getUTCDate() - 7)

        const startIso = startOfDay.toISOString()
        const endIso = endOfDay.toISOString()
        const weekStartIso = startOfWeek.toISOString()

        const [
          usersRes, creatorsRes, postsRes, applicationsRes, reportsRes,
          newUsersRes, newUsersTodayRes, postsWeekRes, messagesWeekRes,
          activeUsersRes, flaggedRes
        ] = await Promise.all([
          supabase.from('users').select('id', { count: 'exact', head: true }),
          supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_creator', true),
          supabase.from('posts').select('id', { count: 'exact', head: true }),
          supabase.from('creator_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', weekStartIso),
          supabase.from('users').select('id', { count: 'exact', head: true }).gte('created_at', startIso),
          supabase.from('posts').select('id', { count: 'exact', head: true }).gte('created_at', weekStartIso),
          supabase.from('messages').select('id', { count: 'exact', head: true }).gte('created_at', weekStartIso),
          supabase.from('users').select('id', { count: 'exact', head: true }).gte('last_active', startIso),
          supabase.from('flagged_content').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        ])

        return jsonResponse({
          total_users: usersRes.count ?? 0,
          total_creators: creatorsRes.count ?? 0,
          total_posts: postsRes.count ?? 0,
          pending_applications: applicationsRes.count ?? 0,
          pending_reports: reportsRes.count ?? 0,
          pending_flagged: flaggedRes.count ?? 0,
          new_users_today: newUsersTodayRes.count ?? 0,
          new_users_week: newUsersRes.count ?? 0,
          new_posts_week: postsWeekRes.count ?? 0,
          messages_week: messagesWeekRes.count ?? 0,
          active_users_today: activeUsersRes.count ?? 0,
        })
      }

      case 'activity_log': {
        const page = Number(data.page ?? 1)
        const limit = Number(data.limit ?? 50)
        const adminId = data.adminId ? Number(data.adminId) : undefined

        let query = supabase
          .from('admin_activity_log')
          .select('*, admin:admin_users!admin_id(*)', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range((page - 1) * limit, page * limit - 1)

        if (adminId) query = query.eq('admin_id', adminId)

        const { data: logs, count, error } = await query
        if (error) throw error
        return jsonResponse({ logs: logs ?? [], total: count ?? 0 })
      }

      case 'recent_activity': {
        const limit = Number(data.limit ?? 20)

        // Get recent registrations
        const { data: recentUsers } = await supabase
          .from('users')
          .select('telegram_id, username, first_name, avatar_url, created_at')
          .order('created_at', { ascending: false })
          .limit(limit)

        // Get recent posts
        const { data: recentPosts } = await supabase
          .from('posts')
          .select('id, content, media_url, created_at, creator:users!creator_id(telegram_id, username, first_name, avatar_url)')
          .order('created_at', { ascending: false })
          .limit(limit)

        // Get recent messages (count)
        const { data: recentMessages } = await supabase
          .from('messages')
          .select('id, created_at, sender:users!sender_id(telegram_id, username, first_name)')
          .order('created_at', { ascending: false })
          .limit(limit)

        return jsonResponse({
          recentUsers: recentUsers ?? [],
          recentPosts: recentPosts ?? [],
          recentMessages: recentMessages ?? [],
        })
      }

      // ============================================
      // ADMIN MANAGEMENT
      // ============================================
      case 'list_admins': {
        const { data: admins, error } = await supabase
          .from('admin_users')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) throw error
        return jsonResponse(admins ?? [])
      }

      case 'create_admin': {
        const telegramId = Number(data.telegramId)
        const username = data.username as string
        const role = (data.role as string) || 'moderator'
        const permissions = data.permissions || {}
        const createdBy = Number(data.createdBy)

        const { data: admin, error } = await supabase
          .from('admin_users')
          .insert({
            telegram_id: telegramId,
            username,
            role,
            permissions,
            created_by: createdBy,
          })
          .select()
          .single()

        if (error) throw error

        await logActivity(createdBy, 'create_admin', 'admin', String(telegramId), { role })
        return jsonResponse(admin)
      }

      case 'update_admin': {
        const adminTargetId = Number(data.adminTargetId)
        const updates = data.updates as Record<string, unknown>
        const adminId = Number(data.adminId)

        await supabase
          .from('admin_users')
          .update(updates)
          .eq('telegram_id', adminTargetId)

        await logActivity(adminId, 'update_admin', 'admin', String(adminTargetId), updates)
        return jsonResponse({ success: true })
      }

      case 'delete_admin': {
        const adminTargetId = Number(data.adminTargetId)
        const adminId = Number(data.adminId)

        await supabase
          .from('admin_users')
          .delete()
          .eq('telegram_id', adminTargetId)

        await logActivity(adminId, 'delete_admin', 'admin', String(adminTargetId))
        return jsonResponse({ success: true })
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (err) {
    console.error('Admin API error:', err)
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return jsonResponse({ error: message }, 500)
  }
})

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

interface AdminRequestBody {
  action?: string
  data?: Record<string, unknown>
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
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

serve(async (req) => {
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

      case 'list_users': {
        const page = Number(data.page ?? 1)
        const limit = Number(data.limit ?? 20)
        const search = (data.search as string) || undefined

        let query = supabase
          .from('users')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range((page - 1) * limit, page * limit - 1)

        if (search) {
          query = query.or(
            `username.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`,
          )
        }

        const { data: users, count, error } = await query
        if (error) throw error

        return jsonResponse({ users, total: count ?? 0 })
      }

      case 'user_details': {
        const telegramId = Number(data.telegramId)
        const [userRes, postsRes, followersRes, followingRes] = await Promise.all([
          supabase.from('users').select('*').eq('telegram_id', telegramId).single(),
          supabase
            .from('posts')
            .select('*')
            .eq('creator_id', telegramId)
            .order('created_at', { ascending: false }),
          supabase.from('follows').select('*, follower:users!follower_id(*)').eq('following_id', telegramId),
          supabase.from('follows').select('*, following:users!following_id(*)').eq('follower_id', telegramId),
        ])

        return jsonResponse({
          user: userRes.data,
          posts: postsRes.data ?? [],
          followers: followersRes.data ?? [],
          following: followingRes.data ?? [],
        })
      }

      case 'update_user': {
        const telegramId = Number(data.telegramId)
        const updates = data.updates as Record<string, unknown>
        await supabase
          .from('users')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('telegram_id', telegramId)
        return jsonResponse({ success: true })
      }

      case 'ban_user': {
        const telegramId = Number(data.telegramId)
        const reason = (data.reason as string) ?? 'No reason provided'
        const adminId = Number(data.adminId)

        await supabase.from('user_bans').insert({
          user_id: telegramId,
          reason,
          banned_by: adminId,
        })

        await supabase
          .from('users')
          .update({ is_banned: true, banned_reason: reason })
          .eq('telegram_id', telegramId)

        return jsonResponse({ success: true })
      }

      case 'unban_user': {
        const telegramId = Number(data.telegramId)
        await supabase
          .from('users')
          .update({ is_banned: false, banned_reason: null })
          .eq('telegram_id', telegramId)
        return jsonResponse({ success: true })
      }

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

        return jsonResponse({ success: true })
      }

      case 'delete_post': {
        const postId = Number(data.postId)
        await supabase.from('posts').delete().eq('id', postId)
        return jsonResponse({ success: true })
      }

      case 'list_applications': {
        const status = (data.status as string) || undefined
        let query = supabase
          .from('creator_applications')
          .select('*, user:users!user_id(*)')
          .order('created_at', { ascending: false })
        if (status) query = query.eq('status', status)
        const { data: applications, error } = await query
        if (error) throw error
        return jsonResponse(applications ?? [])
      }

      case 'approve_application': {
        const applicationId = Number(data.applicationId)
        const userId = Number(data.userId)

        const updated = await supabase
          .from('creator_applications')
          .update({
            status: 'approved',
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', applicationId)

        if (updated.error) throw updated.error

        await supabase
          .from('users')
          .update({
            is_creator: true,
            is_verified: true,
            application_status: 'approved',
          })
          .eq('telegram_id', userId)

        return jsonResponse({ success: true })
      }

      case 'reject_application': {
        const applicationId = Number(data.applicationId)
        const userId = Number(data.userId)
        const reason = (data.reason as string) ?? 'Rejected'

        const updated = await supabase
          .from('creator_applications')
          .update({
            status: 'rejected',
            rejection_reason: reason,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', applicationId)

        if (updated.error) throw updated.error

        await supabase.from('users').update({ application_status: 'rejected' }).eq('telegram_id', userId)

        return jsonResponse({ success: true })
      }

      case 'list_reports': {
        const status = (data.status as string) || undefined
        let query = supabase
          .from('reports')
          .select('*, reporter:users!reporter_id(*)')
          .order('created_at', { ascending: false })
        if (status) query = query.eq('status', status)
        const { data: reports, error } = await query
        if (error) throw error
        return jsonResponse(reports ?? [])
      }

      case 'platform_stats': {
        const now = new Date()
        const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
        const endOfDay = new Date(startOfDay)
        endOfDay.setUTCDate(endOfDay.getUTCDate() + 1)

        const startIso = startOfDay.toISOString()
        const endIso = endOfDay.toISOString()

        const [usersRes, creatorsRes, postsRes, applicationsRes, reportsRes, newUsersRes, revenueRes] =
          await Promise.all([
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

        const revenueToday = (revenueRes.data ?? []).reduce((sum, row) => {
          const amount = typeof row.amount === 'number' ? row.amount : Number(row.amount || 0)
          return sum + (isNaN(amount) ? 0 : amount)
        }, 0)

        return jsonResponse({
          total_users: usersRes.count ?? 0,
          total_creators: creatorsRes.count ?? 0,
          total_posts: postsRes.count ?? 0,
          pending_applications: applicationsRes.count ?? 0,
          pending_reports: reportsRes.count ?? 0,
          new_users_today: newUsersRes.count ?? 0,
          revenue_today: Number(revenueToday.toFixed(2)),
        })
      }

      case 'log_activity': {
        await supabase.from('admin_activity_log').insert({
          admin_id: Number(data.adminId),
          action: data.action,
          target_type: data.targetType,
          target_id: data.targetId,
          details: data.details ?? null,
        })
        return jsonResponse({ success: true })
      }

      case 'user_messages': {
        const userId = Number(data.userId)
        const { data: messages, error } = await supabase
          .from('messages')
          .select('*, sender:users!sender_id(*), receiver:users!receiver_id(*)')
          .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
          .order('created_at', { ascending: false })
          .limit(100)
        if (error) throw error
        return jsonResponse(messages ?? [])
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

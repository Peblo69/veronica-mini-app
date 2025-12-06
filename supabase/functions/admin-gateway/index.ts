// deno-lint-ignore-file no-explicit-any
// Simple admin gateway for privileged actions.
// Protects with a shared secret header and uses the service role key.
// Deploy with: supabase functions deploy admin-gateway
// Call with: fetch('/functions/v1/admin-gateway', { headers: { 'x-admin-token': <secret> }, body: JSON.stringify({ action, ...payload }) })

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.0'

type AdminAction =
  | { action: 'delete_post'; postId: number }
  | { action: 'lock_user'; userId: number }
  | { action: 'unlock_user'; userId: number }
  | { action: 'set_post_visibility'; postId: number; visibility: string }
  | { action: 'list_users'; limit?: number }
  | { action: 'list_posts'; limit?: number }
  | { action: 'stats' }

const ADMIN_HEADER = 'x-admin-token'
const ADMIN_ACTOR_HEADER = 'x-admin-actor'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const adminToken = Deno.env.get('ADMIN_SHARED_SECRET') ?? ''

const supabase = createClient(supabaseUrl, serviceRoleKey)

function jsonResponse(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function logAudit(actor: string, action: string, meta?: Record<string, unknown>) {
  try {
    await supabase.from('admin_audit_logs').insert({
      actor,
      action,
      metadata: meta ?? {},
    })
  } catch (_e) {
    // Swallow audit failures to avoid breaking primary flow
  }
}

async function handleDeletePost(postId: number) {
  const { error } = await supabase.from('posts').delete().eq('id', postId)
  if (error) {
    return jsonResponse({ success: false, error: error.message }, 400)
  }
  // Best-effort cleanup of related rows
  await supabase.from('likes').delete().eq('post_id', postId)
  await supabase.from('comments').delete().eq('post_id', postId)
  await supabase.from('saved_posts').delete().eq('post_id', postId)
  await supabase.from('content_purchases').delete().eq('post_id', postId)
  return jsonResponse({ success: true })
}

async function handleLockUser(userId: number, lock: boolean) {
  const { error } = await supabase
    .from('users')
    .update({ is_locked: lock, locked_at: lock ? new Date().toISOString() : null })
    .eq('telegram_id', userId)
  if (error) {
    return jsonResponse({ success: false, error: error.message }, 400)
  }
  return jsonResponse({ success: true })
}

async function handleStats() {
  const [{ count: users }, { count: posts }, { count: comments }] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('posts').select('*', { count: 'exact', head: true }),
    supabase.from('comments').select('*', { count: 'exact', head: true }),
  ])
  return jsonResponse({
    success: true,
    data: {
      users: users ?? 0,
      posts: posts ?? 0,
      comments: comments ?? 0,
    },
  })
}

async function handleSetPostVisibility(postId: number, visibility: string) {
  const allowed = new Set(['public', 'followers', 'subscribers'])
  if (!allowed.has(visibility)) {
    return jsonResponse({ success: false, error: 'Invalid visibility' }, 400)
  }
  const { error } = await supabase.from('posts').update({ visibility }).eq('id', postId)
  if (error) {
    return jsonResponse({ success: false, error: error.message }, 400)
  }
  return jsonResponse({ success: true })
}

async function handleListUsers(limit = 50) {
  const safeLimit = Math.min(Math.max(limit, 1), 200)
  const { data, error } = await supabase
    .from('users')
    .select('telegram_id, username, first_name, last_name, is_creator, is_locked, created_at, balance')
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  if (error) return jsonResponse({ success: false, error: error.message }, 400)
  return jsonResponse({ success: true, data })
}

async function handleListPosts(limit = 50) {
  const safeLimit = Math.min(Math.max(limit, 1), 200)
  const { data, error } = await supabase
    .from('posts')
    .select('id, creator_id, visibility, likes_count, comments_count, created_at, is_nsfw, unlock_price')
    .order('created_at', { ascending: false })
    .limit(safeLimit)

  if (error) return jsonResponse({ success: false, error: error.message }, 400)
  return jsonResponse({ success: true, data })
}

Deno.serve(async (req) => {
  // Auth check
  const provided = req.headers.get(ADMIN_HEADER)
  if (!adminToken || provided !== adminToken) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401)
  }

  const actor = req.headers.get(ADMIN_ACTOR_HEADER) || 'admin-gateway'

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
  }

  let payload: AdminAction
  try {
    payload = await req.json()
  } catch (_e) {
    return jsonResponse({ success: false, error: 'Invalid JSON' }, 400)
  }

  if (payload.action === 'delete_post') {
    if (!payload.postId) return jsonResponse({ success: false, error: 'postId required' }, 400)
    const res = await handleDeletePost(payload.postId)
    await logAudit(actor, 'delete_post', { postId: payload.postId })
    return res
  }

  if (payload.action === 'lock_user') {
    if (!payload.userId) return jsonResponse({ success: false, error: 'userId required' }, 400)
    const res = await handleLockUser(payload.userId, true)
    await logAudit(actor, 'lock_user', { userId: payload.userId })
    return res
  }

  if (payload.action === 'unlock_user') {
    if (!payload.userId) return jsonResponse({ success: false, error: 'userId required' }, 400)
    const res = await handleLockUser(payload.userId, false)
    await logAudit(actor, 'unlock_user', { userId: payload.userId })
    return res
  }

  if (payload.action === 'set_post_visibility') {
    if (!payload.postId || !payload.visibility) {
      return jsonResponse({ success: false, error: 'postId and visibility required' }, 400)
    }
    const res = await handleSetPostVisibility(payload.postId, payload.visibility)
    await logAudit(actor, 'set_post_visibility', { postId: payload.postId, visibility: payload.visibility })
    return res
  }

  if (payload.action === 'list_users') {
    const res = await handleListUsers(payload.limit)
    await logAudit(actor, 'list_users', { limit: payload.limit ?? 50 })
    return res
  }

  if (payload.action === 'list_posts') {
    const res = await handleListPosts(payload.limit)
    await logAudit(actor, 'list_posts', { limit: payload.limit ?? 50 })
    return res
  }

  if (payload.action === 'stats') {
    const res = await handleStats()
    await logAudit(actor, 'stats')
    return res
  }

  return jsonResponse({ success: false, error: 'Unknown action' }, 400)
})

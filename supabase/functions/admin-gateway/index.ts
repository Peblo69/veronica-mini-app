// deno-lint-ignore-file no-explicit-any
// Simple admin gateway for privileged actions.
// Protects with a shared secret header and uses the service role key.
// Deploy with: supabase functions deploy admin-gateway
// Call with: fetch('/functions/v1/admin-gateway', { headers: { 'x-admin-token': <secret> }, body: JSON.stringify({ action, payload }) })

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.0'

type AdminAction =
  | { action: 'delete_post'; postId: number }
  | { action: 'lock_user'; userId: number }
  | { action: 'unlock_user'; userId: number }
  | { action: 'stats' }

const ADMIN_HEADER = 'x-admin-token'

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

Deno.serve(async (req) => {
  // Auth check
  const provided = req.headers.get(ADMIN_HEADER)
  if (!adminToken || provided !== adminToken) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401)
  }

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
    return await handleDeletePost(payload.postId)
  }

  if (payload.action === 'lock_user') {
    if (!payload.userId) return jsonResponse({ success: false, error: 'userId required' }, 400)
    return await handleLockUser(payload.userId, true)
  }

  if (payload.action === 'unlock_user') {
    if (!payload.userId) return jsonResponse({ success: false, error: 'userId required' }, 400)
    return await handleLockUser(payload.userId, false)
  }

  if (payload.action === 'stats') {
    return await handleStats()
  }

  return jsonResponse({ success: false, error: 'Unknown action' }, 400)
})

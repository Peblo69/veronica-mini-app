import { supabase } from './supabase'
import { toast } from './toast'
import type { User } from './api'

// ============================================
// COMMENT TYPES
// ============================================

export interface Comment {
  id: string
  post_id: number
  user_id: number
  content: string
  parent_id: string | null
  likes_count: number
  created_at: string
  updated_at: string | null
  user?: User
  replies?: Comment[]
  liked?: boolean
}

// ============================================
// GET COMMENTS
// ============================================

export async function getComments(postId: number, userId?: number): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('*, user:users!user_id(*)')
    .eq('post_id', postId)
    .is('parent_id', null)
    .order('created_at', { ascending: false })

  if (error || !data) return []

  // Get user's likes if logged in
  let likedCommentIds = new Set<string>()
  if (userId) {
    const { data: likes } = await supabase
      .from('comment_likes')
      .select('comment_id')
      .eq('user_id', userId)

    likedCommentIds = new Set(likes?.map(l => l.comment_id) || [])
  }

  // Get replies for each comment
  const commentsWithReplies = await Promise.all(
    data.map(async (comment) => {
      const { data: replies } = await supabase
        .from('comments')
        .select('*, user:users!user_id(*)')
        .eq('parent_id', comment.id)
        .order('created_at', { ascending: true })

      return {
        ...comment,
        liked: likedCommentIds.has(comment.id),
        replies: (replies || []).map(reply => ({
          ...reply,
          liked: likedCommentIds.has(reply.id)
        }))
      }
    })
  )

  return commentsWithReplies as Comment[]
}

// ============================================
// GET COMMENT COUNT
// ============================================

export async function getCommentCount(postId: number): Promise<number> {
  const { count } = await supabase
    .from('comments')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', postId)

  return count || 0
}

// ============================================
// ADD COMMENT
// ============================================

export async function addComment(
  postId: number,
  userId: number,
  content: string,
  parentId?: string
): Promise<Comment | null> {
  const { data, error } = await supabase
    .from('comments')
    .insert({
      post_id: postId,
      user_id: userId,
      content,
      parent_id: parentId || null
    })
    .select('*, user:users!user_id(*)')
    .single()

  if (error) {
    console.error('Add comment error:', error)
    toast.error('Failed to add comment')
    return null
  }

  // Update post comment count
  await supabase.rpc('increment_comments', { p_post_id: postId })

  // Create notification for post owner (if not commenting on own post)
  const { data: post } = await supabase
    .from('posts')
    .select('creator_id')
    .eq('id', postId)
    .single()

  if (post && post.creator_id !== userId) {
    await supabase.from('notifications').insert({
      user_id: post.creator_id,
      from_user_id: userId,
      type: 'comment',
      content: 'commented on your post',
      reference_id: postId.toString(),
      reference_type: 'post'
    })
  }

  return data as Comment
}

// ============================================
// EDIT COMMENT
// ============================================

export async function editComment(
  commentId: string,
  userId: number,
  content: string
): Promise<Comment | null> {
  const { data, error } = await supabase
    .from('comments')
    .update({
      content,
      updated_at: new Date().toISOString()
    })
    .eq('id', commentId)
    .eq('user_id', userId)
    .select('*, user:users!user_id(*)')
    .single()

  if (error) return null
  return data as Comment
}

// ============================================
// DELETE COMMENT
// ============================================

export async function deleteComment(
  commentId: string,
  userId: number,
  postId: number
): Promise<boolean> {
  // Delete replies first
  await supabase
    .from('comments')
    .delete()
    .eq('parent_id', commentId)

  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
    .eq('user_id', userId)

  if (!error) {
    // Decrement post comment count
    await supabase.rpc('decrement_comments', { p_post_id: postId })
  }

  return !error
}

// ============================================
// LIKE/UNLIKE COMMENT
// ============================================

export async function likeComment(commentId: string, userId: number): Promise<boolean> {
  // Insert into comment_likes - the on_comment_like_update trigger handles likes_count
  const { error } = await supabase
    .from('comment_likes')
    .insert({ comment_id: commentId, user_id: userId })

  return !error
}

export async function unlikeComment(commentId: string, userId: number): Promise<boolean> {
  // Delete from comment_likes - the on_comment_like_update trigger handles likes_count
  const { error } = await supabase
    .from('comment_likes')
    .delete()
    .eq('comment_id', commentId)
    .eq('user_id', userId)

  return !error
}

// ============================================
// REALTIME SUBSCRIPTION
// ============================================

export interface CommentRealtimeCallbacks {
  onInsert?: (comment: Comment) => void
  onUpdate?: (comment: Comment) => void
  onDelete?: (commentId: string) => void
}

export function subscribeToComments(
  postId: number,
  callbacks: CommentRealtimeCallbacks | ((comment: Comment) => void)
) {
  // Support legacy single callback or new object callbacks
  const cbs: CommentRealtimeCallbacks = typeof callbacks === 'function'
    ? { onInsert: callbacks }
    : callbacks

  const channel = supabase
    .channel(`comments:${postId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'comments',
        filter: `post_id=eq.${postId}`
      },
      async (payload) => {
        const { data } = await supabase
          .from('comments')
          .select('*, user:users!user_id(*)')
          .eq('id', payload.new.id)
          .single()

        if (data && cbs.onInsert) {
          cbs.onInsert(data as Comment)
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'comments',
        filter: `post_id=eq.${postId}`
      },
      async (payload) => {
        const { data } = await supabase
          .from('comments')
          .select('*, user:users!user_id(*)')
          .eq('id', payload.new.id)
          .single()

        if (data && cbs.onUpdate) {
          cbs.onUpdate(data as Comment)
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'comments',
        filter: `post_id=eq.${postId}`
      },
      (payload) => {
        if (cbs.onDelete) {
          cbs.onDelete(payload.old.id)
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

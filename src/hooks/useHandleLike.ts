import { useState, useCallback } from 'react'
import { likePost, unlikePost, type Post } from '../lib/api'
import { likeComment, unlikeComment, type Comment } from '../lib/commentsApi'

/**
 * Hook for handling likes on posts and comments
 * Based on Instagram clone pattern with loading state to prevent double-taps
 */
export default function useHandleLike() {
  const [loading, setLoading] = useState(false)

  const handlePostLike = useCallback(async (
    post: Post,
    userId: number,
    onUpdate?: (liked: boolean, newCount: number) => void
  ) => {
    if (loading) return
    setLoading(true)

    const currentLiked = post.liked ?? false
    const currentCount = post.likes_count ?? 0

    // Optimistic update
    const newLiked = !currentLiked
    const newCount = newLiked ? currentCount + 1 : Math.max(0, currentCount - 1)
    onUpdate?.(newLiked, newCount)

    try {
      if (currentLiked) {
        await unlikePost(userId, post.id)
      } else {
        await likePost(userId, post.id)
      }
    } catch (error) {
      // Revert on error
      console.error('Error updating post like:', error)
      onUpdate?.(currentLiked, currentCount)
    } finally {
      setLoading(false)
    }
  }, [loading])

  const handleCommentLike = useCallback(async (
    comment: Comment,
    userId: number,
    onUpdate?: (liked: boolean, newCount: number) => void
  ) => {
    if (loading) return
    setLoading(true)

    const currentLiked = comment.liked ?? false
    const currentCount = comment.likes_count ?? 0

    // Optimistic update
    const newLiked = !currentLiked
    const newCount = newLiked ? currentCount + 1 : Math.max(0, currentCount - 1)
    onUpdate?.(newLiked, newCount)

    try {
      if (currentLiked) {
        await unlikeComment(comment.id, userId)
      } else {
        await likeComment(comment.id, userId)
      }
    } catch (error) {
      // Revert on error
      console.error('Error updating comment like:', error)
      onUpdate?.(currentLiked, currentCount)
    } finally {
      setLoading(false)
    }
  }, [loading])

  return {
    handlePostLike,
    handleCommentLike,
    loading
  }
}

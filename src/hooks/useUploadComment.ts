import { useState, useCallback } from 'react'
import { addComment, type Comment } from '../lib/commentsApi'

/**
 * Hook for uploading comments
 * Based on Instagram clone pattern with loading state
 */
export default function useUploadComment(postId: number | null, userId: number) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const uploadComment = useCallback(async (
    content: string,
    replyToId?: string
  ): Promise<Comment | null> => {
    if (!postId || !content.trim() || isLoading) return null

    setIsLoading(true)
    setError(null)

    try {
      const comment = await addComment(postId, userId, content.trim(), replyToId)
      return comment
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to post comment'
      console.error('Error uploading comment:', err)
      setError(message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [postId, userId, isLoading])

  return {
    uploadComment,
    isLoading,
    error
  }
}

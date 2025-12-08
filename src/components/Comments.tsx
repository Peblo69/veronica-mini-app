import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, MoreHorizontal, Trash2, CheckCircle, Loader2, X } from 'lucide-react'
import { type User } from '../lib/api'
import {
  getComments,
  addComment,
  deleteComment,
  likeComment,
  unlikeComment,
  subscribeToComments,
  type Comment
} from '../lib/commentsApi'

interface CommentsProps {
  postId: number
  user: User
  onClose?: () => void
}

export default function Comments({ postId, user, onClose }: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadComments()

    const unsubscribe = subscribeToComments(postId, (newComment) => {
      // Skip own comments (already added by handleSubmit)
      if (newComment.user_id === user.telegram_id) return

      if (newComment.parent_id) {
        // Add as reply
        setComments(prev => prev.map(c => {
          if (c.id === newComment.parent_id) {
            return { ...c, replies: [...(c.replies || []), newComment] }
          }
          return c
        }))
      } else {
        // Add as top-level comment
        setComments(prev => [newComment, ...prev])
      }
    })

    return () => unsubscribe()
  }, [postId, user.telegram_id])

  const loadComments = async () => {
    setLoading(true)
    const data = await getComments(postId, user.telegram_id)
    setComments(data)
    setLoading(false)
  }

  const handleSubmit = async () => {
    if (!newComment.trim() || sending) return

    setSending(true)
    const comment = await addComment(
      postId,
      user.telegram_id,
      newComment.trim(),
      replyingTo?.id
    )

    if (comment) {
      if (replyingTo) {
        setComments(prev => prev.map(c => {
          if (c.id === replyingTo.id) {
            return { ...c, replies: [...(c.replies || []), comment] }
          }
          return c
        }))
      } else {
        setComments(prev => [comment, ...prev])
      }
      setNewComment('')
      setReplyingTo(null)
    }
    setSending(false)
  }

  const handleDelete = async (comment: Comment, parentId?: string) => {
    await deleteComment(comment.id, user.telegram_id, postId)

    if (parentId) {
      // Deleting a reply - remove from parent's replies array
      setComments(prev => prev.map(c => {
        if (c.id === parentId) {
          return { ...c, replies: (c.replies || []).filter(r => r.id !== comment.id) }
        }
        return c
      }))
    } else {
      // Deleting top-level comment
      setComments(prev => prev.filter(c => c.id !== comment.id))
    }
    setMenuOpen(null)
  }

  const handleLike = async (comment: Comment) => {
    if (comment.liked) {
      await unlikeComment(comment.id, user.telegram_id)
    } else {
      await likeComment(comment.id, user.telegram_id)
    }

    // Update state
    const updateLike = (c: Comment): Comment => {
      if (c.id === comment.id) {
        return {
          ...c,
          liked: !c.liked,
          likes_count: c.liked ? Math.max(0, c.likes_count - 1) : c.likes_count + 1
        }
      }
      if (c.replies) {
        return { ...c, replies: c.replies.map(updateLike) }
      }
      return c
    }
    setComments(prev => prev.map(updateLike))
  }

  const formatTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'now'
    if (mins < 60) return `${mins}m`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h`
    return `${Math.floor(hours / 24)}d`
  }

  const renderComment = (comment: Comment, isReply = false, parentId?: string) => (
    <motion.div
      key={comment.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2 ${isReply ? 'ml-10 mt-2' : ''}`}
    >
      <img
        src={comment.user?.avatar_url || `https://i.pravatar.cc/150?u=${comment.user_id}`}
        alt=""
        className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-white/10"
      />
      <div className="flex-1">
        <div className="bg-white/5 rounded-2xl px-3 py-2 border border-white/5">
          <div className="flex items-center gap-1">
            <span className="font-semibold text-sm text-white">
              {comment.user?.first_name || 'User'}
            </span>
            {comment.user?.is_verified && (
              <CheckCircle className="w-3 h-3 text-blue-400 fill-blue-400" />
            )}
          </div>
          <p className="text-sm text-white/90">{comment.content}</p>
        </div>

        <div className="flex items-center gap-3 mt-1 px-2">
          <span className="text-xs text-white/30">{formatTime(comment.created_at)}</span>
          <button
            onClick={() => handleLike(comment)}
            className={`text-xs font-medium ${comment.liked ? 'text-red-500' : 'text-white/40 hover:text-white/60'}`}
          >
            {comment.likes_count > 0 && comment.likes_count} Like
          </button>
          <button
            onClick={() => {
              setReplyingTo(comment)
              inputRef.current?.focus()
            }}
            className="text-xs font-medium text-white/40 hover:text-white/60"
          >
            Reply
          </button>
          {Number(comment.user_id) === Number(user.telegram_id) && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(menuOpen === comment.id ? null : comment.id)}
                className="text-white/30 hover:text-white/50"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              <AnimatePresence>
                {menuOpen === comment.id && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute right-0 top-6 bg-[#1c1c1e] shadow-lg rounded-lg py-1 z-10 min-w-[100px] border border-white/10"
                  >
                    <button
                      onClick={() => handleDelete(comment, parentId)}
                      className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-white/5 flex items-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-2">
            {comment.replies.map(reply => renderComment(reply, true, comment.id))}
          </div>
        )}
      </div>
    </motion.div>
  )

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {/* Header with drag handle */}
      <div className="sticky top-0 z-10 bg-[#0a0a0a] safe-area-top">
        {/* Drag handle */}
        {onClose && (
          <div className="flex justify-center pt-3 pb-1">
            <div
              className="w-10 h-1 bg-white/30 rounded-full cursor-pointer"
              onClick={onClose}
            />
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <h3 className="font-semibold text-white">Comments</h3>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors active:scale-95"
            >
              <X className="w-6 h-6 text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-white/30" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8 text-white/40">
            <p>No comments yet</p>
            <p className="text-sm text-white/25 mt-1">Be the first to comment!</p>
          </div>
        ) : (
          comments.map(comment => renderComment(comment))
        )}
      </div>

      {/* Reply indicator */}
      <AnimatePresence>
        {replyingTo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 py-2 bg-white/5 border-t border-white/5 flex items-center justify-between"
          >
            <span className="text-sm text-white/60">
              Replying to <strong className="text-white">{replyingTo.user?.first_name}</strong>
            </span>
            <button onClick={() => setReplyingTo(null)} className="p-1 hover:bg-white/10 rounded-full">
              <X className="w-4 h-4 text-white/40" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="p-3 border-t border-white/5 bg-black/50 backdrop-blur-lg pb-8">
        <div className="flex items-center gap-2">
          <img
            src={user.avatar_url || `https://i.pravatar.cc/150?u=${user.telegram_id}`}
            alt=""
            className="w-8 h-8 rounded-full object-cover border border-white/10"
          />
          <input
            ref={inputRef}
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={replyingTo ? `Reply to ${replyingTo.user?.first_name}...` : 'Add a comment...'}
            className="flex-1 px-4 py-2.5 rounded-full bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/20 transition-all"
          />
          <button
            onClick={handleSubmit}
            disabled={!newComment.trim() || sending}
            className="p-2.5 bg-blue-500 rounded-full text-white disabled:opacity-50 hover:bg-blue-600 transition-colors"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4 ml-0.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

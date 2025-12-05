import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Heart, MessageCircle } from 'lucide-react'
import { type User } from '../lib/api'
import {
  getComments,
  subscribeToComments,
  type Comment
} from '../lib/commentsApi'
import useUploadComment from '../hooks/useUploadComment'
import useHandleLike from '../hooks/useHandleLike'
import useKeyboardAware from '../hooks/useKeyboardAware'

interface CommentsSheetProps {
  isOpen: boolean
  onClose: () => void
  postId: number | null
  user: User
}

// Quick emoji buttons like Instagram
const QUICK_EMOJIS = ['❤️', '🙌', '🔥', '👏', '😢', '😍', '😮', '😂']

const REPLIES_PER_PAGE = 4

export default function CommentsSheet({ isOpen, onClose, postId, user }: CommentsSheetProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null)
  const [expandedReplies, setExpandedReplies] = useState<Record<string, number>>({}) // commentId -> how many visible
  const [justSent, setJustSent] = useState(false) // Track when we just sent to disable transition

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const commentsListRef = useRef<HTMLDivElement>(null)
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const keyboard = useKeyboardAware(isOpen)

  // Instagram-style hooks
  const { uploadComment, isLoading: sending } = useUploadComment(postId, user.telegram_id)
  const { handleCommentLike } = useHandleLike()

  // Load comments and setup subscription
  useEffect(() => {
    if (isOpen && postId) {
      loadComments()

      const unsubscribe = subscribeToComments(postId, (newComment) => {
        if (newComment.user_id === user.telegram_id) return

        if (newComment.parent_id) {
          setComments(prev => prev.map(c => {
            if (c.id === newComment.parent_id) {
              return { ...c, replies: [...(c.replies || []), newComment] }
            }
            return c
          }))
        } else {
          setComments(prev => [newComment, ...prev])
        }
      })

      return () => unsubscribe()
    } else {
      setComments([])
      setNewComment('')
      setReplyingTo(null)
      setExpandedReplies({})
    }
  }, [isOpen, postId])

  const loadComments = async () => {
    if (!postId) return
    setLoading(true)
    const data = await getComments(postId, user.telegram_id)
    setComments(data)
    setLoading(false)
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewComment(e.target.value)
    // Auto-expand textarea
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 80)}px`
  }

  // Keep input in view when keyboard opens
  useEffect(() => {
    if (keyboard.visible && inputContainerRef.current) {
      inputContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [keyboard.visible])

  const addQuickEmoji = (emoji: string) => {
    setNewComment(prev => prev + emoji)
    textareaRef.current?.focus()
  }

  // Ref to the sheet element for direct DOM manipulation
  const sheetRef = useRef<HTMLDivElement>(null)

  const handleSubmit = async () => {
    if (!newComment.trim() || sending || !postId) return

    const commentText = newComment.trim()
    const parentId = replyingTo?.id
    const parentComment = replyingTo

    // INSTANT snap to bottom - manipulate DOM directly BEFORE blur to prevent glitch
    // This must happen synchronously before keyboard closes
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'none'
      sheetRef.current.style.paddingBottom = 'calc(env(safe-area-inset-bottom, 0px) + 12px)'
    }

    setJustSent(true)
    textareaRef.current?.blur() // Close keyboard

    // Clear input
    setNewComment('')
    setReplyingTo(null)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }

    // Re-enable transitions after keyboard has fully closed
    setTimeout(() => {
      setJustSent(false)
      if (sheetRef.current) {
        sheetRef.current.style.transition = ''
        sheetRef.current.style.paddingBottom = ''
      }
    }, 600)

    const comment = await uploadComment(commentText, parentId)

    if (comment) {
      if (parentComment) {
        setComments(prev => prev.map(c => {
          if (c.id === parentComment.id) {
            const newReplies = [...(c.replies || []), comment]
            // Auto-expand to show the new reply
            setExpandedReplies(exp => ({ ...exp, [c.id]: newReplies.length }))
            return { ...c, replies: newReplies }
          }
          return c
        }))
      } else {
        setComments(prev => [comment, ...prev])
        // Scroll to new comment smoothly
        requestAnimationFrame(() => {
          commentsListRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
        })
      }
    }
  }

  const handleLikeComment = (comment: Comment) => {
    handleCommentLike(comment, user.telegram_id, (liked, newCount) => {
      const updateLike = (c: Comment): Comment => {
        if (c.id === comment.id) {
          return { ...c, liked, likes_count: newCount }
        }
        if (c.replies) {
          return { ...c, replies: c.replies.map(updateLike) }
        }
        return c
      }
      setComments(prev => prev.map(updateLike))
    })
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

  // Get how many replies to show for a comment
  const getVisibleRepliesCount = (commentId: string, totalReplies: number) => {
    return expandedReplies[commentId] ?? Math.min(REPLIES_PER_PAGE, totalReplies)
  }

  const showMoreReplies = (commentId: string, totalReplies: number) => {
    const current = getVisibleRepliesCount(commentId, totalReplies)
    setExpandedReplies(prev => ({
      ...prev,
      [commentId]: Math.min(current + REPLIES_PER_PAGE, totalReplies)
    }))
  }

  // Render a single reply (smaller than main comment)
  const renderReply = (reply: Comment, parentComment: Comment) => (
    <div key={reply.id} className="flex gap-2 mt-3">
      <img
        src={reply.user?.avatar_url || `https://i.pravatar.cc/150?u=${reply.user_id}`}
        alt=""
        className="w-6 h-6 rounded-full object-cover flex-shrink-0 bg-[#333]"
      />
      <div className="flex-1 min-w-0">
        <div>
          <span className="font-semibold text-[13px] text-white mr-1.5">
            {reply.user?.username || reply.user?.first_name}
          </span>
          <span className="text-[13px] text-white/85 leading-snug whitespace-pre-wrap break-words">
            {reply.content}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[11px] text-gray-500">{formatTime(reply.created_at)}</span>
          {(reply.likes_count || 0) > 0 && (
            <span className="text-[11px] text-gray-500 font-medium">
              {reply.likes_count} {reply.likes_count === 1 ? 'like' : 'likes'}
            </span>
          )}
          <button
            className="text-[11px] font-semibold text-gray-500 active:text-gray-300"
            onClick={() => {
              setReplyingTo(parentComment)
              textareaRef.current?.focus()
            }}
          >
            Reply
          </button>
        </div>
      </div>
      <button
        onClick={() => handleLikeComment(reply)}
        className="pt-1 active:scale-90 transition-transform"
      >
        <Heart
          className={`w-2.5 h-2.5 ${reply.liked ? 'fill-red-500 text-red-500' : 'text-gray-500'}`}
        />
      </button>
    </div>
  )

  // Instagram-style comment with proper spacing
  const renderComment = (comment: Comment) => {
    const replies = comment.replies || []
    const totalReplies = replies.length
    const visibleCount = getVisibleRepliesCount(comment.id, totalReplies)
    const visibleReplies = replies.slice(0, visibleCount)
    const hiddenCount = totalReplies - visibleCount

    return (
      <div key={comment.id} className="mt-[15px] first:mt-0">
        <div className="flex gap-3">
          <img
            src={comment.user?.avatar_url || `https://i.pravatar.cc/150?u=${comment.user_id}`}
            alt=""
            className="w-9 h-9 rounded-full object-cover flex-shrink-0 bg-[#333]"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <span className="font-semibold text-[15px] text-white mr-2">
                  {comment.user?.username || comment.user?.first_name}
                </span>
                <span className="text-[15px] text-white/90 leading-relaxed whitespace-pre-wrap break-words">
                  {comment.content}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4 mt-2">
              <span className="text-xs text-gray-500">{formatTime(comment.created_at)}</span>
              {(comment.likes_count || 0) > 0 && (
                <span className="text-xs text-gray-500 font-semibold">
                  {comment.likes_count} {comment.likes_count === 1 ? 'like' : 'likes'}
                </span>
              )}
              <button
                className="text-xs font-semibold text-gray-500 active:text-gray-300"
                onClick={() => {
                  setReplyingTo(comment)
                  textareaRef.current?.focus()
                }}
              >
                Reply
              </button>
            </div>
          </div>

          <button
            onClick={() => handleLikeComment(comment)}
            className="pt-2 active:scale-90 transition-transform"
          >
            <Heart
              className={`w-3 h-3 ${comment.liked ? 'fill-red-500 text-red-500' : 'text-gray-500'}`}
            />
          </button>
        </div>

        {/* Replies section - indented, smaller */}
        {totalReplies > 0 && (
          <div className="ml-12 mt-2">
            {visibleReplies.map(reply => renderReply(reply, comment))}

            {/* View more replies button */}
            {hiddenCount > 0 && (
              <button
                onClick={() => showMoreReplies(comment.id, totalReplies)}
                className="flex items-center gap-2 mt-3 text-[12px] font-semibold text-gray-500 active:text-gray-300"
              >
                <div className="w-6 h-px bg-gray-600" />
                View {hiddenCount} more {hiddenCount === 1 ? 'reply' : 'replies'}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <AnimatePresence mode="sync">
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/70 backdrop-blur-[2px] z-[9998]"
            onClick={() => {
              textareaRef.current?.blur()
              onClose()
            }}
          />

          {/* Sheet - fixed position, relies on app-height vars to avoid vh jitter on iOS */}
          <motion.div
            ref={sheetRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{
              type: 'tween',
              duration: 0.18,
              ease: [0.32, 0.72, 0, 1]
            }}
            className="fixed inset-x-0 bottom-0 z-[9999] bg-[#0c0c0c] rounded-t-[16px] flex flex-col overflow-hidden will-change-transform shadow-[0_-14px_60px_rgba(0,0,0,0.45)] border border-white/5 border-b-0"
            style={{
              height: 'calc(var(--app-height) - 96px)',
              maxHeight: 'calc(var(--app-height) - 72px)',
              paddingBottom: justSent
                ? 'calc(env(safe-area-inset-bottom, 0px) + 12px)' // Force bottom position immediately
                : keyboard.visible
                  ? `calc(var(--keyboard-height) + env(safe-area-inset-bottom, 0px) + 10px)`
                  : 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
              transition: justSent ? 'none' : 'padding-bottom 0.08s linear', // No transition when just sent
              transform: 'translateZ(0)',
            }}
          >
            {/* Handle bar */}
            <div
              className="flex justify-center pt-3 pb-2 cursor-pointer flex-shrink-0"
              onClick={onClose}
            >
              <div className="w-9 h-1 bg-[#555] rounded-full" />
            </div>

            {/* Header */}
            <div className="text-center pb-3 border-b border-[#1f1f1f] flex-shrink-0">
              <h3 className="font-semibold text-white text-base tracking-tight">Comments</h3>
            </div>

            {/* Comments List */}
            <div
              ref={commentsListRef}
              className="flex-1 overflow-y-auto px-4 overscroll-contain"
              style={{ minHeight: 0, background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0))' }}
            >
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-16">
                  <div className="w-20 h-20 bg-[#363636] rounded-full flex items-center justify-center mx-auto mb-4">
                    <MessageCircle className="w-10 h-10 text-gray-500" />
                  </div>
                  <h3 className="font-semibold text-white text-xl mb-2">No comments yet</h3>
                  <p className="text-sm text-gray-500">Start the conversation.</p>
                </div>
              ) : (
                <div className="py-4">
                  {comments.map(c => renderComment(c))}
                </div>
              )}
            </div>

            {/* Input Area - sticky at bottom, let iOS keyboard push it up naturally */}
            <div
              ref={inputContainerRef}
              className="border-t border-[#1f1f1f] bg-[#0c0c0c] flex-shrink-0 pb-[env(safe-area-inset-bottom)]"
            >
              {/* Quick Emoji Row */}
              <div className="flex justify-around px-6 py-3">
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => addQuickEmoji(emoji)}
                    className="text-[22px] active:scale-90 transition-transform"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Reply indicator */}
              {replyingTo && (
                <div className="flex justify-between items-center px-4 py-2 bg-[#363636] mx-4 rounded-lg text-xs text-gray-400 mb-2">
                  <span>
                    Replying to <span className="font-semibold text-white">{replyingTo.user?.username || 'User'}</span>
                  </span>
                  <button onClick={() => setReplyingTo(null)} className="p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Input Row */}
              <div className="flex items-center gap-3 px-4 pb-3">
                <img
                  src={user.avatar_url || `https://i.pravatar.cc/150?u=${user.telegram_id}`}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover flex-shrink-0 bg-[#333]"
                />
                <div className="flex-1 flex items-center bg-[#151515] border border-[#2e2e2e] rounded-full px-4 py-2 focus-within:border-[#444] transition-colors">
                  <textarea
                    ref={textareaRef}
                    value={newComment}
                    onChange={handleTextareaChange}
                    placeholder={replyingTo ? "Reply..." : "Add a comment..."}
                    rows={1}
                    enterKeyHint="send"
                    className="flex-1 bg-transparent text-white text-[15px] placeholder-[#888] focus:outline-none resize-none max-h-20"
                    style={{ minHeight: '22px' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSubmit()
                      }
                    }}
                  />
                  {newComment.trim() && (
                    <button
                      onClick={handleSubmit}
                      disabled={sending}
                      className="text-[#0095f6] font-semibold text-[15px] ml-2 disabled:opacity-50"
                    >
                      {sending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        'Post'
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

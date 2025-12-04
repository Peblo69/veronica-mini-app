import { useState, useEffect, useRef, useCallback } from 'react'
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

export default function CommentsSheet({ isOpen, onClose, postId, user }: CommentsSheetProps) {
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loading, setLoading] = useState(true)
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const commentsListRef = useRef<HTMLDivElement>(null)

  // Instagram-style hooks
  const { uploadComment, isLoading: sending } = useUploadComment(postId, user.telegram_id)
  const { handleCommentLike } = useHandleLike()
  const keyboard = useKeyboardAware(isOpen)

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
    }
  }, [isOpen, postId])

  // Scroll input into view when keyboard opens
  useEffect(() => {
    if (keyboard.visible && inputContainerRef.current) {
      setTimeout(() => {
        inputContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
      }, 100)
    }
  }, [keyboard.visible])

  const loadComments = async () => {
    if (!postId) return
    setLoading(true)
    const data = await getComments(postId, user.telegram_id)
    setComments(data)
    setLoading(false)
  }

  const handleFocus = useCallback(() => {
    // iOS keyboard focus handling
    setTimeout(() => {
      inputContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }, 300)
  }, [])

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewComment(e.target.value)
    // Auto-expand textarea
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 80)}px`
  }

  const addQuickEmoji = (emoji: string) => {
    setNewComment(prev => prev + emoji)
    textareaRef.current?.focus()
  }

  const handleSubmit = async () => {
    if (!newComment.trim() || sending || !postId) return

    const comment = await uploadComment(newComment.trim(), replyingTo?.id)

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
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }

      // Scroll to new comment
      setTimeout(() => {
        commentsListRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      }, 100)
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

  const renderComment = (comment: Comment, isReply = false) => (
    <div key={comment.id} className={`flex gap-3 mb-4 ${isReply ? 'ml-11' : ''}`}>
      <img
        src={comment.user?.avatar_url || `https://i.pravatar.cc/150?u=${comment.user_id}`}
        alt=""
        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-sm text-white">
            {comment.user?.username || comment.user?.first_name}
          </span>
          <span className="text-[13px] text-gray-200 leading-snug whitespace-pre-wrap break-words">
             {comment.content}
          </span>
        </div>

        <div className="flex items-center gap-4 mt-1">
          <span className="text-xs text-gray-400">{formatTime(comment.created_at)}</span>
          {(comment.likes_count || 0) > 0 && (
            <span className="text-xs text-gray-400 font-medium">
              {comment.likes_count} {comment.likes_count === 1 ? 'like' : 'likes'}
            </span>
          )}
          <button
            className="text-xs font-semibold text-gray-400 active:text-gray-200"
            onClick={() => {
              setReplyingTo(comment)
              textareaRef.current?.focus()
            }}
          >
            Reply
          </button>
        </div>

        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-4">
            {comment.replies.map(reply => renderComment(reply, true))}
          </div>
        )}
      </div>

      <button
        onClick={() => handleLikeComment(comment)}
        className="pt-1 active:scale-90 transition-transform"
      >
        <Heart
          className={`w-3.5 h-3.5 ${comment.liked ? 'fill-red-500 text-red-500' : 'text-gray-500'}`}
        />
      </button>
    </div>
  )

  // Calculate sheet height based on keyboard
  const sheetHeight = keyboard.visible
    ? `calc(100% - ${keyboard.height}px - env(safe-area-inset-top, 0px))`
    : '75vh'

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-[60]"
            onClick={() => {
              textareaRef.current?.blur()
              onClose()
            }}
          />

          {/* Sheet - Instagram style with proper keyboard handling */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-0 right-0 z-[70] bg-[#232325] rounded-t-[25px] shadow-2xl flex flex-col"
            style={{
              bottom: keyboard.visible ? keyboard.height : 0,
              height: sheetHeight,
              maxHeight: keyboard.visible ? `calc(100vh - ${keyboard.height}px - 20px)` : '75vh',
            }}
          >
            {/* Handle bar - Instagram style */}
            <div className="flex justify-center pt-2 pb-1" onClick={onClose}>
              <div className="w-10 h-1 bg-gray-500 rounded-full" />
            </div>

            {/* Header - Instagram style */}
            <div className="text-center py-3 border-b border-gray-600">
              <h3 className="font-bold text-white text-lg">Comments</h3>
            </div>

            {/* Comments List - scrollable */}
            <div
              ref={commentsListRef}
              className="flex-1 overflow-y-auto p-4 overscroll-contain"
              style={{
                height: keyboard.visible ? 'auto' : undefined,
                maxHeight: keyboard.visible ? '48vh' : undefined
              }}
            >
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
                    <MessageCircle className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="font-semibold text-white text-xl mb-1">No comments yet</h3>
                  <p className="text-sm text-gray-400">Start the conversation.</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {comments.map(c => renderComment(c))}
                </div>
              )}
            </div>

            {/* Input Area - Instagram style with emoji buttons */}
            <div
              ref={inputContainerRef}
              className="border-t border-gray-600 bg-[#232325]"
              style={{ paddingBottom: keyboard.visible ? 8 : 'max(12px, env(safe-area-inset-bottom))' }}
            >
              {/* Quick Emoji Row - Instagram style */}
              <div className="flex justify-between px-5 py-3">
                {QUICK_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => addQuickEmoji(emoji)}
                    className="text-2xl active:scale-90 transition-transform"
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Reply indicator */}
              {replyingTo && (
                <div className="flex justify-between items-center px-4 py-2 bg-gray-700/50 mx-3 rounded-lg text-xs text-gray-300 mb-2">
                  <span>
                    Replying to <span className="font-bold text-white">{replyingTo.user?.username || 'User'}</span>
                  </span>
                  <button onClick={() => setReplyingTo(null)} className="p-1">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Input Row - Instagram style */}
              <div className="flex items-center gap-3 px-4 pb-2">
                <img
                  src={user.avatar_url || `https://i.pravatar.cc/150?u=${user.telegram_id}`}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                />
                <div className="flex-1 flex items-center bg-transparent border border-gray-500 rounded-full px-4 py-2">
                  <textarea
                    ref={textareaRef}
                    value={newComment}
                    onChange={handleTextareaChange}
                    onFocus={handleFocus}
                    placeholder={replyingTo ? "Reply..." : "Add a comment..."}
                    rows={1}
                    enterKeyHint="send"
                    className="flex-1 bg-transparent text-white text-[15px] placeholder-gray-500 focus:outline-none resize-none max-h-20"
                    style={{ minHeight: '24px' }}
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
                      className="text-blue-500 font-bold text-[17px] ml-2 disabled:opacity-50"
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

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Heart, MessageCircle, Bookmark, Share2, MoreHorizontal,
  Trash2, Edit2, CheckCircle, Lock, Loader2
} from 'lucide-react'
import { type User, type Post, editPost, deletePost, likePost, unlikePost, savePost, unsavePost } from '../lib/api'
import Comments from './Comments'
import { useInViewport } from '../hooks/useInViewport'
import { useConnectionQuality } from '../hooks/useConnectionQuality'

interface PostDetailProps {
  post: Post
  user: User
  onBack: () => void
  onDeleted?: () => void
  onUpdated?: (post: Post) => void
}

export default function PostDetail({ post, user, onBack, onDeleted, onUpdated }: PostDetailProps) {
  const [currentPost, setCurrentPost] = useState(post)
  const [showComments, setShowComments] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(post.content || '')
  const [editVisibility, setEditVisibility] = useState(post.visibility)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const isOwner = Number(post.creator_id) === Number(user.telegram_id)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const videoContainerRef = useRef<HTMLDivElement | null>(null)
  const isVideoVisible = useInViewport(videoContainerRef, { minimumRatio: 0.5 })
  const { isSlow, isDataSaver } = useConnectionQuality()
  const canAutoPlay = !(isSlow || isDataSaver)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (!isVideoVisible && !video.paused) {
      video.pause()
      return
    }

    if (isVideoVisible && canAutoPlay && !video.paused) {
      video.play().catch(() => {})
    }
  }, [isVideoVisible, canAutoPlay])

  const handleLike = async () => {
    if (currentPost.liked) {
      await unlikePost(user.telegram_id, currentPost.id)
      setCurrentPost(p => ({ ...p, liked: false, likes_count: Math.max(0, (p.likes_count || 0) - 1) }))
    } else {
      await likePost(user.telegram_id, currentPost.id)
      setCurrentPost(p => ({ ...p, liked: true, likes_count: (p.likes_count || 0) + 1 }))
    }
  }

  const handleSave = async () => {
    if (currentPost.saved) {
      await unsavePost(user.telegram_id, currentPost.id)
      setCurrentPost(p => ({ ...p, saved: false }))
    } else {
      await savePost(user.telegram_id, currentPost.id)
      setCurrentPost(p => ({ ...p, saved: true }))
    }
  }

  const handleEdit = async () => {
    if (!editContent.trim()) return

    setIsSaving(true)
    const { data, error } = await editPost(currentPost.id, user.telegram_id, {
      content: editContent,
      visibility: editVisibility
    })

    if (data && !error) {
      setCurrentPost(p => ({ ...p, content: editContent, visibility: editVisibility }))
      setIsEditing(false)
      onUpdated?.({ ...currentPost, content: editContent, visibility: editVisibility })
    }
    setIsSaving(false)
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const { success } = await deletePost(currentPost.id, currentPost.creator_id)
      if (success) {
        setShowDeleteConfirm(false)
        onDeleted?.()
        onBack()
      } else {
        setDeleteError('Unable to delete post. Please try again.')
      }
    } catch {
      setDeleteError('Something went wrong. Please try again.')
    }
    setIsDeleting(false)
  }

  const formatTime = (date: string) => {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  return (
    <motion.div 
      className="fixed inset-0 bg-white/95 backdrop-blur-3xl z-[100] flex flex-col h-[100dvh]"
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white/80 backdrop-blur-md sticky top-0 z-10 border-b border-gray-100 safe-area-top">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-gray-700" />
        </button>
        <span className="font-bold text-lg text-gray-800">Post</span>
        {isOwner ? (
          <div className="relative">
            <button 
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <MoreHorizontal className="w-6 h-6 text-gray-700" />
            </button>
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  className="absolute right-0 top-12 bg-white shadow-xl rounded-xl py-2 z-20 min-w-[140px] border border-gray-100"
                >
                  <button
                    onClick={() => { setIsEditing(true); setShowMenu(false) }}
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2.5 text-gray-700"
                  >
                    <Edit2 className="w-4 h-4" /> Edit Post
                  </button>
                  <button
                    onClick={() => { setShowDeleteConfirm(true); setShowMenu(false) }}
                    className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 flex items-center gap-2.5"
                  >
                    <Trash2 className="w-4 h-4" /> Delete Post
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : <div className="w-10" />}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50/30">
        <div className="max-w-2xl mx-auto bg-white shadow-sm min-h-full pb-20">
          {/* Creator info */}
          <div className="flex items-center gap-3 p-4">
            <div className="relative">
              <img
                src={currentPost.creator?.avatar_url || `https://i.pravatar.cc/150?u=${currentPost.creator_id}`}
                alt=""
                className="w-12 h-12 rounded-full object-cover border border-gray-100"
              />
              {currentPost.creator?.is_verified && (
                <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-[2px]">
                  <CheckCircle className="w-4 h-4 text-of-blue fill-of-blue" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1">
                <span className="font-bold text-gray-900">{currentPost.creator?.first_name || 'Creator'}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                <span>@{currentPost.creator?.username}</span>
                <span>·</span>
                <span>{formatTime(currentPost.created_at)}</span>
              </div>
            </div>
            {currentPost.visibility !== 'public' && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 rounded-full text-xs font-semibold text-gray-600">
                <Lock className="w-3 h-3" />
                <span className="capitalize">{currentPost.visibility}</span>
              </div>
            )}
            {currentPost.is_nsfw && (
              <span className="bg-orange-100 text-orange-600 text-xs font-bold px-2.5 py-1 rounded-full border border-orange-200">18+</span>
            )}
          </div>

          {/* Content Text (if above media) */}
          {!isEditing && currentPost.content && (
             <p className="px-5 pb-3 text-[15px] leading-relaxed text-gray-800 whitespace-pre-wrap">{currentPost.content}</p>
          )}

          {/* Media */}
          {currentPost.media_url && (
            <div className="relative bg-gray-100 w-full" ref={videoContainerRef}>
              {currentPost.media_url.match(/\.(mp4|webm|mov|m4v)(\?|$)/i) ? (
                <>
                  <video
                    ref={videoRef}
                    src={currentPost.media_url}
                    controls={!canAutoPlay}
                    playsInline
                    preload={canAutoPlay ? 'auto' : 'metadata'}
                    poster={currentPost.media_thumbnail || undefined}
                    className="w-full max-h-[70vh] object-contain bg-black"
                  />
                  {!canAutoPlay && (
                    <div className="absolute bottom-4 left-4 right-4">
                      <div className="flex items-center justify-between bg-black/60 text-white text-xs font-semibold px-3 py-2 rounded-full shadow-lg">
                        <span>Tap play (data saver)</span>
                        <button
                          onClick={() => videoRef.current?.play().catch(() => {})}
                          className="text-of-blue font-bold"
                        >
                          Play
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <img
                  src={currentPost.media_url}
                  alt=""
                  className="w-full h-auto object-contain bg-gray-50"
                />
              )}
            </div>
          )}

          {/* Edit Mode */}
          {isEditing && (
            <div className="p-4 space-y-4 bg-gray-50 border-y border-gray-100">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full p-4 border border-gray-200 rounded-xl min-h-[120px] focus:outline-none focus:ring-2 focus:ring-of-blue/50 bg-white text-[15px]"
                placeholder="What's on your mind?"
              />
              <div className="flex gap-3">
                <select
                  value={editVisibility}
                  onChange={(e) => setEditVisibility(e.target.value as any)}
                  className="px-4 py-2.5 border border-gray-200 rounded-xl bg-white text-sm font-medium outline-none focus:ring-2 focus:ring-of-blue/50"
                >
                  <option value="public">Public</option>
                  <option value="followers">Followers</option>
                  <option value="subscribers">Subscribers</option>
                </select>
                <div className="flex-1 flex gap-2 justify-end">
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-6 py-2.5 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEdit}
                    disabled={isSaving}
                    className="px-6 py-2.5 bg-of-blue text-white rounded-xl text-sm font-bold shadow-lg shadow-of-blue/30 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center min-w-[80px]"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 mt-2">
            <div className="flex items-center gap-6">
              <button
                onClick={handleLike}
                className={`flex items-center gap-2 group transition-colors ${currentPost.liked ? 'text-purple-900' : 'text-gray-600'}`}
              >
                <div className={`p-2 rounded-full transition-colors ${currentPost.liked ? 'bg-purple-50' : 'group-hover:bg-gray-100'}`}>
                  <Heart className={`w-7 h-7 transition-transform ${currentPost.liked ? 'text-purple-900 fill-purple-900 scale-110' : 'group-hover:scale-110'}`} />
                </div>
                <span className={`font-medium ${currentPost.liked ? 'text-purple-900' : 'text-gray-500'}`}>{currentPost.likes_count}</span>
              </button>
              
              <button
                onClick={() => setShowComments(true)}
                className="flex items-center gap-2 text-gray-600 group"
              >
                <div className="p-2 rounded-full group-hover:bg-gray-100 transition-colors">
                  <MessageCircle className="w-7 h-7 group-hover:text-of-blue transition-colors" />
                </div>
                <span className="font-medium text-gray-500 group-hover:text-of-blue">{currentPost.comments_count}</span>
              </button>
              
              <button className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors">
                <Share2 className="w-7 h-7" />
              </button>
            </div>
            
            <button
              onClick={handleSave}
              className={`p-2 rounded-full hover:bg-gray-100 transition-colors ${currentPost.saved ? 'text-of-blue' : 'text-gray-600'}`}
            >
              <Bookmark className={`w-7 h-7 ${currentPost.saved ? 'fill-of-blue' : ''}`} />
            </button>
          </div>

          {/* Inline comments preview */}
          <div className="p-6">
            <button
              onClick={() => setShowComments(true)}
              className="text-gray-500 text-sm font-medium hover:text-gray-700 transition-colors"
            >
              View all {currentPost.comments_count} comments...
            </button>
          </div>
        </div>
      </div>

      {/* Comments modal */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 bg-white z-[110] flex flex-col h-[100dvh]"
          >
            <div className="flex-1 overflow-hidden relative flex flex-col">
              <Comments postId={currentPost.id} user={user} onClose={() => setShowComments(false)} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirmation */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[120] p-6"
            onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mb-4 mx-auto">
                <Trash2 className="w-7 h-7 text-red-500" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-center text-gray-900">Delete Post?</h3>
              <p className="text-gray-500 mb-4 text-center text-sm">This action cannot be undone. The post will be permanently removed.</p>

              {deleteError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl">
                  <p className="text-red-600 text-sm text-center font-medium">{deleteError}</p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}
                  className="flex-1 py-3 border border-gray-200 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 py-3 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors flex items-center justify-center shadow-lg shadow-red-500/30 disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Delete'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

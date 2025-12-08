import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, MoreHorizontal,
  Trash2, Edit2, CheckCircle, Lock, Loader2, Heart, Volume2, VolumeX
} from 'lucide-react'
import { PixelHeart, PixelComment, PixelShare, PixelBookmark, PixelStar } from './PixelIcons'
import { type User, type Post, editPost, deletePost, likePost, unlikePost, savePost, unsavePost } from '../lib/api'
import CommentsSheet from './CommentsSheet'

interface PostDetailProps {
  post: Post
  user: User
  onBack: () => void
  onDeleted?: () => void
  onUpdated?: (post: Post) => void
}

// Compact media carousel
function PostMediaCarousel({
  urls,
  muted,
  onMuteChange,
  onDoubleTap
}: {
  urls: string[]
  muted?: boolean
  onMuteChange?: (muted: boolean) => void
  onDoubleTap?: () => void
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [showHeart, setShowHeart] = useState(false)
  const lastTap = useRef<number>(0)

  const handleScroll = () => {
    if (!containerRef.current) return
    const scrollLeft = containerRef.current.scrollLeft
    const width = containerRef.current.offsetWidth
    const newIndex = Math.round(scrollLeft / width)
    if (newIndex !== currentIndex) {
      setCurrentIndex(newIndex)
    }
  }

  const handleTap = () => {
    const now = Date.now()
    if (now - lastTap.current < 300) {
      onDoubleTap?.()
      setShowHeart(true)
      setTimeout(() => setShowHeart(false), 500)
    }
    lastTap.current = now
  }

  const isVideo = (url: string) => url.match(/\.(mp4|webm|mov|m4v)(\?|$)/i)

  if (urls.length === 0) return null

  return (
    <div className="relative w-full bg-black">
      <div
        ref={containerRef}
        className="flex w-full overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        onScroll={handleScroll}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        onClick={handleTap}
      >
        {urls.map((url, index) => (
          <div key={index} className="flex-none w-full snap-center flex items-center justify-center min-h-[220px] max-h-[50vh]">
            {isVideo(url) ? (
              <div className="relative w-full h-full">
                <video
                  ref={index === currentIndex ? videoRef : undefined}
                  src={url}
                  controls={false}
                  playsInline
                  loop
                  muted={muted}
                  autoPlay={currentIndex === index}
                  preload="auto"
                  className="w-full max-h-[50vh] object-contain bg-black"
                />
                <button
                  onClick={(e) => { e.stopPropagation(); onMuteChange?.(!muted) }}
                  className="absolute bottom-3 right-3 p-2 bg-black/70 rounded-full"
                >
                  {muted ? (
                    <VolumeX className="w-5 h-5 text-white" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-white" />
                  )}
                </button>
              </div>
            ) : (
              <img
                src={url}
                alt=""
                loading="eager"
                className="w-full max-h-[50vh] object-contain bg-black select-none"
              />
            )}
          </div>
        ))}
      </div>

      {/* Double-tap heart */}
      {showHeart && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <Heart className="w-16 h-16 text-white fill-white opacity-90 animate-ping" />
        </div>
      )}

      {/* Dot indicators */}
      {urls.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {urls.map((_, index) => (
            <div
              key={index}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                index === currentIndex ? 'bg-white' : 'bg-white/40'
              }`}
            />
          ))}
        </div>
      )}

      {/* Image counter */}
      {urls.length > 1 && (
        <div className="absolute top-2 right-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-full z-10 font-medium">
          {currentIndex + 1}/{urls.length}
        </div>
      )}
    </div>
  )
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
  const [muted, setMuted] = useState(true)

  const isOwner = Number(post.creator_id) === Number(user.telegram_id)

  const mediaUrls = currentPost.media_urls && currentPost.media_urls.length > 0
    ? currentPost.media_urls
    : currentPost.media_url
      ? [currentPost.media_url]
      : []

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
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'now'
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays < 7) return `${diffDays}d`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <motion.div
      className="fixed inset-0 bg-black z-[100] flex flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {/* Back button - prominent, positioned below safe area */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-black"
        style={{ paddingTop: 'max(60px, calc(env(safe-area-inset-top, 0px) + 50px))' }}
      >
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
          <span className="text-white text-sm font-medium">Back</span>
        </button>

        {isOwner ? (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <MoreHorizontal className="w-5 h-5 text-white" />
            </button>
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.1 }}
                  className="absolute right-0 top-10 bg-[#1c1c1e] shadow-xl rounded-xl py-1 z-20 min-w-[120px] border border-white/10"
                >
                  <button
                    onClick={() => { setIsEditing(true); setShowMenu(false) }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-white/10 flex items-center gap-2 text-white"
                  >
                    <Edit2 className="w-4 h-4" /> Edit
                  </button>
                  <button
                    onClick={() => { setShowDeleteConfirm(true); setShowMenu(false) }}
                    className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : <div className="w-10" />}
      </div>

      {/* Creator info row */}
      <div className="flex items-center gap-3 px-4 pb-2">
        <img
          src={currentPost.creator?.avatar_url || `https://i.pravatar.cc/150?u=${currentPost.creator_id}`}
          alt=""
          className="w-9 h-9 rounded-full object-cover border border-white/10"
        />
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm text-white">{currentPost.creator?.username || 'Creator'}</span>
            {currentPost.creator?.is_verified && (
              <CheckCircle className="w-3.5 h-3.5 text-blue-400 fill-blue-400" />
            )}
            {currentPost.visibility !== 'public' && (
              <Lock className="w-3 h-3 text-white/50" />
            )}
          </div>
          <span className="text-white/50 text-xs">{formatTime(currentPost.created_at)}</span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto bg-black">
        {/* Media - compact */}
        {mediaUrls.length > 0 && (
          <PostMediaCarousel
            urls={mediaUrls}
            muted={muted}
            onMuteChange={setMuted}
            onDoubleTap={handleLike}
          />
        )}

        {/* Content Text */}
        {!isEditing && currentPost.content && (
          <p className="px-4 py-2 text-sm leading-relaxed text-white/90 whitespace-pre-wrap">{currentPost.content}</p>
        )}

        {/* Edit Mode */}
        {isEditing && (
          <div className="p-3 space-y-2 bg-[#0a0a0a] border-y border-white/5">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full p-2 border border-white/10 rounded-lg min-h-[80px] focus:outline-none focus:border-white/20 bg-black text-xs text-white placeholder-white/30"
              placeholder="What's on your mind?"
            />
            <div className="flex gap-2">
              <select
                value={editVisibility}
                onChange={(e) => setEditVisibility(e.target.value as any)}
                className="px-2 py-1.5 border border-white/10 rounded-lg bg-black text-xs text-white outline-none"
              >
                <option value="public">Public</option>
                <option value="followers">Followers</option>
                <option value="subscribers">Subscribers</option>
              </select>
              <div className="flex-1 flex gap-2 justify-end">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 border border-white/10 rounded-lg text-xs font-medium hover:bg-white/5 transition-colors text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEdit}
                  disabled={isSaving}
                  className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-semibold hover:bg-blue-600 transition-colors flex items-center justify-center min-w-[50px]"
                >
                  {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Actions Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-5">
            <button
              onClick={handleLike}
              className={`flex items-center gap-1.5 transition-colors ${currentPost.liked ? 'text-red-500' : 'text-white/70'}`}
            >
              <PixelHeart className={`w-6 h-6 ${currentPost.liked ? 'scale-110' : ''}`} filled={currentPost.liked} />
              <span className="text-sm font-medium">{currentPost.likes_count || 0}</span>
            </button>

            <button
              onClick={() => setShowComments(true)}
              className="flex items-center gap-1.5 text-white/70"
            >
              <PixelComment className="w-6 h-6" />
              <span className="text-sm font-medium">{currentPost.comments_count || 0}</span>
            </button>

            <button className="text-white/70">
              <PixelShare className="w-6 h-6" />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleSave}
              className={`transition-colors ${currentPost.saved ? 'text-blue-400' : 'text-white/70'}`}
            >
              <PixelBookmark className="w-6 h-6" filled={currentPost.saved} />
            </button>

            <button className="flex items-center gap-1">
              <PixelStar
                className={`w-6 h-6 ${(currentPost.gifts_count || 0) > 0 ? 'text-yellow-400' : 'text-white/70'}`}
                filled={(currentPost.gifts_count || 0) > 0}
              />
              {(currentPost.gifts_count || 0) > 0 && (
                <span className="text-xs font-bold text-yellow-400">{currentPost.gifts_count}</span>
              )}
            </button>
          </div>
        </div>

        {/* Comments preview - tap to open sheet */}
        <button
          onClick={() => setShowComments(true)}
          className="w-full px-4 py-3 text-left"
        >
          {currentPost.comments_count > 0 ? (
            <span className="text-white/50 text-sm font-medium">
              View all {currentPost.comments_count} comments
            </span>
          ) : (
            <span className="text-white/50 text-sm">Add a comment...</span>
          )}
        </button>
      </div>

      {/* Comments Sheet */}
      <CommentsSheet
        isOpen={showComments}
        onClose={() => setShowComments(false)}
        postId={currentPost.id}
        user={user}
      />

      {/* Delete confirmation */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-[120] p-4"
            onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="bg-[#1c1c1e] rounded-2xl p-5 max-w-xs w-full border border-white/10"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-10 h-10 bg-red-500/10 rounded-full flex items-center justify-center mb-3 mx-auto">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-base font-bold mb-1.5 text-center text-white">Delete Post?</h3>
              <p className="text-white/50 mb-3 text-center text-xs">This action cannot be undone.</p>

              {deleteError && (
                <div className="mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <p className="text-red-400 text-xs text-center">{deleteError}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteError(null); }}
                  className="flex-1 py-2 border border-white/10 rounded-xl font-medium text-white text-sm"
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 py-2 bg-red-500 text-white rounded-xl font-semibold text-sm flex items-center justify-center disabled:opacity-50"
                >
                  {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

import { useState, useEffect, useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, MessageCircle, Bookmark, Share2, MoreHorizontal, CheckCircle, Lock, Eye, X, Users, Trash2, EyeOff, Edit3, Flag, Copy, UserX, Volume2, VolumeX, Play, Star } from 'lucide-react'
import { getFeed, getSuggestedCreators, likePost, unlikePost, savePost, unsavePost, deletePost, getPostLikes, subscribeToFeedUpdates, type User, type Post } from '../lib/api'
import { unlockPostWithPayment } from '../lib/paymentsApi'
import { getLivestreams, subscribeToLivestreams, type Livestream } from '../lib/livestreamApi'
import PostDetail from '../components/PostDetail'
import BottomSheet from '../components/BottomSheet'
import CommentsSheet from '../components/CommentsSheet'
import { reportPost } from '../lib/reportApi'
import { blockUser } from '../lib/settingsApi'
import { useInViewport } from '../hooks/useInViewport'
import { useConnectionQuality } from '../hooks/useConnectionQuality'
import useSharedVideoPlayback from '../hooks/useSharedVideoPlayback'

interface HomePageProps {
  user: User
  onCreatorClick: (creator: any) => void
  onLivestreamClick?: (livestreamId: string) => void
  onGoLive?: () => void
  onSheetStateChange?: (isOpen: boolean) => void
}

const filterLiveStreams = (streams: Livestream[]) =>
  streams.filter(stream => stream.status === 'live' && !!stream.started_at && !!stream.agora_channel && (stream.viewer_count || 0) > 0)

const INITIAL_POST_BATCH = 6
const LOAD_MORE_BATCH = 4

// Video Player Component with mute/unmute and tap to pause
interface FeedVideoPlayerProps {
  src: string
  aspectRatio?: 'square' | 'full'
  videoId?: string
  muted?: boolean
  shouldPlay?: boolean
  onMuteChange?: (muted: boolean) => void
}

function FeedVideoPlayer({ src, aspectRatio = 'square', videoId, muted = false, shouldPlay = false, onMuteChange }: FeedVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const isInViewport = useInViewport(videoRef, { minimumRatio: aspectRatio === 'full' ? 0.5 : 0.35 })
  const { isSlow, isDataSaver } = useConnectionQuality()
  const { isActive, requestPlay, clearActive, activeId } = useSharedVideoPlayback(videoId || src)

  const [isMuted, setIsMuted] = useState(muted)
  const [isPaused, setIsPaused] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [naturalAspect, setNaturalAspect] = useState<number | null>(null)
  const canAutoPlay = !isSlow && !isDataSaver
  const resolvedAspect = naturalAspect || (aspectRatio === 'full' ? 9 / 16 : 4 / 5)

  const handlePointerEnter = () => {
    if (!isPaused && canAutoPlay) {
      requestPlay(videoId || src)
      videoRef.current?.play().catch(() => {})
    }
  }

  const handlePointerLeave = () => {
    if (!isPaused && !isInViewport) {
      videoRef.current?.pause()
    }
  }

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !isMuted
    setIsMuted(next)
    onMuteChange?.(next)
  }

  const togglePause = () => {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      requestPlay(videoId || src)
      video.play().catch(() => {})
      setIsPaused(false)
    } else {
      video.pause()
      setIsPaused(true)
      if ((videoId || src) === activeId) {
        clearActive()
      }
    }
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Force pause if not the designated active video
    if (!shouldPlay) {
      if (!video.paused) video.pause()
      setIsPaused(true)
      return
    }

    if (!isInViewport) {
      if (!video.paused) video.pause()
      return
    }

    if (!isPaused && canAutoPlay) {
      requestPlay(videoId || src)
      if (isActive) {
        video.play().catch(() => {})
      }
    }
  }, [isInViewport, isPaused, canAutoPlay, isActive, requestPlay, videoId, src])

  // Pause if another video takes over
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if ((!isActive || !shouldPlay) && !video.paused) {
      video.pause()
      setIsPaused(true)
    }
  }, [isActive, shouldPlay])

  // Auto-claim active when conditions are right
  useEffect(() => {
    if (isInViewport && !isPaused && canAutoPlay) {
      requestPlay(videoId || src)
    }
  }, [isInViewport, isPaused, canAutoPlay, requestPlay, videoId, src])

  useEffect(() => {
    if (!canAutoPlay) {
      setIsPaused(true)
    }
  }, [canAutoPlay])

  useEffect(() => {
    setIsMuted(muted)
  }, [muted])

  return (
    <div
      className="relative w-full bg-black flex items-center justify-center"
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
      style={{
        aspectRatio: resolvedAspect,
        maxHeight: aspectRatio === 'full' ? '85vh' : undefined
      }}
    >
      {/* Loading spinner */}
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
          <div className="w-10 h-10 border-3 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Video */}
      <video
        ref={videoRef}
        src={src}
        className={`w-full h-full max-h-full object-contain transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        playsInline
        loop
        muted={isMuted}
        preload={canAutoPlay ? 'auto' : 'metadata'}
        onClick={togglePause}
        onLoadedMetadata={(e) => {
          const video = e.currentTarget
          if (video.videoWidth && video.videoHeight) {
            setNaturalAspect(video.videoWidth / video.videoHeight)
          }
          setIsLoaded(true)
        }}
        onCanPlay={() => setIsLoaded(true)}
      />

      {/* Pause indicator */}
      {isPaused && isLoaded && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
          onClick={togglePause}
        >
          <div className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center">
            <Play className="w-8 h-8 text-white fill-white ml-1" />
          </div>
        </div>
      )}

      {/* Mute/Unmute button - Instagram style bottom right corner */}
      {isLoaded && (
        <button
          onClick={toggleMute}
          className="absolute bottom-3 right-3 p-2 bg-black/60 rounded-full z-20 hover:bg-black/80 transition-colors"
        >
          {isMuted ? (
            <VolumeX className="w-5 h-5 text-white" />
          ) : (
            <Volume2 className="w-5 h-5 text-white" />
          )}
        </button>
      )}

      {!canAutoPlay && isLoaded && (
        <div className="absolute bottom-3 left-3 text-[11px] px-2 py-1 rounded-full bg-black/60 text-white/80">
          Data saver on – tap to play
        </div>
      )}
    </div>
  )
}

// Instagram-style carousel for multiple images/videos
function MediaCarousel({ urls, canView, videoIdPrefix, muted, onMuteChange, shouldPlay, onDoubleTap }: { urls: string[]; canView: boolean; videoIdPrefix?: string; muted?: boolean; onMuteChange?: (muted: boolean) => void; shouldPlay?: boolean; onDoubleTap?: () => void }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
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
      setTimeout(() => setShowHeart(false), 650)
    }
    lastTap.current = now
  }

  if (!canView || urls.length === 0) return null

  return (
    <div className="relative w-full bg-black rounded-2xl overflow-hidden">
      {/* Scrollable container */}
      <div
        ref={containerRef}
        className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        onScroll={handleScroll}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        onClick={handleTap}
      >
        {urls.map((url, index) => (
          <div key={index} className="flex-none w-full snap-center">
            {url.match(/\.(mp4|webm)$/i) ? (
              <div className="w-full flex justify-center bg-black">
                <FeedVideoPlayer
                  src={url}
                  aspectRatio="full"
                  videoId={`${videoIdPrefix || 'carousel'}-${index}-${url}`}
                  muted={muted}
                  onMuteChange={onMuteChange}
                  shouldPlay={shouldPlay}
                />
              </div>
            ) : (
              <img
                src={url}
                alt=""
                loading="lazy"
                className="w-full h-full object-contain bg-black select-none"
              />
            )}
          </div>
        ))}
      </div>

      {/* Double-tap heart overlay */}
      <AnimatePresence>
        {showHeart && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1.1, opacity: 0.9 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Heart className="w-24 h-24 text-white fill-white drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)]" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dot indicators - only show if multiple items */}
      {urls.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {urls.map((_, index) => (
            <div
              key={index}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                index === currentIndex
                  ? 'bg-white w-2.5'
                  : 'bg-white/50'
              }`}
            />
          ))}
        </div>
      )}

      {/* Image counter - only show if multiple items */}
      {urls.length > 1 && (
        <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full z-10">
          {currentIndex + 1}/{urls.length}
        </div>
      )}
    </div>
  )
}

export default function HomePage({ user, onCreatorClick, onLivestreamClick, onGoLive, onSheetStateChange }: HomePageProps) {
  const [posts, setPosts] = useState<Post[]>([])
  const [suggestions, setSuggestions] = useState<User[]>([])
  const [livestreams, setLivestreams] = useState<Livestream[]>([])
  const [loading, setLoading] = useState(true)
  const [feedMuted, setFeedMuted] = useState(false)
  const [activePostId, setActivePostId] = useState<number | null>(null)
  const [purchaseModal, setPurchaseModal] = useState<Post | null>(null)
  const [purchasing, setPurchasing] = useState(false)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [postMenuOpen, setPostMenuOpen] = useState<number | null>(null)
  const [visibleCount, setVisibleCount] = useState(INITIAL_POST_BATCH)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const mediaRefs = useRef<Map<number, Element>>(new Map())
  const mediaObserver = useRef<IntersectionObserver | null>(null)

  // Likes sheet state
  const [likesSheetOpen, setLikesSheetOpen] = useState(false)
  const [likesSheetUsers, setLikesSheetUsers] = useState<User[]>([])
  const [likesSheetLoading, setLikesSheetLoading] = useState(false)

  // Comments sheet state
  const [commentsSheetOpen, setCommentsSheetOpen] = useState(false)
  const [commentsSheetPost, setCommentsSheetPost] = useState<number | null>(null)

  // Notify parent when any bottom sheet is open
  useEffect(() => {
    const anySheetOpen = commentsSheetOpen || likesSheetOpen || !!purchaseModal || postMenuOpen !== null
    onSheetStateChange?.(anySheetOpen)
  }, [commentsSheetOpen, likesSheetOpen, purchaseModal, postMenuOpen, onSheetStateChange])

  useEffect(() => {
    loadData()
  }, [])

  // Subscribe to realtime feed updates
  useEffect(() => {
    const unsubscribe = subscribeToFeedUpdates({
      onNewPost: (newPost) => {
        // Add new post to top of feed
        setPosts(prev => [{ ...newPost, liked: false, saved: false, can_view: true }, ...prev])
        setVisibleCount(prev => prev + 1)
      },
      onPostUpdated: (updatedPost) => {
        setPosts(prev => prev.map(p => p.id === updatedPost.id ? { ...p, ...updatedPost } : p))
      },
      onPostDeleted: (postId) => {
        setPosts(prev => prev.filter(p => p.id !== postId))
      },
      onLikeAdded: (postId, likerId) => {
        // Only update count if it wasn't our own like (we already have optimistic update)
        if (likerId !== user.telegram_id) {
          setPosts(prev => prev.map(p =>
            p.id === postId ? { ...p, likes_count: (p.likes_count || 0) + 1 } : p
          ))
        }
      },
      onLikeRemoved: (postId, likerId) => {
        if (likerId !== user.telegram_id) {
          setPosts(prev => prev.map(p =>
            p.id === postId ? { ...p, likes_count: Math.max(0, (p.likes_count || 0) - 1) } : p
          ))
        }
      },
      onCommentAdded: (postId, commentCount) => {
        setPosts(prev => prev.map(p =>
          p.id === postId ? { ...p, comments_count: commentCount } : p
        ))
      },
    })

    return () => unsubscribe()
  }, [user.telegram_id])

  useEffect(() => {
    const unsubscribe = subscribeToLivestreams((streams) => setLivestreams(filterLiveStreams(streams)))
    return () => {
      unsubscribe()
    }
  }, [])

  const scrollEl = useMemo(() => {
    if (typeof document === 'undefined') return null
    return (document.querySelector('main') as HTMLElement | null) ?? document.documentElement
  }, [])

  const loadData = async () => {
    const [feedPosts, suggestedCreators, liveStreams] = await Promise.all([
      getFeed(user.telegram_id),
      getSuggestedCreators(6),
      getLivestreams()
    ])
    setPosts(feedPosts)
    setVisibleCount(Math.min(feedPosts.length, INITIAL_POST_BATCH))
    setSuggestions(suggestedCreators)
    setLivestreams(filterLiveStreams(liveStreams))
    setLoading(false)
  }

  const handleLike = async (post: Post) => {
    if (!post.can_view) return
    const optimisticLiked = !post.liked
    const delta = optimisticLiked ? 1 : -1

    // optimistic update
    setPosts(prev =>
      prev.map(p =>
        p.id === post.id
          ? {
              ...p,
              liked: optimisticLiked,
              likes_count: Math.max(0, (p.likes_count || 0) + delta)
            }
          : p
      )
    )

    try {
      if (optimisticLiked) {
        await likePost(user.telegram_id, post.id)
      } else {
        await unlikePost(user.telegram_id, post.id)
      }
    } catch (err) {
      // rollback on failure
      setPosts(prev =>
        prev.map(p =>
          p.id === post.id
            ? {
                ...p,
                liked: !optimisticLiked,
                likes_count: Math.max(0, (p.likes_count || 0) - delta)
              }
            : p
        )
      )
      console.warn('Like action failed', err)
    }
  }

  const handleSave = async (post: Post) => {
    const optimisticSaved = !post.saved

    setPosts(prev =>
      prev.map(p =>
        p.id === post.id
          ? { ...p, saved: optimisticSaved }
          : p
      )
    )

    try {
      if (optimisticSaved) {
        await savePost(user.telegram_id, post.id)
      } else {
        await unsavePost(user.telegram_id, post.id)
      }
    } catch (err) {
      // rollback
      setPosts(prev =>
        prev.map(p =>
          p.id === post.id
            ? { ...p, saved: !optimisticSaved }
            : p
        )
      )
      console.warn('Save action failed', err)
    }
  }

  const handleViewLikes = async (post: Post) => {
    if ((post.likes_count || 0) === 0) return
    setLikesSheetOpen(true)
    setLikesSheetLoading(true)
    const users = await getPostLikes(post.id)
    setLikesSheetUsers(users)
    setLikesSheetLoading(false)
  }

  const handleViewCommenters = async (post: Post) => {
    setCommentsSheetPost(post.id)
    setCommentsSheetOpen(true)
  }

  const handlePurchase = async (post: Post) => {
    setPurchasing(true)

    // Use Telegram Stars payment
    await unlockPostWithPayment(
      user.telegram_id,
      post.id,
      () => {
        // Success callback - payment completed
        setPosts(posts.map(p => p.id === post.id ? { ...p, can_view: true, is_purchased: true } : p))
        setPurchaseModal(null)
        setPurchasing(false)
      },
      (error) => {
        // Failed callback
        console.error('Payment failed:', error)
        setPurchasing(false)
      }
    )
  }

  const handlePostDeleted = () => {
    if (selectedPost) {
      setPosts(posts.filter(p => p.id !== selectedPost.id))
      setSelectedPost(null)
    }
  }

  const handlePostUpdated = (updatedPost: Post) => {
    setPosts(posts.map(p => p.id === updatedPost.id ? updatedPost : p))
  }

  const handleDeletePost = async (post: Post) => {
    if (!window.confirm('Are you sure you want to delete this post?')) return
    
    const result = await deletePost(post.id, post.creator_id)
    if (result.success) {
      setPosts(posts.filter(p => p.id !== post.id))
    } else {
      alert('Failed to delete post')
    }
    setPostMenuOpen(null)
  }

  const handleHidePost = (post: Post) => {
    // Hide from local feed (doesn't delete from database)
    setPosts(posts.filter(p => p.id !== post.id))
    setPostMenuOpen(null)
  }

  const handleReportPost = async (post: Post) => {
    const reason = window.prompt('Let us know why you are reporting this post:', 'Inappropriate content')
    const trimmedReason = reason?.trim()
    if (!trimmedReason) {
      setPostMenuOpen(null)
      return
    }

    const description = window.prompt('Add any additional details (optional):')?.trim()
    const result = await reportPost(user.telegram_id, post.id, trimmedReason, description || undefined)

    if (result.success) {
      alert('Post reported. Thank you for helping keep the community safe.')
    } else {
      alert(`Unable to submit report: ${result.error || 'Please try again later.'}`)
    }
    setPostMenuOpen(null)
  }

  const handleCopyLink = (post: Post) => {
    const link = `${window.location.origin}/post/${post.id}`
    navigator.clipboard.writeText(link)
    alert('Link copied to clipboard!')
    setPostMenuOpen(null)
  }

  const handleBlockUser = async (post: Post) => {
    if (!window.confirm(`Block @${post.creator?.username || 'this user'}? You won't see their content anymore.`)) {
      return
    }

    const success = await blockUser(user.telegram_id, post.creator_id)

    if (success) {
      setPosts(prev => prev.filter(p => p.creator_id !== post.creator_id))
      setSuggestions(prev => prev.filter(creator => creator.telegram_id !== post.creator_id))
      alert('User blocked successfully.')
    } else {
      alert('Failed to block this user. Please try again later.')
    }
    setPostMenuOpen(null)
  }

  useEffect(() => {
    const sentinel = loadMoreRef.current
    if (!sentinel) return
    if (visibleCount >= posts.length) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount(prev => {
            if (prev >= posts.length) return prev
            return Math.min(posts.length, prev + LOAD_MORE_BATCH)
          })
        }
      },
      { rootMargin: '240px 0px' }
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [visibleCount, posts.length])

  const visiblePosts = useMemo(() => posts.slice(0, visibleCount), [posts, visibleCount])

  const feedVirtualizer = useVirtualizer({
    count: visiblePosts.length,
    getScrollElement: () => (scrollEl ?? document.documentElement)!,
    estimateSize: () => 720,
    overscan: 4,
    scrollMargin: 120,
  })

  // Track which post is most visible to drive video playback
  useEffect(() => {
    if (mediaObserver.current) {
      mediaObserver.current.disconnect()
    }

    const rootEl = document.querySelector('main') as HTMLElement | null
    const observer = new IntersectionObserver(
      (entries) => {
        let bestId: number | null = null
        let bestRatio = 0
        for (const entry of entries) {
          const idAttr = (entry.target as HTMLElement).dataset.postId
          const id = idAttr ? Number(idAttr) : null
          if (!id) continue
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio
            bestId = id
          }
        }
        if (bestId !== null) {
          setActivePostId(bestId)
        }
      },
      {
        root: rootEl || undefined,
        threshold: [0.25, 0.5, 0.75],
        rootMargin: '0px 0px -15% 0px',
      }
    )

    mediaRefs.current.forEach((el) => observer.observe(el))
    mediaObserver.current = observer

    return () => {
      observer.disconnect()
    }
  }, [visiblePosts])
  const formatTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return 'Just now'
    if (hours < 24) return hours + 'h'
    return Math.floor(hours / 24) + 'd'
  }

  const renderPostCard = (post: Post) => (
    <div key={post.id} className="bg-black border-b border-gray-800">
      {/* Header - Instagram style */}
      <div className="flex items-center justify-between px-3 py-2">
        <button className="flex items-center gap-3" onClick={() => post.creator && onCreatorClick(post.creator)}>
          <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-700">
            <img
              src={post.creator?.avatar_url || 'https://i.pravatar.cc/150?u=' + post.creator_id}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="font-semibold text-sm text-white">{post.creator?.username || 'creator'}</span>
            {post.creator?.is_verified && (
              <CheckCircle className="w-3.5 h-3.5 text-blue-500 fill-blue-500" />
            )}
          </div>
        </button>
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setPostMenuOpen(postMenuOpen === post.id ? null : post.id)
            }}
            className="p-2 text-white"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
          {/* Menu Dropdown */}
          <AnimatePresence>
            {postMenuOpen === post.id && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-40"
                  onClick={() => setPostMenuOpen(null)}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -10 }}
                  className="absolute right-0 top-full mt-1 bg-[#262626] rounded-lg py-1 z-50 min-w-[160px] shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  {Number(post.creator_id) === Number(user.telegram_id) && (
                    <>
                      <button
                        onClick={() => {
                          setSelectedPost(post)
                          setPostMenuOpen(null)
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-white/10 flex items-center gap-2"
                      >
                        <Edit3 className="w-4 h-4" /> Edit
                      </button>
                      <button
                        onClick={() => handleDeletePost(post)}
                        className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-white/10 flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                      <div className="h-px bg-gray-100 mx-4 my-1" />
                    </>
                  )}
                  <button
                    onClick={() => handleCopyLink(post)}
                    className="w-full px-5 py-3 text-left text-[14px] font-semibold text-gray-700 hover:bg-gray-900 flex items-center gap-3"
                  >
                    <Copy className="w-4 h-4" /> Copy link
                  </button>
                  <button
                    onClick={() => handleHidePost(post)}
                    className="w-full px-5 py-3 text-left text-[14px] font-semibold text-gray-700 hover:bg-gray-900 flex items-center gap-3"
                  >
                    <EyeOff className="w-4 h-4" /> Not interested
                  </button>
                  {Number(post.creator_id) !== Number(user.telegram_id) && (
                    <>
                      <div className="h-px bg-gray-100 mx-4 my-1" />
                      <button
                        onClick={() => handleBlockUser(post)}
                        className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-white/10 flex items-center gap-2"
                      >
                        <UserX className="w-4 h-4" /> Block
                      </button>
                      <button
                        onClick={() => handleReportPost(post)}
                        className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-white/10 flex items-center gap-2"
                      >
                        <Flag className="w-4 h-4" /> Report
                      </button>
                    </>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Media */}
      {post.media_url && post.can_view ? (
        <div
          className="w-full bg-black rounded-2xl overflow-hidden border border-white/5"
          data-post-id={post.id}
          ref={(el) => {
            if (el) {
              mediaRefs.current.set(post.id, el)
            } else {
              mediaRefs.current.delete(post.id)
            }
          }}
        >
          <MediaCarousel
            urls={post.media_urls && post.media_urls.length > 0 ? post.media_urls : [post.media_url]}
            canView={post.can_view}
            muted={feedMuted}
            onMuteChange={setFeedMuted}
            videoIdPrefix={post.id.toString()}
            shouldPlay={activePostId === post.id}
            onDoubleTap={() => handleLike(post)}
          />
        </div>
      ) : post.media_url ? (
        // Locked content
        <div className="relative bg-gray-900 text-white aspect-[4/5] flex flex-col items-center justify-center text-center overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
          <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 via-gray-900 to-gray-900" />
          
          <div className="relative z-10 p-8 w-full max-w-md mx-auto">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 backdrop-blur-xl shadow-2xl shadow-purple-500/10 rotate-3 hover:rotate-0 transition-transform duration-500">
              <Lock className="w-8 h-8 text-white/90 drop-shadow-lg" />
            </div>
            
            <h3 className="text-2xl font-bold mb-3 tracking-tight">{getLockReason(post)}</h3>
            <p className="text-white/60 mb-8 leading-relaxed">Unlock premium content from <span className="text-white font-semibold">{post.creator?.first_name}</span> and support their work.</p>
            
            {post.unlock_price > 0 ? (
              <motion.button
                className="w-full py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-black rounded-2xl font-bold text-[15px] shadow-[0_0_30px_-5px_rgba(251,191,36,0.4)] flex items-center justify-center gap-2 hover:opacity-90 transition-opacity relative overflow-hidden group"
                whileTap={{ scale: 0.98 }}
                onClick={() => setPurchaseModal(post)}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                <Star className="w-5 h-5 fill-current" />
                Unlock for {Math.ceil(post.unlock_price)} Stars
              </motion.button>
            ) : (
              <motion.button
                className="w-full py-4 bg-white text-white rounded-2xl font-bold text-[15px] shadow-[0_0_30px_-5px_rgba(255,255,255,0.3)] flex items-center justify-center gap-2 hover:bg-gray-900 transition-colors"
                whileTap={{ scale: 0.98 }}
                onClick={() => post.creator && onCreatorClick(post.creator)}
              >
                {post.visibility === 'followers' ? (
                  <><Eye className="w-5 h-5" /> Follow to View</>
                ) : (
                  <><CheckCircle className="w-5 h-5" /> Subscribe to View</>
                )}
              </motion.button>
            )}
          </div>
        </div>
      ) : null}

      {/* Action Bar - Instagram style */}
      <div className="px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button className="active:scale-90 transition-transform" onClick={() => handleLike(post)}>
              <Heart className={`w-6 h-6 ${post.liked ? 'text-red-500 fill-red-500' : 'text-white'}`} />
            </button>
            <button className="active:scale-90 transition-transform" onClick={() => handleViewCommenters(post)}>
              <MessageCircle className="w-6 h-6 text-white" />
            </button>
            <button className="active:scale-90 transition-transform">
              <Share2 className="w-6 h-6 text-white" />
            </button>
          </div>
          <button onClick={() => handleSave(post)} className="active:scale-90 transition-transform">
            <Bookmark className={`w-6 h-6 ${post.saved ? 'text-white fill-white' : 'text-white'}`} />
          </button>
        </div>

        {/* Likes Count */}
        {(post.likes_count || 0) > 0 && (
          <button className="mt-2" onClick={() => handleViewLikes(post)}>
            <span className="text-sm font-semibold text-white">{post.likes_count.toLocaleString()} likes</span>
          </button>
        )}

        {/* Caption */}
        {post.content && (
          <div className="mt-1">
            <span className="text-sm text-white">
              <span className="font-semibold mr-1">{post.creator?.username}</span>
              {post.content}
            </span>
          </div>
        )}

        {/* View comments */}
        {post.comments_count > 0 && (
          <button className="mt-1" onClick={() => handleViewCommenters(post)}>
            <span className="text-sm text-gray-400">View all {post.comments_count} comments</span>
          </button>
        )}

        {/* Add comment row */}
        <button className="flex items-center gap-2 mt-2 w-full" onClick={() => handleViewCommenters(post)}>
          <img src={user.avatar_url || 'https://i.pravatar.cc/150?u=' + user.telegram_id} className="w-6 h-6 rounded-full object-cover" alt="" />
          <span className="text-sm text-gray-500">Add a comment...</span>
        </button>

        {/* Timestamp */}
        <div className="mt-1 mb-2">
          <span className="text-[11px] text-gray-500 uppercase">{formatTime(post.created_at)}</span>
        </div>
      </div>
    </div>
  )

  const getLockReason = (post: Post) => {
    if (post.unlock_price > 0 && !post.is_purchased) {
      return `Unlock for ${Math.ceil(post.unlock_price)} Stars`
    }
    if (post.is_nsfw && !post.is_subscribed) {
      return 'Subscribe to see NSFW content'
    }
    if (post.visibility === 'subscribers' && !post.is_subscribed) {
      return 'Subscribe to see exclusive content'
    }
    if (post.visibility === 'followers' && !post.is_following && !post.is_subscribed) {
      return 'Follow to see this content'
    }
    return 'Content locked'
  }

  if (loading) {
    return (
      <div className="bg-black min-h-screen p-4 space-y-4">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="rounded-2xl border border-white/5 bg-[#0a0b0f] p-4 animate-pulse shadow-[0_14px_40px_rgba(0,0,0,0.35)]"
          >
            <div className="flex gap-3 mb-3">
              <div className="w-10 h-10 bg-white/10 rounded-full" />
              <div className="flex-1">
                <div className="h-4 bg-white/10 rounded w-24 mb-2" />
                <div className="h-3 bg-white/10 rounded w-16" />
              </div>
            </div>
            <div className="h-48 bg-white/10 rounded-xl" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="bg-black max-w-lg mx-auto">
      {/* Live Now Section - Stories style */}
      {(livestreams.length > 0 || user.is_creator) && (
        <div className="border-b border-gray-800 py-3 px-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-[13px] font-semibold text-white">Live</span>
            </div>
            {user.is_creator && onGoLive && (
              <button
                onClick={onGoLive}
                className="text-[13px] font-semibold text-blue-500"
              >
                Go Live
              </button>
            )}
          </div>

          {livestreams.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto no-scrollbar">
              {livestreams.map((stream) => (
                <button
                  key={stream.id}
                  className="flex flex-col items-center min-w-[66px]"
                  onClick={() => onLivestreamClick?.(stream.id)}
                >
                  <div className="relative">
                    <div className="w-[62px] h-[62px] rounded-full p-[3px] bg-gradient-to-tr from-red-500 via-pink-500 to-orange-500">
                      <div className="w-full h-full rounded-full p-[2px] bg-white">
                        <img
                          src={stream.creator?.avatar_url || `https://i.pravatar.cc/150?u=${stream.creator_id}`}
                          alt=""
                          className="w-full h-full rounded-full object-cover"
                        />
                      </div>
                    </div>
                    <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded border-2 border-white">
                      LIVE
                    </div>
                  </div>
                  <span className="text-[11px] text-white mt-1.5 truncate w-full text-center">
                    {stream.creator?.first_name}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-gray-400 text-center py-4">
              No one is live right now
            </p>
          )}
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="border-b border-gray-800 py-4 px-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[14px] font-semibold text-gray-500">Suggested for you</span>
            <button className="text-[13px] font-semibold text-white">
              See All
            </button>
          </div>

          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {suggestions.map((creator) => (
              <div
                key={creator.telegram_id}
                className="min-w-[150px] bg-gray-900 rounded-lg p-4 flex flex-col items-center"
              >
                <button
                  onClick={() => onCreatorClick(creator)}
                  className="flex flex-col items-center"
                >
                  <div className="relative mb-3">
                    <img
                      src={creator.avatar_url || `https://i.pravatar.cc/150?u=${creator.telegram_id}`}
                      className="w-14 h-14 rounded-full object-cover"
                      alt={creator.first_name}
                    />
                    {creator.is_verified && (
                      <div className="absolute bottom-0 right-0 bg-white rounded-full p-[2px]">
                        <CheckCircle className="w-3.5 h-3.5 text-blue-500 fill-blue-500" />
                      </div>
                    )}
                  </div>
                  <span className="text-[13px] font-semibold text-white truncate w-full text-center">
                    {creator.username}
                  </span>
                  <span className="text-[12px] text-gray-500 truncate w-full text-center">
                    {creator.first_name}
                  </span>
                </button>
                <button
                  onClick={() => onCreatorClick(creator)}
                  className="mt-3 w-full py-1.5 bg-blue-500 text-white text-[13px] font-semibold rounded-lg"
                >
                  Follow
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Posts Feed - Virtualized for smooth scroll */}
      <div className="bg-black">
        {posts.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <div className="w-16 h-16 border-2 border-white rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Welcome to Veronica</h3>
            <p className="text-sm text-gray-400">Follow creators to see their posts in your feed.</p>
          </div>
        ) : (
          <div style={{ position: 'relative', height: feedVirtualizer.getTotalSize() + 120 }}>
            {feedVirtualizer.getVirtualItems().map((virtualRow) => {
              const post = visiblePosts[virtualRow.index]
              if (!post) return null

              return (
                <div
                  key={post.id}
                  data-index={virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: 24,
                  }}
                >
                  {renderPostCard(post)}
                </div>
              )
            })}

            {visibleCount < posts.length && (
              <div
                ref={loadMoreRef}
                className="flex items-center justify-center"
                style={{
                  position: 'absolute',
                  top: feedVirtualizer.getTotalSize(),
                  left: 0,
                  width: '100%',
                  padding: '32px 0',
                }}
              >
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Purchase Modal - Telegram Stars */}
      <AnimatePresence>
        {purchaseModal && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[60] p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !purchasing && setPurchaseModal(null)}
          >
            <motion.div
              className="bg-[#1c1c1e] rounded-[2rem] p-6 max-w-sm w-full shadow-2xl border border-white/10"
              initial={{ scale: 0.9, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 30, opacity: 0 }}
              transition={{ type: "spring", duration: 0.5 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Unlock Content</h3>
                <button onClick={() => !purchasing && setPurchaseModal(null)} className="p-1 rounded-full hover:bg-white/10 transition-colors">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="text-center mb-8 relative">
                <div className="absolute inset-0 bg-yellow-500/20 blur-3xl rounded-full" />
                <div className="relative w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <Star className="w-10 h-10 text-white fill-white" />
                </div>
                <p className="text-gray-400 text-sm font-medium mb-2">Pay with Telegram Stars</p>
                <div className="flex items-center justify-center gap-2">
                  <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                  <span className="text-4xl font-bold text-white tracking-tight">{Math.ceil(purchaseModal.unlock_price)}</span>
                </div>
              </div>

              <div className="bg-white/5 rounded-2xl p-4 mb-6 border border-white/10">
                <div className="flex items-center gap-3">
                  <img
                    src={purchaseModal.creator?.avatar_url || `https://i.pravatar.cc/150?u=${purchaseModal.creator_id}`}
                    className="w-10 h-10 rounded-full object-cover"
                    alt=""
                  />
                  <div className="flex-1">
                    <p className="text-white font-medium">{purchaseModal.creator?.first_name || purchaseModal.creator?.username}</p>
                    <p className="text-gray-500 text-sm">Creator receives 85%</p>
                  </div>
                </div>
              </div>

              <motion.button
                className="w-full py-4 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2 shadow-lg transition-all bg-gradient-to-r from-yellow-400 to-orange-500 text-black"
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handlePurchase(purchaseModal)}
                disabled={purchasing}
              >
                {purchasing ? (
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                ) : (
                  <>
                    <Star className="w-5 h-5 fill-current" />
                    Pay {Math.ceil(purchaseModal.unlock_price)} Stars
                  </>
                )}
              </motion.button>

              <p className="text-center text-gray-500 text-xs mt-4">
                Payment powered by Telegram Stars
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Post Detail Modal */}
      <AnimatePresence>
        {selectedPost && (
          <PostDetail
            post={selectedPost}
            user={user}
            onBack={() => setSelectedPost(null)}
            onDeleted={handlePostDeleted}
            onUpdated={handlePostUpdated}
          />
        )}
      </AnimatePresence>

      {/* Likes Bottom Sheet */}
      <BottomSheet
        isOpen={likesSheetOpen}
        onClose={() => setLikesSheetOpen(false)}
        title="Likes"
        users={likesSheetUsers}
        loading={likesSheetLoading}
        onUserClick={(user) => {
          setLikesSheetOpen(false)
          onCreatorClick(user)
        }}
      />

      {/* Comments Bottom Sheet */}
      <CommentsSheet
        isOpen={commentsSheetOpen}
        onClose={() => setCommentsSheetOpen(false)}
        postId={commentsSheetPost}
        user={user}
      />
    </div>
  )
}

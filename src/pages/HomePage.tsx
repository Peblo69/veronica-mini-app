import { useState, useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, MoreHorizontal, CheckCircle, Lock, Eye, X, Users, Trash2, EyeOff, Edit3, Flag, Copy, UserX, Volume2, VolumeX, Play, Star, Image } from 'lucide-react'
import { PixelHeart, PixelComment, PixelShare, PixelBookmark, PixelStar } from '../components/PixelIcons'
import { getFeed, getSuggestedCreators, likePost, unlikePost, savePost, unsavePost, deletePost, getPostLikes, subscribeToFeedUpdates, type User, type Post } from '../lib/api'
import { unlockPostWithPayment } from '../lib/paymentsApi'
import { getLivestreams, subscribeToLivestreams, type Livestream } from '../lib/livestreamApi'
import PostDetail from '../components/PostDetail'
import BottomSheet from '../components/BottomSheet'
import CommentsSheet from '../components/CommentsSheet'
import { reportPost } from '../lib/reportApi'
import { blockUser } from '../lib/settingsApi'
import { useInViewport } from '../hooks/useInViewport'
import { useTranslation } from 'react-i18next'

interface HomePageProps {
  user: User
  onCreatorClick: (creator: any) => void
  onLivestreamClick?: (livestreamId: string) => void
  onGoLive?: () => void
  onSheetStateChange?: (isOpen: boolean) => void
}

const filterLiveStreams = (streams: Livestream[]) =>
  streams.filter(stream => stream.status === 'live' && !!stream.started_at && !!stream.agora_channel && (stream.viewer_count || 0) > 0)

const INITIAL_POST_BATCH = 5
const LOAD_MORE_BATCH = 3

// Simple Video Player - FIXED size, tap to pause, bottom-right mute button
interface FeedVideoPlayerProps {
  src: string
  muted?: boolean
  shouldPlay?: boolean
  onMuteChange?: (muted: boolean) => void
}

// Global video registry - only ONE video plays at a time
const allVideos = new Set<HTMLVideoElement>()
let currentlyPlaying: HTMLVideoElement | null = null

function pauseAllVideosExcept(except: HTMLVideoElement | null) {
  allVideos.forEach(video => {
    if (video !== except && !video.paused) {
      video.pause()
    }
  })
  currentlyPlaying = except
}

// Feed image with error handling and loading state
function FeedImage({ url }: { url: string }) {
  const [error, setError] = useState(false)
  const [loaded, setLoaded] = useState(false)

  if (error) {
    return (
      <div
        className="w-full flex items-center justify-center bg-white/5"
        style={{ aspectRatio: '4/5' }}
      >
        <div className="text-center">
          <Image className="w-10 h-10 text-white/30 mx-auto mb-2" />
          <p className="text-sm text-white/40">Failed to load image</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full" style={{ aspectRatio: '4/5' }}>
      {!loaded && (
        <div className="absolute inset-0 bg-white/5 animate-pulse" />
      )}
      <img
        src={url}
        alt=""
        loading="lazy"
        className={`w-full h-full object-contain bg-black select-none transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </div>
  )
}

function FeedVideoPlayer({ src, muted = true, shouldPlay = false, onMuteChange }: FeedVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const isInViewport = useInViewport(containerRef, { minimumRatio: 0.5 })

  // Touch tracking for distinguishing taps from scrolls
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)

  const [isMuted, setIsMuted] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)

  // Register/unregister video element
  useEffect(() => {
    const video = videoRef.current
    if (video) {
      allVideos.add(video)
      return () => {
        allVideos.delete(video)
        if (currentlyPlaying === video) {
          currentlyPlaying = null
        }
      }
    }
  }, [])

  // Sync muted from parent
  useEffect(() => {
    setIsMuted(muted)
  }, [muted])

  // Play when in view AND shouldPlay, pause otherwise
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const wantToPlay = shouldPlay && isInViewport

    if (wantToPlay && video.paused) {
      pauseAllVideosExcept(video)
      video.play().catch(() => {})
    } else if (!wantToPlay && !video.paused) {
      video.pause()
    }
  }, [shouldPlay, isInViewport])

  // Track play/pause/buffering state
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handlePlay = () => {
      setIsPlaying(true)
      pauseAllVideosExcept(video)
    }
    const handlePause = () => setIsPlaying(false)
    const handleWaiting = () => setIsBuffering(true)
    const handlePlaying = () => setIsBuffering(false)
    const handleCanPlay = () => setIsBuffering(false)

    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('playing', handlePlaying)
    video.addEventListener('canplay', handleCanPlay)

    return () => {
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('playing', handlePlaying)
      video.removeEventListener('canplay', handleCanPlay)
    }
  }, [])

  const togglePlayPause = () => {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      pauseAllVideosExcept(video)
      video.play().catch(() => {})
    } else {
      video.pause()
    }
  }

  // Touch handlers - distinguish tap from scroll
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return

    const touch = e.changedTouches[0]
    const dx = Math.abs(touch.clientX - touchStartRef.current.x)
    const dy = Math.abs(touch.clientY - touchStartRef.current.y)
    const dt = Date.now() - touchStartRef.current.time

    // Only trigger tap if: minimal movement (<15px) and quick (<300ms)
    if (dx < 15 && dy < 15 && dt < 300) {
      e.preventDefault()
      togglePlayPause()
    }

    touchStartRef.current = null
  }

  const handleMuteClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const newMuted = !isMuted
    setIsMuted(newMuted)
    onMuteChange?.(newMuted)
    if (videoRef.current) {
      videoRef.current.muted = newMuted
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-gray-900 overflow-hidden"
      style={{ aspectRatio: '4/5' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClick={togglePlayPause}
    >
      {/* Video element - always visible, no blocking overlay */}
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-cover"
        playsInline
        loop
        muted={isMuted}
        preload="auto"
        poster=""
      />

      {/* Buffering spinner - small, doesn't block video */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-10 h-10 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Play icon when paused - only shows when not buffering */}
      {!isPlaying && !isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-14 h-14 bg-black/50 rounded-full flex items-center justify-center">
            <Play className="w-7 h-7 text-white fill-white ml-0.5" />
          </div>
        </div>
      )}

      {/* MUTE BUTTON - BOTTOM LEFT */}
      <button
        onClick={handleMuteClick}
        onTouchEnd={(e) => {
          e.stopPropagation()
          touchStartRef.current = null // Prevent tap from firing
        }}
        className="absolute bottom-4 left-4 w-9 h-9 bg-black/70 rounded-full flex items-center justify-center z-[999] active:scale-90 transition-transform backdrop-blur-sm"
        style={{ touchAction: 'manipulation' }}
      >
        {isMuted ? (
          <VolumeX className="w-4 h-4 text-white" />
        ) : (
          <Volume2 className="w-4 h-4 text-white" />
        )}
      </button>
    </div>
  )
}

// Instagram-style carousel for multiple images/videos
function MediaCarousel({ urls, canView, muted, onMuteChange, shouldPlay, onDoubleTap }: { urls: string[]; canView: boolean; muted?: boolean; onMuteChange?: (muted: boolean) => void; shouldPlay?: boolean; onDoubleTap?: () => void }) {
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
            {url.match(/\.(mp4|webm|mov|m4v)(\?|$)/i) ? (
              <FeedVideoPlayer
                src={url}
                muted={muted}
                onMuteChange={onMuteChange}
                shouldPlay={shouldPlay && currentIndex === index}
              />
            ) : (
              <FeedImage url={url} />
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
  const { t } = useTranslation()
  const [posts, setPosts] = useState<Post[]>([])
  const [suggestions, setSuggestions] = useState<User[]>([])
  const [livestreams, setLivestreams] = useState<Livestream[]>([])
  const [loading, setLoading] = useState(true)
  const [feedMuted, setFeedMuted] = useState(true) // Start muted for better autoplay
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

  // Notify parent when any bottom sheet is open OR post detail is open
  useEffect(() => {
    const anySheetOpen = commentsSheetOpen || likesSheetOpen || !!purchaseModal || postMenuOpen !== null || !!selectedPost
    onSheetStateChange?.(anySheetOpen)
  }, [commentsSheetOpen, likesSheetOpen, purchaseModal, postMenuOpen, selectedPost, onSheetStateChange])

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

  const loadData = async () => {
    const [feedPosts, suggestedCreators, liveStreams] = await Promise.all([
      getFeed(user.telegram_id),
      getSuggestedCreators(6, user.telegram_id),
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
    if (!window.confirm(t('feed.confirm.deletePost'))) return
    
    const result = await deletePost(post.id, post.creator_id)
    if (result.success) {
      setPosts(posts.filter(p => p.id !== post.id))
    } else {
      alert(t('feed.errors.deleteFailed'))
    }
    setPostMenuOpen(null)
  }

  const handleHidePost = (post: Post) => {
    // Hide from local feed (doesn't delete from database)
    setPosts(posts.filter(p => p.id !== post.id))
    setPostMenuOpen(null)
  }

  const handleReportPost = async (post: Post) => {
    const reason = window.prompt(t('feed.report.promptReason'), t('feed.report.defaultReason'))
    const trimmedReason = reason?.trim()
    if (!trimmedReason) {
      setPostMenuOpen(null)
      return
    }

    const description = window.prompt(t('feed.report.promptDescription'))?.trim()
    const result = await reportPost(user.telegram_id, post.id, trimmedReason, description || undefined)

    if (result.success) {
      alert(t('feed.report.success'))
    } else {
      alert(t('feed.report.error', { error: result.error || t('feed.errors.tryAgain') }))
    }
    setPostMenuOpen(null)
  }

  const handleCopyLink = (post: Post) => {
    const link = `${window.location.origin}/post/${post.id}`
    navigator.clipboard.writeText(link)
    alert(t('feed.linkCopied'))
    setPostMenuOpen(null)
  }

  const handleBlockUser = async (post: Post) => {
    if (!window.confirm(t('feed.confirm.blockUser', { user: post.creator?.username || t('feed.userFallback') }))) {
      return
    }

    const success = await blockUser(user.telegram_id, post.creator_id)

    if (success) {
      setPosts(prev => prev.filter(p => p.creator_id !== post.creator_id))
      setSuggestions(prev => prev.filter(creator => creator.telegram_id !== post.creator_id))
      alert(t('feed.blockedSuccess'))
    } else {
      alert(t('feed.errors.blockFailed'))
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

  // Track which post is most visible to drive video playback
  useEffect(() => {
    if (mediaObserver.current) {
      mediaObserver.current.disconnect()
    }

    // Set first video post as active on initial load
    if (activePostId === null && visiblePosts.length > 0) {
      const firstVideoPost = visiblePosts.find(p => p.media_url?.match(/\.(mp4|webm|mov|m4v)(\?|$)/i) || p.media_urls?.some(u => u.match(/\.(mp4|webm|mov|m4v)(\?|$)/i)))
      if (firstVideoPost) {
        setActivePostId(firstVideoPost.id)
      } else {
        setActivePostId(visiblePosts[0].id)
      }
    }

    const rootEl = document.querySelector('main') as HTMLElement | null
    const thresholds = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the entry with highest visibility ratio
        let bestId: number | null = null
        let bestRatio = 0

        // Check all currently observed elements
        mediaRefs.current.forEach((el, postId) => {
          const rect = el.getBoundingClientRect()
          const viewportHeight = window.innerHeight
          const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0))
          const ratio = visibleHeight / rect.height

          if (ratio > bestRatio) {
            bestRatio = ratio
            bestId = postId
          }
        })

        // Also check the entries from the callback
        for (const entry of entries) {
          const idAttr = (entry.target as HTMLElement).dataset.postId
          const id = idAttr ? Number(idAttr) : null
          if (!id) continue
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio
            bestId = id
          }
        }

        if (bestId !== null && bestId !== activePostId) {
          setActivePostId(bestId)
        }
      },
      {
        root: rootEl || undefined,
        threshold: thresholds,
        rootMargin: '-10% 0px -10% 0px',
      }
    )

    mediaRefs.current.forEach((el) => observer.observe(el))
    mediaObserver.current = observer

    return () => {
      observer.disconnect()
    }
  }, [visiblePosts, activePostId])
  const formatTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return t('feed.time.justNow')
    if (hours < 24) return t('feed.time.hours', { count: hours })
    return t('feed.time.days', { count: Math.floor(hours / 24) })
  }

  const renderPostCard = (post: Post) => (
    <div key={post.id} className="bg-black pb-4 mb-2 border-b-4 border-gray-800/80">
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
            <span className="font-semibold text-sm text-white">{post.creator?.username || t('feed.userFallback')}</span>
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
                        <Edit3 className="w-4 h-4" /> {t('feed.actions.edit')}
                      </button>
                      <button
                        onClick={() => handleDeletePost(post)}
                        className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-white/10 flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" /> {t('feed.actions.delete')}
                      </button>
                      <div className="h-px bg-gray-100 mx-4 my-1" />
                    </>
                  )}
                  <button
                    onClick={() => handleCopyLink(post)}
                    className="w-full px-5 py-3 text-left text-[14px] font-semibold text-gray-700 hover:bg-gray-900 flex items-center gap-3"
                  >
                    <Copy className="w-4 h-4" /> {t('feed.actions.copyLink')}
                  </button>
                  <button
                    onClick={() => handleHidePost(post)}
                    className="w-full px-5 py-3 text-left text-[14px] font-semibold text-gray-700 hover:bg-gray-900 flex items-center gap-3"
                  >
                    <EyeOff className="w-4 h-4" /> {t('feed.actions.notInterested')}
                  </button>
                  {Number(post.creator_id) !== Number(user.telegram_id) && (
                    <>
                      <div className="h-px bg-gray-100 mx-4 my-1" />
                      <button
                        onClick={() => handleBlockUser(post)}
                        className="w-full px-4 py-2.5 text-left text-sm text-white hover:bg-white/10 flex items-center gap-2"
                      >
                        <UserX className="w-4 h-4" /> {t('feed.actions.block')}
                      </button>
                      <button
                        onClick={() => handleReportPost(post)}
                        className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-white/10 flex items-center gap-2"
                      >
                        <Flag className="w-4 h-4" /> {t('feed.actions.report')}
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
            <p className="text-white/60 mb-8 leading-relaxed">
              {t('feed.lock.subtitle', { name: post.creator?.first_name })}
            </p>
            
            {post.unlock_price > 0 ? (
              <motion.button
                className="w-full py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-black rounded-2xl font-bold text-[15px] shadow-[0_0_30px_-5px_rgba(251,191,36,0.4)] flex items-center justify-center gap-2 hover:opacity-90 transition-opacity relative overflow-hidden group"
                whileTap={{ scale: 0.98 }}
                onClick={() => setPurchaseModal(post)}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                <Star className="w-5 h-5 fill-current" />
                {t('feed.lock.unlockFor', { amount: Math.ceil(post.unlock_price) })}
              </motion.button>
            ) : (
              <motion.button
                className="w-full py-4 bg-white text-white rounded-2xl font-bold text-[15px] shadow-[0_0_30px_-5px_rgba(255,255,255,0.3)] flex items-center justify-center gap-2 hover:bg-gray-900 transition-colors"
                whileTap={{ scale: 0.98 }}
                onClick={() => post.creator && onCreatorClick(post.creator)}
              >
                {post.visibility === 'followers' ? (
                  <><Eye className="w-5 h-5" /> {t('feed.lock.followToView')}</>
                ) : (
                  <><CheckCircle className="w-5 h-5" /> {t('feed.lock.subscribeToView')}</>
                )}
              </motion.button>
            )}
          </div>
        </div>
      ) : null}

      {/* Action Bar - 8-bit Pixel Style */}
      <div className="px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-5">
            <button className="active:scale-90 transition-transform" onClick={() => handleLike(post)}>
              <PixelHeart className={`w-7 h-7 ${post.liked ? 'text-red-500' : 'text-white'}`} filled={post.liked} />
            </button>
            <button className="active:scale-90 transition-transform" onClick={() => handleViewCommenters(post)}>
              <PixelComment className="w-7 h-7 text-white" />
            </button>
            <button className="active:scale-90 transition-transform">
              <PixelShare className="w-7 h-7 text-white" />
            </button>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => handleSave(post)} className="active:scale-90 transition-transform">
              <PixelBookmark className={`w-7 h-7 text-white`} filled={post.saved} />
            </button>
            {/* Gift Star Button */}
            <button
              className="flex flex-col items-center active:scale-90 transition-transform"
              onClick={() => {/* TODO: Open gift modal */}}
            >
              <PixelStar
                className={`w-7 h-7 ${(post.gifts_count || 0) > 0 ? 'text-sky-400' : 'text-yellow-400'}`}
                filled={(post.gifts_count || 0) > 0}
              />
              {(post.gifts_count || 0) > 0 && (
                <span className="text-[10px] font-bold text-sky-400 -mt-0.5">{post.gifts_count}</span>
              )}
            </button>
          </div>
        </div>

        {/* Likes Count */}
        {(post.likes_count || 0) > 0 && (
          <button className="block mt-2" onClick={() => handleViewLikes(post)}>
            <span className="text-sm font-semibold text-white">
              {t('feed.likesCount', { count: post.likes_count || 0 })}
            </span>
          </button>
        )}

        {/* Caption */}
        {post.content && (
          <div className="mt-2">
            <span className="text-sm text-white">
              <span className="font-semibold mr-1">{post.creator?.username || t('feed.userFallback')}</span>
              {post.content}
            </span>
          </div>
        )}

        {/* View comments */}
        {post.comments_count > 0 && (
          <button className="block mt-2" onClick={() => handleViewCommenters(post)}>
            <span className="text-sm text-gray-400">
              {t('feed.viewComments', { count: post.comments_count })}
            </span>
          </button>
        )}

        {/* Add comment row */}
        <button className="flex items-center gap-2 mt-2 w-full" onClick={() => handleViewCommenters(post)}>
          <img src={user.avatar_url || 'https://i.pravatar.cc/150?u=' + user.telegram_id} className="w-6 h-6 rounded-full object-cover" alt="" />
          <span className="text-sm text-gray-500">{t('feed.addComment')}</span>
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
      return t('feed.lock.unlockFor', { amount: Math.ceil(post.unlock_price) })
    }
    if (post.is_nsfw && !post.is_subscribed) {
      return t('feed.lock.nsfw')
    }
    if (post.visibility === 'subscribers' && !post.is_subscribed) {
      return t('feed.lock.subscribers')
    }
    if (post.visibility === 'followers' && !post.is_following && !post.is_subscribed) {
      return t('feed.lock.followers')
    }
    return t('feed.lock.default')
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
    <div className="bg-black max-w-lg mx-auto relative pb-20">
      {/* Live Now Section - Stories style */}
      {(livestreams.length > 0 || user.is_creator) && (
        <div className="border-b border-gray-800 py-3 px-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-[13px] font-semibold text-white">{t('feed.live.title')}</span>
            </div>
            {user.is_creator && onGoLive && (
              <button
                onClick={onGoLive}
                className="text-[13px] font-semibold text-blue-500"
              >
                {t('feed.live.goLive')}
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
                      {t('feed.live.badge')}
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
              {t('feed.live.none')}
            </p>
          )}
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="border-b border-gray-800 py-4 px-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[14px] font-semibold text-gray-500">{t('feed.suggested.title')}</span>
            <button className="text-[13px] font-semibold text-white">
              {t('feed.suggested.seeAll')}
            </button>
          </div>

          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
            {suggestions.map((creator) => (
              <div
                key={creator.telegram_id}
                className="min-w-[100px] flex flex-col items-center"
              >
                <button
                  onClick={() => onCreatorClick(creator)}
                  className="flex flex-col items-center"
                >
                  <div className="relative mb-2">
                    <img
                      src={creator.avatar_url || `https://i.pravatar.cc/150?u=${creator.telegram_id}`}
                      className="w-16 h-16 rounded-full object-cover border-2 border-white/10"
                      alt={creator.first_name}
                    />
                    {creator.is_verified && (
                      <div className="absolute bottom-0 right-0 bg-black rounded-full p-[2px]">
                        <CheckCircle className="w-3.5 h-3.5 text-blue-500 fill-blue-500" />
                      </div>
                    )}
                  </div>
                  <span className="text-[12px] font-medium text-white truncate w-full text-center max-w-[90px]">
                    {creator.username || creator.first_name}
                  </span>
                </button>
                <button
                  onClick={() => onCreatorClick(creator)}
                  className="mt-2 px-4 py-1 bg-blue-500 text-white text-[11px] font-semibold rounded-md"
                >
                  {t('feed.actions.follow')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Posts Feed - Simple render for smooth scroll */}
      <div className="bg-black">
        {posts.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <div className="w-16 h-16 border-2 border-white rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">{t('feed.empty.title')}</h3>
            <p className="text-sm text-gray-400">{t('feed.empty.subtitle')}</p>
          </div>
        ) : (
          <div>
            {visiblePosts.map((post) => renderPostCard(post))}

            {visibleCount < posts.length && (
              <div ref={loadMoreRef} className="flex items-center justify-center py-8">
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
                <h3 className="text-xl font-bold text-white">{t('feed.purchase.title')}</h3>
                <button onClick={() => !purchasing && setPurchaseModal(null)} className="p-1 rounded-full hover:bg-white/10 transition-colors">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="text-center mb-8 relative">
                <div className="absolute inset-0 bg-yellow-500/20 blur-3xl rounded-full" />
                <div className="relative w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <Star className="w-10 h-10 text-white fill-white" />
                </div>
                <p className="text-gray-400 text-sm font-medium mb-2">{t('feed.purchase.payWithStars')}</p>
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
                    <p className="text-gray-500 text-sm">{t('feed.purchase.creatorShare')}</p>
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
                    {t('feed.purchase.payAmount', { amount: Math.ceil(purchaseModal.unlock_price) })}
                  </>
                )}
              </motion.button>

              <p className="text-center text-gray-500 text-xs mt-4">
                {t('feed.purchase.poweredBy')}
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
        title={t('feed.likesTitle')}
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

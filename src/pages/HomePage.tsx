import { useState, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, MessageCircle, Bookmark, Share2, MoreHorizontal, CheckCircle, Lock, Eye, DollarSign, X, Users, Trash2, EyeOff, Edit3, Flag, Copy, UserX, Volume2, VolumeX, Play } from 'lucide-react'
import { getFeed, getSuggestedCreators, likePost, unlikePost, savePost, unsavePost, purchaseContent, deletePost, type User, type Post } from '../lib/api'
import { getLivestreams, subscribeToLivestreams, type Livestream } from '../lib/livestreamApi'
import PostDetail from '../components/PostDetail'
import { reportPost } from '../lib/reportApi'
import { blockUser } from '../lib/settingsApi'

interface HomePageProps {
  user: User
  onCreatorClick: (creator: any) => void
  onLivestreamClick?: (livestreamId: string) => void
  onGoLive?: () => void
  scrollElement?: HTMLElement | null
}

const filterLiveStreams = (streams: Livestream[]) =>
  streams.filter(stream => stream.status === 'live' && !!stream.started_at && !!stream.agora_channel && (stream.viewer_count || 0) > 0)

// Video Player Component with mute/unmute and tap to pause
function FeedVideoPlayer({ src }: { src: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isMuted, setIsMuted] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsMuted(!isMuted)
  }

  const togglePause = () => {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      video.play().catch(() => {})
      setIsPaused(false)
    } else {
      video.pause()
      setIsPaused(true)
    }
  }

  return (
    <div className="relative w-full h-full bg-black">
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
        className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        playsInline
        loop
        muted={isMuted}
        autoPlay
        preload="auto"
        onClick={togglePause}
        onLoadedData={() => setIsLoaded(true)}
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

      {/* Mute/Unmute button */}
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
    </div>
  )
}

// Instagram-style carousel for multiple images
function MediaCarousel({ urls, canView }: { urls: string[]; canView: boolean }) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleScroll = () => {
    if (!containerRef.current) return
    const scrollLeft = containerRef.current.scrollLeft
    const width = containerRef.current.offsetWidth
    const newIndex = Math.round(scrollLeft / width)
    if (newIndex !== currentIndex) {
      setCurrentIndex(newIndex)
    }
  }

  if (!canView || urls.length === 0) return null

  return (
    <div className="relative w-full aspect-square bg-black">
      {/* Scrollable container */}
      <div
        ref={containerRef}
        className="flex w-full h-full overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        onScroll={handleScroll}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {urls.map((url, index) => (
          <div key={index} className="flex-none w-full h-full snap-center">
            {url.match(/\.(mp4|webm)$/i) ? (
              <FeedVideoPlayer src={url} />
            ) : (
              <img
                src={url}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover"
              />
            )}
          </div>
        ))}
      </div>

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

export default function HomePage({ user, onCreatorClick, onLivestreamClick, onGoLive, scrollElement }: HomePageProps) {
  const [posts, setPosts] = useState<Post[]>([])
  const [suggestions, setSuggestions] = useState<User[]>([])
  const [livestreams, setLivestreams] = useState<Livestream[]>([])
  const [loading, setLoading] = useState(true)
  const [purchaseModal, setPurchaseModal] = useState<Post | null>(null)
  const [purchasing, setPurchasing] = useState(false)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [postMenuOpen, setPostMenuOpen] = useState<number | null>(null)
  const defaultScrollElement = typeof document !== 'undefined' ? (document.querySelector('main') as HTMLElement | null) || document.documentElement : null
  const fallbackScrollElement = defaultScrollElement ?? (typeof document !== 'undefined' ? document.documentElement : null)
  const feedVirtualizer = useVirtualizer({
    count: posts.length,
    getScrollElement: () => (scrollElement ?? fallbackScrollElement)!,
    estimateSize: () => 580,
    overscan: 3,
    measureElement: element => element?.getBoundingClientRect().height || 0,
  })

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const unsubscribe = subscribeToLivestreams((streams) => setLivestreams(filterLiveStreams(streams)))
    return () => {
      unsubscribe()
    }
  }, [])

  const loadData = async () => {
    const [feedPosts, suggestedCreators, liveStreams] = await Promise.all([
      getFeed(user.telegram_id),
      getSuggestedCreators(6),
      getLivestreams()
    ])
    setPosts(feedPosts)
    setSuggestions(suggestedCreators)
    setLivestreams(filterLiveStreams(liveStreams))
    setLoading(false)
  }

  const handleLike = async (post: Post) => {
    if (!post.can_view) return
    if (post.liked) {
      await unlikePost(user.telegram_id, post.id)
      setPosts(posts.map(p => p.id === post.id ? { ...p, liked: false, likes_count: Math.max(0, (p.likes_count || 0) - 1) } : p))
    } else {
      await likePost(user.telegram_id, post.id)
      setPosts(posts.map(p => p.id === post.id ? { ...p, liked: true, likes_count: (p.likes_count || 0) + 1 } : p))
    }
  }

  const handleSave = async (post: Post) => {
    if (post.saved) {
      await unsavePost(user.telegram_id, post.id)
      setPosts(posts.map(p => p.id === post.id ? { ...p, saved: false } : p))
    } else {
      await savePost(user.telegram_id, post.id)
      setPosts(posts.map(p => p.id === post.id ? { ...p, saved: true } : p))
    }
  }

  const handlePurchase = async (post: Post) => {
    setPurchasing(true)
    const result = await purchaseContent(user.telegram_id, post.id, post.unlock_price)
    setPurchasing(false)

    if (result.success) {
      setPosts(posts.map(p => p.id === post.id ? { ...p, can_view: true, is_purchased: true } : p))
      setPurchaseModal(null)
    } else {
      alert(result.error || 'Purchase failed')
    }
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

  const openPostDetail = (post: Post) => {
    if (post.can_view) {
      setSelectedPost(post)
    }
  }

  const formatTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return 'Just now'
    if (hours < 24) return hours + 'h'
    return Math.floor(hours / 24) + 'd'
  }

  const renderPostCard = (post: Post) => (
    <div
      key={post.id}
      className="bg-white border-b border-gray-100"
    >
      {/* Header - Instagram style */}
      <div className="flex items-center justify-between px-4 py-3">
        <button className="flex items-center gap-3" onClick={() => post.creator && onCreatorClick(post.creator)}>
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500 p-[2px]">
              <img
                src={post.creator?.avatar_url || 'https://i.pravatar.cc/150?u=' + post.creator_id}
                alt=""
                loading="lazy"
                className="w-full h-full rounded-full object-cover bg-white"
              />
            </div>
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1">
              <span className="font-semibold text-[14px] text-gray-900">{post.creator?.username || 'creator'}</span>
              {post.creator?.is_verified && (
                <CheckCircle className="w-3.5 h-3.5 text-blue-500 fill-blue-500" />
              )}
            </div>
          </div>
        </button>
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setPostMenuOpen(postMenuOpen === post.id ? null : post.id)
            }}
            className="p-2 -mr-2 text-gray-900"
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
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 min-w-[180px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {Number(post.creator_id) === Number(user.telegram_id) && (
                    <>
                      <button
                        onClick={() => {
                          setSelectedPost(post)
                          setPostMenuOpen(null)
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-50 flex items-center gap-3"
                      >
                        <Edit3 className="w-4 h-4" /> Edit
                      </button>
                      <button
                        onClick={() => handleDeletePost(post)}
                        className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 flex items-center gap-3"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                      <div className="h-px bg-gray-100 my-1" />
                    </>
                  )}
                  <button
                    onClick={() => handleCopyLink(post)}
                    className="w-full px-4 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-50 flex items-center gap-3"
                  >
                    <Copy className="w-4 h-4" /> Copy link
                  </button>
                  <button
                    onClick={() => handleHidePost(post)}
                    className="w-full px-4 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-50 flex items-center gap-3"
                  >
                    <EyeOff className="w-4 h-4" /> Not interested
                  </button>
                  {Number(post.creator_id) !== Number(user.telegram_id) && (
                    <>
                      <div className="h-px bg-gray-100 my-1" />
                      <button
                        onClick={() => handleBlockUser(post)}
                        className="w-full px-4 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-50 flex items-center gap-3"
                      >
                        <UserX className="w-4 h-4" /> Block
                      </button>
                      <button
                        onClick={() => handleReportPost(post)}
                        className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 flex items-center gap-3"
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

      {/* Media - Full width, no rounded corners */}
      {post.media_url && post.can_view ? (
        <div className="w-full bg-black">
          <MediaCarousel
            urls={post.media_urls && post.media_urls.length > 0 ? post.media_urls : [post.media_url]}
            canView={post.can_view}
          />
        </div>
      ) : post.media_url ? (
        // Locked content
        <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 text-white aspect-square flex flex-col items-center justify-center text-center overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent)]" />
          <div className="relative z-10 p-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-white/10 flex items-center justify-center mb-4 backdrop-blur-sm">
              <Lock className="w-8 h-8 text-white/90" />
            </div>
            <h3 className="text-lg font-semibold mb-2">{getLockReason(post)}</h3>
            <p className="text-sm text-white/60 mb-6 max-w-[280px] mx-auto">Unlock premium content from {post.creator?.first_name || 'this creator'}</p>
            {post.unlock_price > 0 ? (
              <motion.button
                className="px-6 py-3 bg-white text-gray-900 rounded-lg text-sm font-semibold flex items-center gap-2 mx-auto"
                whileTap={{ scale: 0.95 }}
                onClick={() => setPurchaseModal(post)}
              >
                <DollarSign className="w-4 h-4" />
                Unlock for ${post.unlock_price.toFixed(2)}
              </motion.button>
            ) : (
              <motion.button
                className="px-6 py-3 bg-white text-gray-900 rounded-lg text-sm font-semibold flex items-center gap-2 mx-auto"
                whileTap={{ scale: 0.95 }}
                onClick={() => post.creator && onCreatorClick(post.creator)}
              >
                {post.visibility === 'followers' ? (
                  <><Eye className="w-4 h-4" /> Follow to View</>
                ) : (
                  <><CheckCircle className="w-4 h-4" /> Subscribe to View</>
                )}
              </motion.button>
            )}
          </div>
        </div>
      ) : null}

      {/* Action Bar - Instagram style */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              className="active:scale-90 transition-transform"
              onClick={() => handleLike(post)}
            >
              <Heart
                className={`w-6 h-6 ${post.liked ? 'text-red-500 fill-red-500' : 'text-gray-900 hover:text-gray-600'}`}
                strokeWidth={1.5}
              />
            </button>

            <button
              className="active:scale-90 transition-transform"
              onClick={() => openPostDetail(post)}
            >
              <MessageCircle className="w-6 h-6 text-gray-900 hover:text-gray-600" strokeWidth={1.5} />
            </button>

            <button className="active:scale-90 transition-transform">
              <Share2 className="w-6 h-6 text-gray-900 hover:text-gray-600" strokeWidth={1.5} />
            </button>
          </div>

          <button
            onClick={() => handleSave(post)}
            className="active:scale-90 transition-transform"
          >
            <Bookmark
              className={`w-6 h-6 ${post.saved ? 'text-gray-900 fill-gray-900' : 'text-gray-900 hover:text-gray-600'}`}
              strokeWidth={1.5}
            />
          </button>
        </div>
      </div>

      {/* Likes Count */}
      {(post.likes_count || 0) > 0 && (
        <div className="px-4 pb-1">
          <span className="text-[14px] font-semibold text-gray-900">
            {post.likes_count.toLocaleString()} {post.likes_count === 1 ? 'like' : 'likes'}
          </span>
        </div>
      )}

      {/* Caption */}
      {post.content && (
        <div className="px-4 pb-1">
          <p className="text-[14px] text-gray-900 leading-[1.4]">
            <button
              onClick={() => post.creator && onCreatorClick(post.creator)}
              className="font-semibold mr-1.5 hover:opacity-70"
            >
              {post.creator?.username}
            </button>
            {post.content}
          </p>
        </div>
      )}

      {/* View comments */}
      {post.comments_count > 0 && (
        <button
          className="px-4 py-1 text-[14px] text-gray-500 text-left w-full"
          onClick={() => openPostDetail(post)}
        >
          View all {post.comments_count} comments
        </button>
      )}

      {/* Add comment row */}
      <button
        className="px-4 py-2 flex items-center gap-3 w-full"
        onClick={() => openPostDetail(post)}
      >
        <img
          src={user.avatar_url || 'https://i.pravatar.cc/150?u=' + user.telegram_id}
          className="w-6 h-6 rounded-full object-cover"
          alt=""
        />
        <span className="text-[14px] text-gray-400">Add a comment...</span>
      </button>

      {/* Timestamp */}
      <div className="px-4 pb-4">
        <span className="text-[11px] text-gray-400 uppercase tracking-wide">{formatTime(post.created_at)}</span>
      </div>
    </div>
  )

  const getLockReason = (post: Post) => {
    if (post.unlock_price > 0 && !post.is_purchased) {
      return `Pay $${post.unlock_price.toFixed(2)} to unlock`
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
      <div className="p-4 space-y-4">
        {[1,2,3].map(i => (
          <div key={i} className="card p-4 animate-pulse">
            <div className="flex gap-3 mb-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-16"></div>
              </div>
            </div>
            <div className="h-48 bg-gray-200 rounded-xl"></div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="bg-white max-w-lg mx-auto">
      {/* Live Now Section - Stories style */}
      {(livestreams.length > 0 || user.is_creator) && (
        <div className="border-b border-gray-100 py-3 px-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-[13px] font-semibold text-gray-900">Live</span>
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
                  <span className="text-[11px] text-gray-900 mt-1.5 truncate w-full text-center">
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
        <div className="border-b border-gray-100 py-4 px-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[14px] font-semibold text-gray-500">Suggested for you</span>
            <button className="text-[13px] font-semibold text-gray-900">
              See All
            </button>
          </div>

          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
            {suggestions.map((creator) => (
              <div
                key={creator.telegram_id}
                className="min-w-[150px] bg-gray-50 rounded-lg p-4 flex flex-col items-center"
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
                  <span className="text-[13px] font-semibold text-gray-900 truncate w-full text-center">
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

      {/* Posts Feed */}
      <div>
        {posts.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <div className="w-16 h-16 border-2 border-gray-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-8 h-8 text-gray-900" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Welcome to Veronica</h3>
            <p className="text-[14px] text-gray-500">Follow creators to see their posts in your feed.</p>
          </div>
        ) : (
          <div className="relative" style={{ height: feedVirtualizer.getTotalSize() || posts.length * 580 }}>
            {feedVirtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                className="absolute left-0 w-full"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {renderPostCard(posts[virtualRow.index])}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Purchase Modal */}
      <AnimatePresence>
        {purchaseModal && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPurchaseModal(null)}
          >
            <motion.div
              className="bg-white/90 backdrop-blur-xl rounded-[2rem] p-6 max-w-sm w-full shadow-2xl border border-white/50"
              initial={{ scale: 0.9, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 30, opacity: 0 }}
              transition={{ type: "spring", duration: 0.5 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900">Unlock Content</h3>
                <button onClick={() => setPurchaseModal(null)} className="p-1 rounded-full hover:bg-gray-100 transition-colors">
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              <div className="text-center mb-8 relative">
                <div className="absolute inset-0 bg-green-400/20 blur-3xl rounded-full" />
                <div className="relative w-20 h-20 bg-gradient-to-br from-green-100 to-green-50 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner border border-white/50">
                  <DollarSign className="w-10 h-10 text-green-600" />
                </div>
                <p className="text-gray-500 text-sm font-medium mb-1">One-time purchase</p>
                <p className="text-4xl font-bold text-green-600 tracking-tight">${purchaseModal.unlock_price.toFixed(2)}</p>
              </div>

              <div className="bg-gray-50/80 rounded-2xl p-4 mb-6 border border-gray-100">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-500">Your balance</span>
                  <span className="font-bold text-gray-800">{user.balance} tokens</span>
                </div>
                <div className="w-full h-[1px] bg-gray-200 my-2" />
                <div className="flex justify-between text-sm items-center">
                  <span className="text-gray-500">Remaining</span>
                  <span className={`font-bold ${user.balance >= purchaseModal.unlock_price ? 'text-gray-800' : 'text-red-500'}`}>
                    {(user.balance - purchaseModal.unlock_price).toFixed(2)} tokens
                  </span>
                </div>
              </div>

              <motion.button
                className={`w-full py-3.5 rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 shadow-lg transition-all
                  ${user.balance >= purchaseModal.unlock_price 
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-green-500/25' 
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                whileHover={user.balance >= purchaseModal.unlock_price ? { scale: 1.02, y: -1 } : {}}
                whileTap={user.balance >= purchaseModal.unlock_price ? { scale: 0.98 } : {}}
                onClick={() => handlePurchase(purchaseModal)}
                disabled={purchasing || user.balance < purchaseModal.unlock_price}
              >
                {purchasing ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    {user.balance >= purchaseModal.unlock_price ? 'Confirm Payment' : 'Insufficient Balance'}
                  </>
                )}
              </motion.button>

              {user.balance < purchaseModal.unlock_price && (
                <button className="w-full mt-3 py-2 text-sm text-of-blue font-semibold hover:bg-blue-50 rounded-xl transition-colors">
                  Top up wallet
                </button>
              )}
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
    </div>
  )
}

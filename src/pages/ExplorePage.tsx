import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence, type PanInfo } from 'framer-motion'
import { Play, Heart, MessageCircle, Share2, X, Volume2, VolumeX } from 'lucide-react'
import { type User, type Post, getVideoPosts, likePost, unlikePost } from '../lib/api'

interface ExplorePageProps {
  user: User
  onCreatorClick: (creator: any) => void
}

// Video Thumbnail Component with loading state
function VideoThumbnail({ video, onClick }: { video: Post; onClick: () => void }) {
  const [isLoaded, setIsLoaded] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const videoEl = videoRef.current
    if (!videoEl) return

    const handleLoaded = () => setIsLoaded(true)

    // Check if already loaded
    if (videoEl.readyState >= 2) {
      setIsLoaded(true)
      return
    }

    videoEl.addEventListener('loadeddata', handleLoaded)
    return () => videoEl.removeEventListener('loadeddata', handleLoaded)
  }, [])

  return (
    <motion.div
      className="relative aspect-[9/16] bg-gray-900 cursor-pointer overflow-hidden"
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
    >
      {/* Loading Spinner */}
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Video Thumbnail - hidden until loaded */}
      <video
        ref={videoRef}
        src={video.media_url}
        className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        muted
        playsInline
        preload="metadata"
      />

      {/* Play Icon Overlay - only show when loaded */}
      {isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Play className="w-8 h-8 text-white/80 fill-white/80" />
        </div>
      )}

      {/* Views/Likes Count - only show when loaded */}
      {isLoaded && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1">
          <Play className="w-3 h-3 text-white fill-white" />
          <span className="text-xs text-white font-medium">{video.likes_count || 0}</span>
        </div>
      )}
    </motion.div>
  )
}

export default function ExplorePage({ user, onCreatorClick }: ExplorePageProps) {
  const [videos, setVideos] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVideoIndex, setSelectedVideoIndex] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const lastVideoRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    loadVideos()
  }, [user.telegram_id])

  const loadVideos = async (offset = 0) => {
    if (offset === 0) setLoading(true)
    const newVideos = await getVideoPosts(user.telegram_id, 30, offset)

    if (offset === 0) {
      setVideos(newVideos)
    } else {
      setVideos(prev => [...prev, ...newVideos])
    }

    setHasMore(newVideos.length === 30)
    setLoading(false)
  }

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      loadVideos(videos.length)
    }
  }, [loading, hasMore, videos.length])

  // Infinite scroll observer
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()

    observerRef.current = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    if (lastVideoRef.current) {
      observerRef.current.observe(lastVideoRef.current)
    }

    return () => observerRef.current?.disconnect()
  }, [loadMore, hasMore, loading])

  const openReels = (index: number) => {
    setSelectedVideoIndex(index)
  }

  const closeReels = () => {
    setSelectedVideoIndex(null)
  }

  const handleLike = async (postId: number) => {
    const video = videos.find(v => v.id === postId)
    if (!video) return

    const wasLiked = video.liked
    // Optimistic update
    setVideos(prev => prev.map(v =>
      v.id === postId
        ? { ...v, liked: !wasLiked, likes_count: (v.likes_count || 0) + (wasLiked ? -1 : 1) }
        : v
    ))

    // API call
    const success = wasLiked
      ? await unlikePost(user.telegram_id, postId)
      : await likePost(user.telegram_id, postId)

    if (!success) {
      // Revert on failure
      setVideos(prev => prev.map(v =>
        v.id === postId
          ? { ...v, liked: wasLiked, likes_count: (v.likes_count || 0) + (wasLiked ? 1 : -1) }
          : v
      ))
    }
  }

  if (loading && videos.length === 0) {
    return (
      <div className="min-h-full bg-black flex items-center justify-center">
        <div className="w-10 h-10 border-3 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-full bg-black">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-black/90 backdrop-blur-sm px-4 py-3 border-b border-white/10">
        <h1 className="text-xl font-bold text-white text-center">Explore</h1>
      </div>

      {/* Video Grid */}
      <div className="grid grid-cols-3 gap-0.5 p-0.5">
        {videos.map((video, index) => (
          <div
            key={video.id}
            ref={index === videos.length - 1 ? lastVideoRef : null}
          >
            <VideoThumbnail
              video={video}
              onClick={() => openReels(index)}
            />
          </div>
        ))}
      </div>

      {/* Loading More Indicator */}
      {loading && videos.length > 0 && (
        <div className="py-6 flex justify-center">
          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty State */}
      {!loading && videos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <Play className="w-16 h-16 text-gray-600 mb-4" />
          <h3 className="text-lg font-semibold text-white mb-2">No Videos Yet</h3>
          <p className="text-gray-400 text-center">Be the first to upload a video!</p>
        </div>
      )}

      {/* Reels Viewer */}
      <AnimatePresence>
        {selectedVideoIndex !== null && (
          <ReelsViewer
            videos={videos}
            initialIndex={selectedVideoIndex}
            onClose={closeReels}
            onLike={handleLike}
            onCreatorClick={onCreatorClick}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// Reels Viewer Component
interface ReelsViewerProps {
  videos: Post[]
  initialIndex: number
  onClose: () => void
  onLike: (postId: number) => void
  onCreatorClick: (creator: any) => void
}

function ReelsViewer({ videos, initialIndex, onClose, onLike, onCreatorClick }: ReelsViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [isMuted, setIsMuted] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [loadedVideos, setLoadedVideos] = useState<Set<number>>(new Set())
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)

  const currentVideo = videos[currentIndex]

  // Autoplay current video when index changes or video loads
  useEffect(() => {
    const playCurrentVideo = () => {
      videoRefs.current.forEach((video, index) => {
        if (index === currentIndex) {
          video.currentTime = 0
          video.muted = isMuted
          const playPromise = video.play()
          if (playPromise) {
            playPromise.catch(() => {
              // Autoplay was prevented, try muted
              video.muted = true
              video.play().catch(() => {})
            })
          }
          setIsPaused(false)
        } else {
          video.pause()
        }
      })
    }

    playCurrentVideo()
  }, [currentIndex, isMuted])

  const handleVideoLoaded = (index: number) => {
    setLoadedVideos(prev => new Set(prev).add(index))
    // If this is the current video, autoplay it
    if (index === currentIndex) {
      const video = videoRefs.current.get(index)
      if (video) {
        video.muted = isMuted
        const playPromise = video.play()
        if (playPromise) {
          playPromise.catch(() => {
            video.muted = true
            video.play().catch(() => {})
          })
        }
        setIsPaused(false)
      }
    }
  }

  const handleDragEnd = (_: any, info: PanInfo) => {
    const threshold = 50
    const velocity = info.velocity.y

    if (info.offset.y < -threshold || velocity < -500) {
      // Swiped up - next video
      if (currentIndex < videos.length - 1) {
        setCurrentIndex(currentIndex + 1)
      }
    } else if (info.offset.y > threshold || velocity > 500) {
      // Swiped down - previous video
      if (currentIndex > 0) {
        setCurrentIndex(currentIndex - 1)
      }
    }
  }

  const togglePause = () => {
    const video = videoRefs.current.get(currentIndex)
    if (video) {
      if (video.paused) {
        video.play()
        setIsPaused(false)
      } else {
        video.pause()
        setIsPaused(true)
      }
    }
  }

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsMuted(!isMuted)
  }

  const handleLikeClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onLike(currentVideo.id)
  }

  const handleCreatorClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (currentVideo.creator) {
      onCreatorClick(currentVideo.creator)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] bg-black"
    >
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 left-4 z-50 p-2 bg-black/50 rounded-full"
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {/* Mute Button */}
      <button
        onClick={toggleMute}
        className="absolute top-4 right-4 z-50 p-2 bg-black/50 rounded-full"
      >
        {isMuted ? (
          <VolumeX className="w-6 h-6 text-white" />
        ) : (
          <Volume2 className="w-6 h-6 text-white" />
        )}
      </button>

      {/* Video Container */}
      <motion.div
        ref={containerRef}
        className="h-full w-full"
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        onClick={togglePause}
      >
        <motion.div
          className="h-full w-full"
          animate={{ y: -currentIndex * window.innerHeight }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          {videos.map((video, index) => (
            <div
              key={video.id}
              className="h-screen w-full relative flex items-center justify-center bg-black"
            >
              {/* Loading Spinner - shows until video is loaded */}
              {!loadedVideos.has(index) && Math.abs(index - currentIndex) <= 1 && (
                <div className="absolute inset-0 flex items-center justify-center z-20">
                  <div className="w-12 h-12 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}

              {/* Video - hidden until loaded */}
              <video
                ref={el => {
                  if (el) videoRefs.current.set(index, el)
                }}
                src={video.media_url}
                className={`h-full w-full object-contain transition-opacity duration-300 ${loadedVideos.has(index) ? 'opacity-100' : 'opacity-0'}`}
                loop
                playsInline
                muted={isMuted}
                autoPlay={index === currentIndex}
                preload={Math.abs(index - currentIndex) <= 1 ? 'auto' : 'none'}
                onLoadedData={() => handleVideoLoaded(index)}
                onCanPlay={() => handleVideoLoaded(index)}
              />

              {/* Pause Indicator */}
              {isPaused && index === currentIndex && loadedVideos.has(index) && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                  <div className="w-20 h-20 bg-black/50 rounded-full flex items-center justify-center">
                    <Play className="w-10 h-10 text-white fill-white ml-1" />
                  </div>
                </div>
              )}

              {/* Video Info Overlay - only show when loaded */}
              {index === currentIndex && loadedVideos.has(index) && (
                <div className="absolute bottom-20 left-0 right-16 p-4 pointer-events-auto z-10">
                  {/* Creator Info */}
                  <div
                    className="flex items-center gap-3 mb-3"
                    onClick={handleCreatorClick}
                  >
                    <img
                      src={video.creator?.avatar_url || `https://i.pravatar.cc/150?u=${video.creator_id}`}
                      alt=""
                      className="w-10 h-10 rounded-full border-2 border-white object-cover"
                    />
                    <span className="text-white font-semibold text-sm">
                      @{video.creator?.username || 'user'}
                    </span>
                  </div>

                  {/* Caption */}
                  {video.content && (
                    <p className="text-white text-sm line-clamp-2">{video.content}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </motion.div>
      </motion.div>

      {/* Right Side Action Buttons - only show when video loaded */}
      {loadedVideos.has(currentIndex) && (
        <div className="absolute right-3 bottom-32 flex flex-col items-center gap-6 z-50">
          {/* Like Button */}
          <button
            onClick={handleLikeClick}
            className="flex flex-col items-center"
          >
            <div className={`p-2 rounded-full ${currentVideo.liked ? 'text-red-500' : 'text-white'}`}>
              <Heart className={`w-8 h-8 ${currentVideo.liked ? 'fill-red-500' : ''}`} />
            </div>
            <span className="text-white text-xs font-medium">{currentVideo.likes_count || 0}</span>
          </button>

          {/* Comment Button */}
          <button className="flex flex-col items-center">
            <div className="p-2 text-white">
              <MessageCircle className="w-8 h-8" />
            </div>
            <span className="text-white text-xs font-medium">{currentVideo.comments_count || 0}</span>
          </button>

          {/* Share Button */}
          <button className="flex flex-col items-center">
            <div className="p-2 text-white">
              <Share2 className="w-8 h-8" />
            </div>
            <span className="text-white text-xs font-medium">Share</span>
          </button>

          {/* Creator Avatar */}
          <button onClick={handleCreatorClick}>
            <img
              src={currentVideo.creator?.avatar_url || `https://i.pravatar.cc/150?u=${currentVideo.creator_id}`}
              alt=""
              className="w-12 h-12 rounded-full border-2 border-white object-cover"
            />
          </button>
        </div>
      )}

      {/* Progress Indicator */}
      <div className="absolute top-12 left-0 right-0 flex justify-center gap-1 px-4 z-50">
        {videos.slice(Math.max(0, currentIndex - 2), currentIndex + 3).map((_, i) => {
          const actualIndex = Math.max(0, currentIndex - 2) + i
          return (
            <div
              key={actualIndex}
              className={`h-0.5 flex-1 max-w-8 rounded-full transition-colors ${
                actualIndex === currentIndex ? 'bg-white' : 'bg-white/30'
              }`}
            />
          )
        })}
      </div>
    </motion.div>
  )
}

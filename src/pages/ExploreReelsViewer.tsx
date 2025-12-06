import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, type PanInfo } from 'framer-motion'
import { ArrowLeft, Play, Heart, MessageCircle, Send, MoreHorizontal, Volume2, VolumeX } from 'lucide-react'
import type { Post } from '../lib/api'
import useSharedVideoPlayback from '../hooks/useSharedVideoPlayback'

interface ReelsViewerProps {
  videos: Post[]
  initialIndex: number
  onClose: () => void
  onLike: (postId: number) => void
  onCreatorClick: (creator: any) => void
}

export default function ExploreReelsViewer({
  videos,
  initialIndex,
  onClose,
  onLike,
  onCreatorClick,
}: ReelsViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [isMuted, setIsMuted] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const [loadedVideos, setLoadedVideos] = useState<Set<number>>(new Set())
  const [thumbnailsLoaded, setThumbnailsLoaded] = useState<Set<number>>(new Set())
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)
  const containerHeight = typeof window !== 'undefined' ? window.innerHeight : 800
  const videoIdForIndex = useCallback((idx: number) => `reel-${idx}-${videos[idx]?.id ?? idx}`, [videos])
  const { activeId, requestPlay, clearActive } = useSharedVideoPlayback()

  // Current video data
  const currentVideo = videos[currentIndex]

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      videoRefs.current.forEach(video => {
        video.pause()
        video.src = ''
      })
      videoRefs.current.clear()
    }
  }, [])

  // Play current video, pause others
  useEffect(() => {
    videoRefs.current.forEach((video, index) => {
      const id = videoIdForIndex(index)
      const shouldPlay = index === currentIndex && !isPaused

      if (!shouldPlay) {
        if (!video.paused) {
          video.pause()
        }
        return
      }

      // Claim active video
      requestPlay(id)
      if (activeId !== id) {
        // Another video is active, pause this one
        if (!video.paused) video.pause()
        return
      }

      video.currentTime = 0
      video.muted = isMuted
      video.play().catch(() => {
        video.muted = true
        video.play().catch(() => {})
      })
    })
  }, [activeId, currentIndex, isPaused, isMuted, requestPlay, videoIdForIndex])

  const registerVideo = useCallback((index: number, element: HTMLVideoElement | null) => {
    if (!element) {
      videoRefs.current.delete(index)
      return
    }
    videoRefs.current.set(index, element)
  }, [])

  const handleVideoLoaded = (index: number) => {
    setLoadedVideos(prev => new Set(prev).add(index))
  }

  const handleThumbnailLoaded = (index: number) => {
    setThumbnailsLoaded(prev => new Set(prev).add(index))
  }

  const handleDragEnd = (_: any, info: PanInfo) => {
    const threshold = 32
    const velocity = info.velocity.y

    if (info.offset.y < -threshold || velocity < -500) {
      if (currentIndex < videos.length - 1) {
        setCurrentIndex(currentIndex + 1)
        setIsPaused(false)
      }
    } else if (info.offset.y > threshold || velocity > 500) {
      if (currentIndex > 0) {
        setCurrentIndex(currentIndex - 1)
        setIsPaused(false)
      }
    }
  }

  const togglePause = () => {
    const video = videoRefs.current.get(currentIndex)
    if (video) {
      if (video.paused) {
        video.play().catch(() => {})
        setIsPaused(false)
        requestPlay(videoIdForIndex(currentIndex))
      } else {
        video.pause()
        setIsPaused(true)
        if (activeId === videoIdForIndex(currentIndex)) {
          clearActive()
        }
      }
    }
  }

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    const newMuted = !isMuted
    setIsMuted(newMuted)
    videoRefs.current.forEach(video => {
      video.muted = newMuted
    })
  }

  const handleLikeClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (currentVideo) onLike(currentVideo.id)
  }

  const handleCreatorClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (currentVideo?.creator) {
      onCreatorClick(currentVideo.creator)
    }
  }

  const handleBack = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClose()
  }

  return (
    <motion.div
      key="reels"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 bg-black z-[100]"
      ref={containerRef}
    >
      {/* ===== VIDEO LAYER - Swipeable videos ===== */}
      <motion.div
        className="absolute inset-0"
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.02}
        onDragEnd={handleDragEnd}
        onClick={togglePause}
      >
        <motion.div
          className="h-full"
          animate={{ y: -currentIndex * containerHeight }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
          {videos.map((video, index) => {
            const isActive = index === currentIndex
            const isNearby = Math.abs(index - currentIndex) <= 1
            const showThumbnail = !loadedVideos.has(index) && video.media_thumbnail

            return (
              <div
                key={video.id}
                className="h-screen w-full relative bg-black flex items-center justify-center"
              >
                {/* VIDEO CONTAINER */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {/* THUMBNAIL */}
                  {video.media_thumbnail && (
                    <img
                      src={video.media_thumbnail}
                      alt=""
                      className={`max-w-full max-h-full w-auto h-full object-contain transition-opacity duration-300 ${
                        showThumbnail ? 'opacity-100' : 'opacity-0'
                      }`}
                      style={{ aspectRatio: '9/16' }}
                      onLoad={() => handleThumbnailLoaded(index)}
                    />
                  )}

                  {/* LOADING SPINNER */}
                  {!loadedVideos.has(index) && !thumbnailsLoaded.has(index) && isNearby && (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                      <div className="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                    </div>
                  )}

                  {/* VIDEO PLAYER */}
                  {isNearby && (
                    <video
                      ref={el => registerVideo(index, el)}
                      src={video.media_url}
                      className={`absolute max-w-full max-h-full w-auto h-full object-contain transition-opacity duration-200 ${
                        loadedVideos.has(index) ? 'opacity-100' : 'opacity-0'
                      }`}
                      style={{ aspectRatio: '9/16' }}
                      loop
                      playsInline
                      muted={isMuted}
                      preload="auto"
                      poster={video.media_thumbnail || undefined}
                      onLoadedData={() => handleVideoLoaded(index)}
                      onCanPlay={() => handleVideoLoaded(index)}
                    />
                  )}
                </div>

                {/* PAUSED OVERLAY */}
                {isPaused && isActive && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                    <div className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm">
                      <Play className="w-8 h-8 text-white fill-white ml-1" />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </motion.div>
      </motion.div>

      {/* ===== FIXED UI LAYER - Does NOT scroll ===== */}

      {/* GRADIENT at bottom for text readability */}
      <div className="absolute bottom-0 left-0 right-0 h-[200px] bg-gradient-to-t from-black via-black/50 to-transparent pointer-events-none z-30" />

      {/* BACK BUTTON - small, top center */}
      <button
        onClick={handleBack}
        className="absolute top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-3 py-1.5 bg-black/50 backdrop-blur-sm rounded-full border border-white/20"
      >
        <ArrowLeft className="w-4 h-4 text-white" />
        <span className="text-sm font-medium text-white">Back</span>
      </button>

      {/* MUTE BUTTON - top right */}
      <button
        onClick={toggleMute}
        className="absolute top-12 right-4 z-50 w-8 h-8 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm border border-white/20"
      >
        {isMuted ? (
          <VolumeX className="w-4 h-4 text-white" />
        ) : (
          <Volume2 className="w-4 h-4 text-white" />
        )}
      </button>

      {/* RIGHT SIDE ACTION BUTTONS - fixed position */}
      <div className="absolute right-3 bottom-28 flex flex-col items-center gap-4 z-50">
        {/* Like */}
        <button
          onClick={handleLikeClick}
          className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform"
        >
          <Heart
            className={`w-7 h-7 ${
              currentVideo?.liked ? 'fill-red-500 text-red-500' : 'text-white'
            }`}
          />
          <span className="text-white text-[10px] font-semibold">
            {currentVideo?.likes_count || 0}
          </span>
        </button>

        {/* Comment */}
        <button className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform">
          <MessageCircle className="w-7 h-7 text-white" />
          <span className="text-white text-[10px] font-semibold">
            {currentVideo?.comments_count || 0}
          </span>
        </button>

        {/* Share */}
        <button className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform">
          <Send className="w-6 h-6 text-white rotate-12" />
        </button>

        {/* More */}
        <button className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform">
          <MoreHorizontal className="w-7 h-7 text-white" />
        </button>
      </div>

      {/* CREATOR INFO - FIXED at bottom, above everything */}
      <div className="absolute bottom-20 left-3 right-14 z-50">
        <button
          onClick={handleCreatorClick}
          className="flex items-center gap-2"
        >
          <img
            src={currentVideo?.creator?.avatar_url || `https://i.pravatar.cc/150?u=${currentVideo?.creator_id}`}
            alt=""
            className="w-9 h-9 rounded-full border-2 border-white object-cover bg-gray-800"
          />
          <span className="text-white font-bold text-[14px] drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            @{currentVideo?.creator?.username || 'user'}
          </span>
          {currentVideo?.creator?.is_verified && (
            <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
              </svg>
            </div>
          )}
        </button>

        {/* Caption - one line only */}
        {currentVideo?.content && (
          <p className="text-white text-[13px] mt-1.5 truncate drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            {currentVideo.content}
          </p>
        )}
      </div>
    </motion.div>
  )
}

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
    const currentVideo = videos[currentIndex]
    if (currentVideo) onLike(currentVideo.id)
  }

  const handleCreatorClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const currentVideo = videos[currentIndex]
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
      {/* HEADER - Back button and title */}
      <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 pt-[max(18px,env(safe-area-inset-top)+4px)] pb-2">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-white"
        >
          <ArrowLeft className="w-6 h-6" />
          <span className="font-semibold text-lg">Reels</span>
        </button>

        {/* Mute button */}
        <button
          onClick={toggleMute}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40"
        >
          {isMuted ? (
            <VolumeX className="w-5 h-5 text-white" />
          ) : (
            <Volume2 className="w-5 h-5 text-white" />
          )}
        </button>
      </div>

      {/* REELS CONTAINER - Swipeable */}
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
                {/* VIDEO CONTAINER - Centered, maintains 9:16 aspect ratio */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {/* THUMBNAIL - Shows before video loads */}
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

                  {/* LOADING SPINNER - Only when no thumbnail */}
                  {!loadedVideos.has(index) && !thumbnailsLoaded.has(index) && isNearby && (
                    <div className="absolute inset-0 flex items-center justify-center z-10">
                      <div className="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                    </div>
                  )}

                  {/* VIDEO PLAYER - Full height, maintains aspect ratio */}
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
                    <div className="w-20 h-20 bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm">
                      <Play className="w-10 h-10 text-white fill-white ml-1" />
                    </div>
                  </div>
                )}

                {/* RIGHT SIDE ICONS - positioned above safe area */}
                {isActive && (
                  <div
                    className="absolute right-3 flex flex-col items-center gap-5 z-30"
                    style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)' }}
                  >
                    {/* Like Button */}
                    <button
                      onClick={handleLikeClick}
                      className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
                    >
                      <Heart
                        className={`w-7 h-7 ${
                          video.liked ? 'fill-red-500 text-red-500' : 'text-white'
                        }`}
                      />
                      <span className="text-white text-[11px] font-semibold">
                        {video.likes_count || 0}
                      </span>
                    </button>

                    {/* Comment Button */}
                    <button className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
                      <MessageCircle className="w-7 h-7 text-white" />
                      <span className="text-white text-[11px] font-semibold">
                        {video.comments_count || 0}
                      </span>
                    </button>

                    {/* Share Button */}
                    <button className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
                      <Send className="w-6 h-6 text-white rotate-12" />
                    </button>

                    {/* More Options */}
                    <button className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
                      <MoreHorizontal className="w-7 h-7 text-white" />
                    </button>
                  </div>
                )}

                {/* BOTTOM LEFT - Creator info & caption - positioned above safe area */}
                {isActive && (
                  <div
                    className="absolute left-3 right-16 z-30"
                    style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
                  >
                    {/* Creator row */}
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={handleCreatorClick}
                        className="flex items-center gap-2"
                      >
                        <img
                          src={video.creator?.avatar_url || `https://i.pravatar.cc/150?u=${video.creator_id}`}
                          alt=""
                          className="w-9 h-9 rounded-full border-2 border-white/50 object-cover bg-black"
                        />
                        <span className="text-white font-bold text-[14px] drop-shadow-lg">
                          {video.creator?.username || 'user'}
                        </span>
                        {video.creator?.is_verified && (
                          <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                            <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                            </svg>
                          </div>
                        )}
                      </button>
                      {/* Follow/Following button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          // TODO: Add follow/unfollow logic
                        }}
                        className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-colors ${
                          video.is_following
                            ? 'bg-white/20 text-white border border-white/30'
                            : 'bg-white text-black'
                        }`}
                      >
                        {video.is_following ? 'Following' : 'Follow'}
                      </button>
                    </div>

                    {/* Caption */}
                    {video.content && (
                      <p className="text-white text-[13px] leading-snug line-clamp-2 drop-shadow-lg">
                        {video.content}
                      </p>
                    )}
                  </div>
                )}

                {/* GRADIENT OVERLAY - Bottom fade for text readability */}
                {isActive && (
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none z-20"
                    style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 200px)' }}
                  />
                )}
              </div>
            )
          })}
        </motion.div>
      </motion.div>

      {/* PROGRESS INDICATORS */}
      <div className="absolute top-[calc(env(safe-area-inset-top)+56px)] left-0 right-0 flex justify-center gap-1 px-4 z-50">
        {videos.slice(Math.max(0, currentIndex - 3), currentIndex + 4).map((_, i) => {
          const actualIndex = Math.max(0, currentIndex - 3) + i
          if (actualIndex >= videos.length) return null
          return (
            <div
              key={actualIndex}
              className={`h-0.5 flex-1 max-w-6 rounded-full transition-all duration-200 ${
                actualIndex === currentIndex ? 'bg-white' : 'bg-white/30'
              }`}
            />
          )
        })}
      </div>

      {/* SAFE AREA BOTTOM SPACER */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-black z-40"
        style={{ height: 'env(safe-area-inset-bottom, 0px)' }}
      />
    </motion.div>
  )
}

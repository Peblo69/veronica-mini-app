import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Play, Send, MoreHorizontal, Volume2, VolumeX } from 'lucide-react'
import { PixelHeart, PixelComment, PixelStar } from '../components/PixelIcons'
import type { Post, User } from '../lib/api'
import useSharedVideoPlayback from '../hooks/useSharedVideoPlayback'
import CommentsSheet from '../components/CommentsSheet'

interface ReelsViewerProps {
  videos: Post[]
  initialIndex: number
  onClose: () => void
  onLike: (postId: number) => void
  onCreatorClick: (creator: any) => void
  user: User
  onCommentCountUpdate?: (postId: number, count: number) => void
}

export default function ExploreReelsViewer({
  videos,
  initialIndex,
  onClose,
  onLike,
  onCreatorClick,
  user,
  onCommentCountUpdate: _onCommentCountUpdate,
}: ReelsViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [isMuted, setIsMuted] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const [loadedVideos, setLoadedVideos] = useState<Set<number>>(new Set())
  const [playingVideos, setPlayingVideos] = useState<Set<number>>(new Set())
  const [thumbnailsLoaded, setThumbnailsLoaded] = useState<Set<number>>(new Set())
  const [commentsOpen, setCommentsOpen] = useState(false)
  const videoRefs = useRef<Map<number, HTMLVideoElement>>(new Map())
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const videoIdForIndex = useCallback((idx: number) => `reel-${idx}-${videos[idx]?.id ?? idx}`, [videos])
  const { activeId, requestPlay, clearActive } = useSharedVideoPlayback()
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentVideo = videos[currentIndex]

  // Scroll to initial video on mount
  useEffect(() => {
    const container = scrollContainerRef.current
    if (container && initialIndex > 0) {
      setTimeout(() => {
        const targetScroll = initialIndex * window.innerWidth
        container.scrollLeft = targetScroll
      }, 0)
    }
  }, [initialIndex])

  // Handle horizontal scroll to detect which video is current
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }

      scrollTimeoutRef.current = setTimeout(() => {
        const scrollLeft = container.scrollLeft
        const viewportWidth = window.innerWidth
        const newIndex = Math.round(scrollLeft / viewportWidth)

        if (newIndex !== currentIndex && newIndex >= 0 && newIndex < videos.length) {
          setCurrentIndex(newIndex)
          setIsPaused(false)
        }
      }, 50)
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
    }
  }, [currentIndex, videos.length])

  // Cleanup videos on unmount
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
        if (!video.paused) video.pause()
        return
      }

      requestPlay(id)
      if (activeId !== id) {
        if (!video.paused) video.pause()
        return
      }

      video.currentTime = 0
      video.muted = isMuted
      video.play().then(() => {
        setPlayingVideos(prev => new Set(prev).add(index))
      }).catch(() => {
        video.muted = true
        video.play().then(() => {
          setPlayingVideos(prev => new Set(prev).add(index))
        }).catch(() => {})
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

  const togglePause = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return

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

  const handleCommentClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCommentsOpen(true)
    // Pause video when opening comments
    const video = videoRefs.current.get(currentIndex)
    if (video && !video.paused) {
      video.pause()
      setIsPaused(true)
    }
  }

  // Telegram fullscreen mode has buttons at the top - need to account for that
  const topPadding = 'max(56px, calc(env(safe-area-inset-top, 0px) + 48px))'

  const content = (
    <div
      ref={scrollContainerRef}
      className="reels-viewer"
      onClick={togglePause}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        backgroundColor: '#000',
        overflowX: 'scroll',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
        scrollSnapType: 'x mandatory',
        overscrollBehavior: 'none',
        display: 'flex',
        flexDirection: 'row',
        paddingTop: topPadding,
      }}
    >
      {/* Horizontal video stack */}
      {videos.map((video, index) => {
        const isActive = index === currentIndex
        const isNearby = Math.abs(index - currentIndex) <= 1
        // Only hide thumbnail when video is actually playing (not just loaded)
        const showThumbnail = !playingVideos.has(index) && video.media_thumbnail

        return (
          <div
            key={video.id}
            style={{
              height: '100%',
              width: '100vw',
              minWidth: '100vw',
              position: 'relative',
              backgroundColor: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              scrollSnapAlign: 'start',
              scrollSnapStop: 'always',
              flexShrink: 0,
            }}
          >
            {/* Video container */}
            <div className="absolute inset-0 flex items-center justify-center">
              {/* Thumbnail */}
              {video.media_thumbnail && (
                <img
                  src={video.media_thumbnail}
                  alt=""
                  className={`max-w-full max-h-full w-auto h-full object-contain transition-opacity duration-300 ${
                    showThumbnail ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{ aspectRatio: '9/16' }}
                  onLoad={() => handleThumbnailLoaded(index)}
                  draggable={false}
                />
              )}

              {/* Loading spinner */}
              {!loadedVideos.has(index) && !thumbnailsLoaded.has(index) && isNearby && (
                <div className="absolute inset-0 flex items-center justify-center z-10">
                  <div className="w-10 h-10 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
              )}

              {/* Video */}
              {isNearby && (
                <video
                  ref={el => registerVideo(index, el)}
                  src={video.media_url}
                  className={`absolute max-w-full max-h-full w-auto h-full object-contain transition-opacity duration-150 ${
                    playingVideos.has(index) ? 'opacity-100' : 'opacity-0'
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

            {/* Paused overlay */}
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

      {/* Fixed UI overlay */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
        {/* Gradient */}
        <div className="absolute bottom-0 left-0 right-0 h-[200px] bg-gradient-to-t from-black via-black/50 to-transparent" />

        {/* Progress dots - bottom center in the black area */}
        <div
          className="absolute left-1/2 -translate-x-1/2 flex gap-1.5"
          style={{ bottom: 'calc(8px + env(safe-area-inset-bottom, 0px))', pointerEvents: 'none' }}
        >
          {videos.length <= 15 && videos.map((_, idx) => (
            <div
              key={idx}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/40'
              }`}
            />
          ))}
        </div>

        {/* Back button - positioned below Telegram's header buttons */}
        <button
          onClick={handleBack}
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-black/50 backdrop-blur-sm rounded-full border border-white/20"
          style={{ pointerEvents: 'auto', top: 'max(60px, calc(env(safe-area-inset-top, 0px) + 52px))' }}
        >
          <ArrowLeft className="w-4 h-4 text-white" />
          <span className="text-sm font-medium text-white">Back</span>
        </button>

        {/* Right side actions */}
        <div
          className="absolute right-3 flex flex-col items-center gap-4"
          style={{ bottom: 'calc(100px + env(safe-area-inset-bottom, 0px))', pointerEvents: 'auto' }}
        >
          <button
            onClick={handleLikeClick}
            className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform"
          >
            <PixelHeart
              className={`w-7 h-7 ${
                currentVideo?.liked ? 'text-red-500' : 'text-white'
              }`}
              filled={currentVideo?.liked}
            />
            <span className="text-white text-[10px] font-semibold">
              {currentVideo?.likes_count || 0}
            </span>
          </button>

          <button
            onClick={handleCommentClick}
            className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform"
          >
            <PixelComment className="w-7 h-7 text-white" />
            <span className="text-white text-[10px] font-semibold">
              {currentVideo?.comments_count || 0}
            </span>
          </button>

          <button className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform">
            <Send className="w-6 h-6 text-white rotate-12" />
          </button>

          {/* Gift Star Button */}
          <button
            className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform"
            onClick={() => {/* TODO: Open gift modal */}}
          >
            <PixelStar
              className={`w-7 h-7 ${(currentVideo?.gifts_count || 0) > 0 ? 'text-sky-400' : 'text-yellow-400'}`}
              filled={(currentVideo?.gifts_count || 0) > 0}
            />
            {(currentVideo?.gifts_count || 0) > 0 && (
              <span className="text-sky-400 text-[10px] font-semibold">
                {currentVideo?.gifts_count}
              </span>
            )}
          </button>

          <button className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform">
            <MoreHorizontal className="w-7 h-7 text-white" />
          </button>

          {/* Mute button - under the 3 dots */}
          <button
            onClick={toggleMute}
            className="flex flex-col items-center gap-0.5 active:scale-90 transition-transform"
          >
            {isMuted ? (
              <VolumeX className="w-7 h-7 text-white" />
            ) : (
              <Volume2 className="w-7 h-7 text-white" />
            )}
          </button>
        </div>

        {/* Creator info */}
        <div
          className="absolute left-3 right-14"
          style={{ bottom: 'calc(24px + env(safe-area-inset-bottom, 0px))', pointerEvents: 'auto' }}
        >
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
        </div>
      </div>
    </div>
  )

  return createPortal(
    <>
      {content}
      <CommentsSheet
        isOpen={commentsOpen}
        onClose={() => {
          setCommentsOpen(false)
          // Resume video when closing comments
          if (isPaused) {
            const video = videoRefs.current.get(currentIndex)
            if (video) {
              video.play().catch(() => {})
              setIsPaused(false)
              requestPlay(videoIdForIndex(currentIndex))
            }
          }
        }}
        postId={currentVideo?.id ?? null}
        user={user}
      />
    </>,
    document.body
  )
}

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, Search, X } from 'lucide-react'
import { type User, type Post, getVideoPosts, likePost, unlikePost, searchUsers } from '../lib/api'
import { useInViewport } from '../hooks/useInViewport'
import { useConnectionQuality } from '../hooks/useConnectionQuality'
const ReelsViewer = lazy(() => import('./ExploreReelsViewer'))

interface ExplorePageProps {
  user: User
  onCreatorClick: (creator: any) => void
}

// Video Thumbnail Component with loading state
function VideoThumbnail({ video, onClick }: { video: Post; onClick: () => void }) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isVisible = useInViewport(containerRef, { minimumRatio: 0.4 })
  const { isSlow, isDataSaver } = useConnectionQuality()
  const enablePreview = isVisible && !isSlow && !isDataSaver

  useEffect(() => {
    const videoEl = videoRef.current
    if (!videoEl) return

    const handleLoaded = () => setIsLoaded(true)
    if (videoEl.readyState >= 2) {
      setIsLoaded(true)
      return
    }
    videoEl.addEventListener('loadeddata', handleLoaded)
    return () => videoEl.removeEventListener('loadeddata', handleLoaded)
  }, [])

  useEffect(() => {
    const videoEl = videoRef.current
    if (!videoEl) return

    if (!enablePreview || !isHovering) {
      videoEl.pause()
      videoEl.currentTime = 0
      return
    }

    videoEl.play().catch(() => {})
  }, [enablePreview, isHovering])

  return (
    <motion.div
      ref={containerRef}
      className="relative aspect-[9/16] bg-gray-900 cursor-pointer overflow-hidden"
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      onMouseEnter={() => enablePreview && setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}

      <video
        ref={videoRef}
        src={video.media_url}
        className={`w-full h-full object-cover transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        muted
        playsInline
        preload="metadata"
        poster={video.media_thumbnail || undefined}
      />

      {isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Play className="w-8 h-8 text-white/80 fill-white/80" />
        </div>
      )}

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

  // Instagram-style search state
  const [searchFocused, setSearchFocused] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [searching, setSearching] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Instagram-style search with debounce
  const handleSearchChange = (query: string) => {
    setSearchQuery(query)
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }
    if (query.trim().length > 0) {
      setSearching(true)
      searchDebounceRef.current = setTimeout(async () => {
        const results = await searchUsers(query.trim())
        setSearchResults(results)
        setSearching(false)
      }, 300)
    } else {
      setSearchResults([])
      setSearching(false)
    }
  }

  const handleCancelSearch = () => {
    setSearchFocused(false)
    setSearchQuery('')
    setSearchResults([])
    searchInputRef.current?.blur()
  }

  const handleUserSelect = (selectedUser: User) => {
    handleCancelSearch()
    onCreatorClick(selectedUser)
  }

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
      {/* Instagram-style Search Header */}
      <div className="sticky top-0 z-40 bg-black px-4 py-2">
        <div className="flex items-center gap-3">
          {/* Animated Search Bar Container */}
          <motion.div
            className="flex-1 relative"
            animate={{
              marginRight: searchFocused ? 0 : 0
            }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <div className="relative flex items-center">
              <Search className="absolute left-3 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                className="w-full bg-[#262626] rounded-lg py-2 pl-10 pr-8 text-white placeholder-gray-500 text-sm outline-none border-0 focus:ring-0"
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setSearchResults([])
                    searchInputRef.current?.focus()
                  }}
                  className="absolute right-3 p-0.5 bg-gray-500 rounded-full"
                >
                  <X className="w-3 h-3 text-black" />
                </button>
              )}
            </div>
          </motion.div>

          {/* Cancel Button - Instagram style */}
          <AnimatePresence>
            {searchFocused && (
              <motion.button
                initial={{ opacity: 0, x: 20, width: 0 }}
                animate={{ opacity: 1, x: 0, width: 'auto' }}
                exit={{ opacity: 0, x: 20, width: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                onClick={handleCancelSearch}
                className="text-white text-sm font-medium whitespace-nowrap overflow-hidden"
              >
                Cancel
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Search Results Overlay */}
        <AnimatePresence>
          {searchFocused && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 top-full bg-black border-t border-gray-800/50 max-h-[60vh] overflow-y-auto"
            >
              {searching && (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}

              {!searching && searchQuery && searchResults.length === 0 && (
                <div className="py-8 text-center text-gray-500 text-sm">
                  No results found
                </div>
              )}

              {!searching && searchResults.length > 0 && (
                <div className="py-2">
                  {searchResults.map((result) => (
                    <motion.button
                      key={result.telegram_id}
                      whileTap={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                      onClick={() => handleUserSelect(result)}
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-white/5 transition-colors"
                    >
                      <img
                        src={result.avatar_url || '/default-avatar.png'}
                        alt={result.first_name || result.username || 'User'}
                        className="w-11 h-11 rounded-full object-cover bg-gray-800"
                      />
                      <div className="flex-1 text-left">
                        <div className="text-white font-medium text-sm">{result.username || 'user'}</div>
                        <div className="text-gray-400 text-xs">{result.first_name}{result.last_name ? ` ${result.last_name}` : ''}</div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}

              {!searching && !searchQuery && (
                <div className="py-8 text-center text-gray-500 text-sm">
                  Search for people
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
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
          <Suspense
            fallback={
              <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
                <div className="w-10 h-10 border-3 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            }
          >
            <ReelsViewer
              videos={videos}
              initialIndex={selectedVideoIndex}
              onClose={closeReels}
              onLike={handleLike}
              onCreatorClick={onCreatorClick}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Grid, Bookmark, Lock, Heart, Image, Video, Star, UserPlus, Share2, Menu, ChevronDown, Play, Repeat2, Settings } from 'lucide-react'
import { type User, type Post, getCreatorPosts, getSavedPosts, subscribeToFollowerChanges, getFollowCounts } from '../lib/api'
import { getWallet, type Wallet as WalletType } from '../lib/paymentsApi'
import PostDetail from '../components/PostDetail'
import FollowersSheet from '../components/FollowersSheet'
import { useInViewport } from '../hooks/useInViewport'
import { usePrefetchMedia } from '../hooks/usePrefetchMedia'
import { useConnectionQuality } from '../hooks/useConnectionQuality'
import { useTranslation } from 'react-i18next'
import { uploadAvatar, uploadStoryMedia } from '../lib/storage'
import { createStory, getActiveStories } from '../lib/storyApi'
import { updateProfile } from '../lib/settingsApi'
import StoryViewer from '../components/StoryViewer'

interface ProfilePageProps {
  user: User & { application_status?: string }
  setUser: (user: User) => void
  onBecomeCreator: () => void
  onSettingsClick: () => void
  onViewProfile?: (user: User) => void
}

// Format large numbers (e.g., 124500 -> 124.5K)
function formatCount(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
  }
  return num.toString()
}

export default function ProfilePage({ user, setUser, onSettingsClick, onViewProfile }: ProfilePageProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'posts' | 'locked' | 'reposts' | 'saved' | 'liked'>('posts')
  const [posts, setPosts] = useState<Post[]>([])
  const [savedPosts, setSavedPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [walletData, setWalletData] = useState<WalletType | null>(null)
  const [walletLoading, setWalletLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const storyInputRef = useRef<HTMLInputElement>(null)
  const [, setUploadingStory] = useState(false)
  const [, setUploadingAvatar] = useState(false)
  const [followersSheetOpen, setFollowersSheetOpen] = useState(false)
  const [followersSheetType, setFollowersSheetType] = useState<'followers' | 'following'>('followers')
  const [followersCount, setFollowersCount] = useState(user.followers_count || 0)
  const [followingCount, setFollowingCount] = useState(user.following_count || 0)
  const [stories, setStories] = useState<any[]>([])
  const [showStoryViewer, setShowStoryViewer] = useState(false)

  useEffect(() => {
    loadData()
    loadFollowCounts()
    loadStories()
  }, [user.telegram_id])

  const loadFollowCounts = async () => {
    const counts = await getFollowCounts(user.telegram_id)
    setFollowersCount(counts.followers)
    setFollowingCount(counts.following)
  }

  useEffect(() => {
    const unsubscribe = subscribeToFollowerChanges(user.telegram_id, {
      onNewFollower: () => setFollowersCount(prev => prev + 1),
      onUnfollow: () => setFollowersCount(prev => Math.max(0, prev - 1))
    })
    return () => unsubscribe()
  }, [user.telegram_id])

  useEffect(() => {
    if (activeTab === 'saved' && !walletData && !walletLoading) {
      loadWalletData()
    }
  }, [activeTab])

  const loadWalletData = async () => {
    setWalletLoading(true)
    try {
      const walletResult = await getWallet(user.telegram_id)
      if (walletResult.wallet) setWalletData(walletResult.wallet)
    } catch (err) {
      console.error('Failed to load wallet data:', err)
    }
    setWalletLoading(false)
  }

  const loadData = async () => {
    setLoading(true)
    const [creatorPostsResult, saved] = await Promise.all([
      getCreatorPosts(user.telegram_id, user.telegram_id),
      getSavedPosts(user.telegram_id)
    ])
    const ownPosts = creatorPostsResult?.posts ?? []
    setPosts(ownPosts)
    setSavedPosts(saved)
    setLoading(false)
  }

  const handlePostDeleted = () => {
    if (selectedPost) {
      setPosts(posts.filter(p => p.id !== selectedPost.id))
      setSavedPosts(savedPosts.filter(p => p.id !== selectedPost.id))
      setSelectedPost(null)
      if (user.is_creator) {
        setUser({ ...user, posts_count: Math.max(0, (user.posts_count || 1) - 1) })
      }
    }
  }

  const handlePostUpdated = (updatedPost: Post) => {
    setPosts(posts.map(p => p.id === updatedPost.id ? { ...updatedPost, can_view: true } : p))
    setSavedPosts(savedPosts.map(p => p.id === updatedPost.id ? { ...updatedPost, can_view: true } : p))
  }

  const handleProfileImageUpload = () => {
    fileInputRef.current?.click()
  }

  const handleShareProfile = async () => {
    const link = `${window.location.origin}/profile/${user.username || user.telegram_id}`
    try {
      if (navigator.share) {
        await navigator.share({ url: link, title: user.username || t('profile.title') })
        return
      }
    } catch { /* fall back */ }
    try {
      await navigator.clipboard.writeText(link)
      alert(t('profile.share.copied'))
    } catch {
      alert(t('profile.share.copyError'))
    }
  }

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>, type: 'profile' | 'story') => {
    const file = e.target.files?.[0]
    if (!file) {
      e.target.value = ''
      return
    }

    if (type === 'profile') {
      void (async () => {
        setUploadingAvatar(true)
        const uploadResult = await uploadAvatar(file, user.telegram_id)
        if (uploadResult.error || !uploadResult.url) {
          alert(t('profile.upload.error'))
        } else {
          const success = await updateProfile(user.telegram_id, { avatar_url: uploadResult.url })
          if (success) {
            setUser({ ...user, avatar_url: uploadResult.url })
            alert(t('profile.upload.avatarSuccess'))
          } else {
            alert(t('profile.upload.error'))
          }
        }
        setUploadingAvatar(false)
        e.target.value = ''
      })()
      return
    }

    void (async () => {
      setUploadingStory(true)
      const uploadResult = await uploadStoryMedia(file, user.telegram_id)
      if (uploadResult.error || !uploadResult.url) {
        alert(t('profile.upload.error'))
      } else {
        const mediaType = file.type.startsWith('video/') ? 'video' : 'image'
        const { error } = await createStory(user.telegram_id, uploadResult.url, mediaType)
        if (error) {
          alert(t('profile.upload.error'))
        } else {
          alert(t('profile.upload.storySuccess'))
          loadStories()
        }
      }
      setUploadingStory(false)
      e.target.value = ''
    })()
  }

  const loadStories = async () => {
    try {
      const { stories: activeStories } = await getActiveStories()
      const mine = (activeStories || []).filter(s => s.user_id === user.telegram_id)
      setStories(mine)
    } catch (err) {
      console.error('[Profile] loadStories failed', err)
    }
  }

  // Calculate total likes received
  const totalLikes = user.likes_received || posts.reduce((sum, p) => sum + (p.likes_count || 0), 0)

  // Filter posts by type
  const publicPosts = posts.filter(p => p.visibility === 'public')
  const lockedPosts = posts.filter(p => p.visibility !== 'public')

  return (
    <div className="bg-black min-h-screen text-white pb-20">
      {/* TikTok Style Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <button className="p-1.5">
          <UserPlus className="w-5 h-5 text-white" />
        </button>

        {/* "View Stories" Speech Bubble */}
        {stories.length > 0 ? (
          <button
            onClick={() => setShowStoryViewer(true)}
            className="absolute left-1/2 -translate-x-1/2 top-16 bg-white text-black text-[11px] px-2.5 py-1 rounded-full font-medium shadow-lg"
            style={{ transform: 'translateX(-50%) translateY(-100%)' }}
          >
            View Stories
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-white" />
          </button>
        ) : null}

        <div className="flex items-center gap-3">
          <button className="p-1.5">
            <Star className="w-5 h-5 text-white" />
          </button>
          <button className="p-1.5" onClick={handleShareProfile}>
            <Share2 className="w-5 h-5 text-white" />
          </button>
          <button className="p-1.5" onClick={onSettingsClick}>
            <Menu className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Centered Avatar - Smaller */}
      <div className="flex flex-col items-center px-4 pt-1 pb-3">
        <div className="relative mb-2">
          {/* Avatar with gradient ring if has stories */}
          <div className={`w-18 h-18 rounded-full ${stories.length > 0 ? 'p-[2px] bg-gradient-to-tr from-pink-500 via-red-500 to-yellow-500' : ''}`} style={{ width: '72px', height: '72px' }}>
            <div className={`w-full h-full rounded-full ${stories.length > 0 ? 'p-[2px] bg-black' : ''}`}>
              <img
                src={user.avatar_url || `https://i.pravatar.cc/150?u=${user.telegram_id}`}
                alt={user.first_name}
                className="w-full h-full rounded-full object-cover"
                onClick={() => stories.length > 0 && setShowStoryViewer(true)}
              />
            </div>
          </div>

          {/* Add/Follow Button (blue circle with +) */}
          <button
            onClick={handleProfileImageUpload}
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-5 bg-[#00D4FF] rounded-full flex items-center justify-center border-2 border-black"
          >
            <span className="text-black text-sm font-bold leading-none">+</span>
          </button>
        </div>

        {/* Hidden file inputs */}
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileSelected(e, 'profile')} />
        <input ref={storyInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => handleFileSelected(e, 'story')} />

        {/* Username centered, settings icon positioned after */}
        <div className="w-full flex justify-center mb-0.5">
          <div className="relative">
            <span className="text-base font-bold tracking-wide">
              {user.first_name?.toUpperCase() || 'USER'}
            </span>
            <button onClick={onSettingsClick} className="absolute -right-6 top-1/2 -translate-y-1/2 p-0.5">
              <Settings className="w-4 h-4 text-white/70" />
            </button>
          </div>
        </div>

        {/* Handle/Username */}
        <span className="text-[12px] text-white/50 mb-3">
          @{user.username || `user${user.telegram_id}`}
        </span>

        {/* Stats Row: Following | Followers | Likes */}
        <div className="flex items-center justify-center gap-0 mb-3">
          <button
            onClick={() => { setFollowersSheetType('following'); setFollowersSheetOpen(true) }}
            className="flex flex-col items-center px-4"
          >
            <span className="text-base font-bold">{formatCount(followingCount)}</span>
            <span className="text-[11px] text-white/50">Following</span>
          </button>

          <div className="w-[1px] h-6 bg-white/10" />

          <button
            onClick={() => { setFollowersSheetType('followers'); setFollowersSheetOpen(true) }}
            className="flex flex-col items-center px-4"
          >
            <span className="text-base font-bold">{formatCount(followersCount)}</span>
            <span className="text-[11px] text-white/50">Followers</span>
          </button>

          <div className="w-[1px] h-6 bg-white/10" />

          <div className="flex flex-col items-center px-4">
            <span className="text-base font-bold">{formatCount(totalLikes)}</span>
            <span className="text-[11px] text-white/50">Likes</span>
          </div>
        </div>

        {/* Bio - Centered */}
        <div className="text-center px-6 mb-2">
          <p className="text-[13px] text-white/90 whitespace-pre-wrap">
            {user.bio || 'No bio yet'}
          </p>
        </div>
      </div>

      {/* TikTok Style Tab Bar */}
      <div className="flex border-b border-white/10">
        {/* Grid/Posts Tab with dropdown */}
        <button
          className={`flex-1 py-3 flex items-center justify-center gap-1 ${activeTab === 'posts' ? 'border-b-2 border-white' : ''}`}
          onClick={() => setActiveTab('posts')}
        >
          <Grid className={`w-5 h-5 ${activeTab === 'posts' ? 'text-white' : 'text-white/40'}`} />
          <ChevronDown className={`w-3 h-3 ${activeTab === 'posts' ? 'text-white' : 'text-white/40'}`} />
        </button>

        {/* Locked Content Tab */}
        <button
          className={`flex-1 py-3 flex items-center justify-center ${activeTab === 'locked' ? 'border-b-2 border-white' : ''}`}
          onClick={() => setActiveTab('locked')}
        >
          <Lock className={`w-5 h-5 ${activeTab === 'locked' ? 'text-white' : 'text-white/40'}`} />
        </button>

        {/* Reposts Tab */}
        <button
          className={`flex-1 py-3 flex items-center justify-center ${activeTab === 'reposts' ? 'border-b-2 border-white' : ''}`}
          onClick={() => setActiveTab('reposts')}
        >
          <Repeat2 className={`w-5 h-5 ${activeTab === 'reposts' ? 'text-white' : 'text-white/40'}`} />
        </button>

        {/* Saved/Bookmarks Tab */}
        <button
          className={`flex-1 py-3 flex items-center justify-center ${activeTab === 'saved' ? 'border-b-2 border-white' : ''}`}
          onClick={() => setActiveTab('saved')}
        >
          <Bookmark className={`w-5 h-5 ${activeTab === 'saved' ? 'text-white' : 'text-white/40'}`} />
        </button>

        {/* Liked Tab */}
        <button
          className={`flex-1 py-3 flex items-center justify-center ${activeTab === 'liked' ? 'border-b-2 border-white' : ''}`}
          onClick={() => setActiveTab('liked')}
        >
          <Heart className={`w-5 h-5 ${activeTab === 'liked' ? 'text-white' : 'text-white/40'}`} />
        </button>
      </div>

      {/* Content Grid */}
      <div className="pb-20">
        {/* Posts Tab */}
        {activeTab === 'posts' && (
          loading ? (
            <div className="grid grid-cols-3 gap-[1px]">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="aspect-[3/4] bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : publicPosts.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-20 h-20 rounded-full border border-white/10 flex items-center justify-center mx-auto mb-4">
                <Video className="w-8 h-8 text-white/30" />
              </div>
              <h3 className="font-semibold text-lg mb-2">No posts yet</h3>
              <p className="text-sm text-white/50">Your posts will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-[1px]">
              {publicPosts.map((post) => (
                <motion.div
                  key={post.id}
                  className="relative aspect-[3/4] cursor-pointer overflow-hidden bg-[#1a1a1a]"
                  whileTap={{ opacity: 0.9 }}
                  onClick={() => setSelectedPost(post)}
                >
                  <TikTokMediaTile post={post} />
                </motion.div>
              ))}
            </div>
          )
        )}

        {/* Locked Content Tab */}
        {activeTab === 'locked' && (
          loading ? (
            <div className="grid grid-cols-3 gap-[1px]">
              {[1,2,3].map(i => (
                <div key={i} className="aspect-[3/4] bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : lockedPosts.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-20 h-20 rounded-full border border-white/10 flex items-center justify-center mx-auto mb-4">
                <Lock className="w-8 h-8 text-white/30" />
              </div>
              <h3 className="font-semibold text-lg mb-2">No locked content</h3>
              <p className="text-sm text-white/50">Private content will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-[1px]">
              {lockedPosts.map((post) => (
                <motion.div
                  key={post.id}
                  className="relative aspect-[3/4] cursor-pointer overflow-hidden bg-[#1a1a1a]"
                  whileTap={{ opacity: 0.9 }}
                  onClick={() => setSelectedPost(post)}
                >
                  <TikTokMediaTile post={post} />
                  <div className="absolute top-2 right-2">
                    <Lock className="w-4 h-4 text-white drop-shadow" />
                  </div>
                </motion.div>
              ))}
            </div>
          )
        )}

        {/* Reposts Tab */}
        {activeTab === 'reposts' && (
          <div className="py-20 text-center">
            <div className="w-20 h-20 rounded-full border border-white/10 flex items-center justify-center mx-auto mb-4">
              <Repeat2 className="w-8 h-8 text-white/30" />
            </div>
            <h3 className="font-semibold text-lg mb-2">No reposts yet</h3>
            <p className="text-sm text-white/50">Content you repost will appear here</p>
          </div>
        )}

        {/* Saved Tab */}
        {activeTab === 'saved' && (
          loading ? (
            <div className="grid grid-cols-3 gap-[1px]">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="aspect-[3/4] bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : savedPosts.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-20 h-20 rounded-full border border-white/10 flex items-center justify-center mx-auto mb-4">
                <Bookmark className="w-8 h-8 text-white/30" />
              </div>
              <h3 className="font-semibold text-lg mb-2">No saved posts</h3>
              <p className="text-sm text-white/50 max-w-xs mx-auto">Save posts to view them later</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-[1px]">
              {savedPosts.map((post) => (
                <motion.div
                  key={post.id}
                  className="relative aspect-[3/4] cursor-pointer overflow-hidden bg-[#1a1a1a]"
                  whileTap={{ opacity: 0.9 }}
                  onClick={() => setSelectedPost(post)}
                >
                  <TikTokMediaTile post={post} />
                </motion.div>
              ))}
            </div>
          )
        )}

        {/* Liked Tab (private) */}
        {activeTab === 'liked' && (
          <div className="py-20 text-center">
            <div className="w-20 h-20 rounded-full border border-white/10 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-white/30" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Liked posts are private</h3>
            <p className="text-sm text-white/50 max-w-xs mx-auto">Only you can see what you've liked</p>
          </div>
        )}
      </div>

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

      {showStoryViewer && (
        <StoryViewer
          stories={stories}
          startIndex={0}
          onClose={() => setShowStoryViewer(false)}
        />
      )}

      {/* Followers/Following Sheet */}
      <FollowersSheet
        isOpen={followersSheetOpen}
        onClose={() => setFollowersSheetOpen(false)}
        userId={user.telegram_id}
        currentUserId={user.telegram_id}
        type={followersSheetType}
        onUserClick={onViewProfile}
      />
    </div>
  )
}

const VIDEO_REGEX = /\.(mp4|webm|mov|m4v)(\?|$)/i

function isVideoPost(post: Post): boolean {
  if (!post.media_url) return false
  if (post.media_type) {
    const type = post.media_type.toLowerCase()
    if (type.includes('video')) return true
  }
  return VIDEO_REGEX.test(post.media_url)
}

function TikTokMediaTile({ post }: { post: Post }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [shouldLoad, setShouldLoad] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const isVisible = useInViewport(containerRef, { minimumRatio: 0.25 })
  const displayUrl = post.media_thumbnail || post.media_url
  const { isDataSaver } = useConnectionQuality()
  usePrefetchMedia(isDataSaver ? null : displayUrl)
  const isVideo = isVideoPost(post)

  useEffect(() => {
    if (isVisible) setShouldLoad(true)
  }, [isVisible])

  // Text-only post
  if (!post.media_url) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/50 to-pink-900/50 p-4">
        <p className="text-[13px] text-white text-center line-clamp-5">{post.content}</p>
      </div>
    )
  }

  if (imageError) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-[#1a1a1a]">
        <Image className="w-8 h-8 text-white/20" />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {(!shouldLoad || !imageLoaded) && (
        <div className="absolute inset-0 bg-[#1a1a1a] animate-pulse" />
      )}

      {shouldLoad && (
        <>
          <img
            src={displayUrl || post.media_url}
            alt=""
            className={`w-full h-full object-cover transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />

          {/* Gradient overlay at bottom for view count - only for videos */}
          {imageLoaded && isVideo && (
            <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/60 to-transparent" />
          )}

          {/* View count - only for videos, smaller */}
          {imageLoaded && isVideo && (
            <div className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5">
              <Play className="w-3 h-3 text-white fill-white" />
              <span className="text-white text-[11px] font-medium">
                {formatCount(post.view_count || 0)}
              </span>
            </div>
          )}

          {/* Multiple images indicator */}
          {imageLoaded && post.media_urls && post.media_urls.length > 1 && (
            <div className="absolute top-2 right-2">
              <div className="bg-black/50 rounded px-1.5 py-0.5">
                <span className="text-[11px] text-white font-medium">{post.media_urls.length}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

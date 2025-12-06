import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Grid, Bookmark, Clock, CheckCircle, Lock, Menu, Plus, UserPlus, Camera, Image, Video, X } from 'lucide-react'
import { type User, type Post, getCreatorPosts, getSavedPosts } from '../lib/api'
import PostDetail from '../components/PostDetail'
import { useInViewport } from '../hooks/useInViewport'
import { usePrefetchMedia } from '../hooks/usePrefetchMedia'
import { useConnectionQuality } from '../hooks/useConnectionQuality'

interface ProfilePageProps {
  user: User & { application_status?: string }
  setUser: (user: User) => void
  onBecomeCreator: () => void
  onSettingsClick: () => void
}

export default function ProfilePage({ user, setUser, onBecomeCreator, onSettingsClick }: ProfilePageProps) {
  const [activeTab, setActiveTab] = useState<'posts' | 'saved'>('posts')
  const [posts, setPosts] = useState<Post[]>([])
  const [savedPosts, setSavedPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [showActionMenu, setShowActionMenu] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const storyInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadData()
  }, [user.telegram_id])

  const loadData = async () => {
    setLoading(true)
    const [creatorPostsResult, saved] = await Promise.all([
      user.is_creator ? getCreatorPosts(user.telegram_id, user.telegram_id) : Promise.resolve(null),
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
      // Update user posts count
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
    setShowActionMenu(false)
    fileInputRef.current?.click()
  }

  const handleStoryUpload = () => {
    setShowActionMenu(false)
    storyInputRef.current?.click()
  }

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>, type: 'profile' | 'story') => {
    const file = e.target.files?.[0]
    if (file) {
      // TODO: Implement actual upload logic
      console.log(`${type} file selected:`, file.name)
      // For now, create a local preview URL
      const previewUrl = URL.createObjectURL(file)
      if (type === 'profile') {
        // Update user avatar locally for preview
        setUser({ ...user, avatar_url: previewUrl })
      } else {
        // Story upload - to be implemented
        console.log('Story upload triggered with:', previewUrl)
      }
    }
    // Reset input
    e.target.value = ''
  }

  const getApplicationStatusUI = () => {
    if (user.is_creator) return null

    const status = (user as any).application_status

    if (status === 'pending') {
      return (
        <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/25 rounded-xl text-white">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-yellow-300" />
            <div>
              <div className="font-semibold text-white">Application Pending</div>
              <div className="text-sm text-yellow-100/80">We're reviewing your application. This usually takes 24-48 hours.</div>
            </div>
          </div>
        </div>
      )
    }

    if (status === 'approved') {
      return (
        <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-white">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-emerald-300" />
            <div>
              <div className="font-semibold text-white">Application Approved!</div>
              <div className="text-sm text-emerald-100/80">You can now start creating content.</div>
            </div>
          </div>
        </div>
      )
    }

    if (status === 'rejected') {
      return (
        <div className="mt-4">
          <div className="p-4 bg-red-500/10 border border-red-500/25 rounded-xl mb-3">
            <div className="font-semibold text-white">Application Not Approved</div>
            <div className="text-sm text-red-100/80">Please review our requirements and try again.</div>
          </div>
          <motion.button 
            className="w-full py-2 bg-white/10 text-white font-bold rounded-lg text-sm border border-white/10" 
            whileTap={{ scale: 0.98 }}
            onClick={onBecomeCreator}
          >
            Reapply
          </motion.button>
        </div>
      )
    }

    return (
      <motion.button 
        className="w-full py-2 bg-white/10 border border-white/10 text-white font-bold rounded-lg text-sm mt-4" 
        whileTap={{ scale: 0.98 }}
        onClick={onBecomeCreator}
      >
        Become a Creator
      </motion.button>
    )
  }

  return (
    <div className="bg-[#050505] min-h-screen text-white pb-16 relative">
      {/* Top safe area spacer for Telegram fullscreen mode buttons */}
      <div
        className="w-full bg-[#050505]"
        style={{ height: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      />

      {/* Top Bar */}
      <div className="sticky top-0 z-50 bg-[#0c0c0c]/90 border-b border-white/5 px-4 py-2 flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center gap-2 text-white/60 text-sm">
          <Plus className="w-5 h-5" />
          <span>Profile</span>
        </div>
        <div className="font-bold text-lg flex items-center gap-1">
           {user.username || 'user'} 
           {user.is_verified && <CheckCircle className="w-3.5 h-3.5 text-blue-400 fill-blue-400" />}
        </div>
        <div className="flex items-center gap-4">
          <motion.button whileTap={{ scale: 0.9 }} onClick={onSettingsClick} className="p-2 rounded-full hover:bg-white/10">
            <Menu className="w-6 h-6 text-white" />
          </motion.button>
        </div>
      </div>

      <div className="px-4 pt-5 pb-4 relative overflow-hidden">
        {/* Subtle stars background */}
        <div className="pointer-events-none absolute inset-0 opacity-25" style={{ backgroundImage: 'radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.5), rgba(255,255,255,0)), radial-gradient(1px 1px at 70% 60%, rgba(255,255,255,0.4), rgba(255,255,255,0)), radial-gradient(1px 1px at 40% 80%, rgba(255,255,255,0.35), rgba(255,255,255,0))' }} />
        <div className="pointer-events-none absolute -left-10 -top-10 w-48 h-48 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-10 w-40 h-40 rounded-full bg-purple-500/10 blur-3xl" />

        <div className="flex items-center gap-5 mb-6 relative z-10">
          {/* Avatar */}
          <div className="relative shrink-0">
             <div className="w-[72px] h-[72px] rounded-full p-[2px] bg-gradient-to-tr from-[#1f6fff] via-[#7aa4ff] to-[#1f6fff]/40 shadow-[0_8px_28px_rgba(31,111,255,0.25)]">
               <img
                 src={user.avatar_url || 'https://i.pravatar.cc/150?u=' + user.telegram_id}
                 alt={user.first_name}
                 className="w-full h-full rounded-full object-cover border border-white/15"
               />
            </div>
            <motion.button
              className="absolute bottom-0 right-0 bg-gradient-to-r from-[#1f6fff] to-[#5a8dff] rounded-full p-1.5 border-2 border-[#050505] cursor-pointer shadow-lg shadow-[#1f6fff33]"
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowActionMenu(true)}
            >
              <Plus className="w-4 h-4 text-white" />
            </motion.button>
          </div>

          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileSelected(e, 'profile')}
          />
          <input
            ref={storyInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => handleFileSelected(e, 'story')}
          />

          {/* Stats */}
          <div className="flex-1 flex justify-around items-center">
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-semibold text-[18px] leading-tight text-white">{user.posts_count}</span>
              <span className="text-[12px] text-white/60">Posts</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-semibold text-[18px] leading-tight text-white">{user.followers_count}</span>
              <span className="text-[12px] text-white/60">Followers</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-semibold text-[18px] leading-tight text-white">{user.following_count || 0}</span>
              <span className="text-[12px] text-white/60">Following</span>
            </div>
          </div>
        </div>

        {/* Bio Section */}
        <div className="mb-5 relative z-10">
          <div className="font-bold text-sm mb-0.5 text-white flex items-center gap-2">
            {user.first_name} {user.last_name}
          </div>
          {user.is_creator && <div className="text-xs text-blue-300 mb-1">Digital Creator</div>}
          <div className="text-sm whitespace-pre-wrap leading-snug text-white/80">
            {user.bio || 'No bio yet.'}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mb-5 relative z-10">
          <button className="flex-1 bg-white/10 hover:bg-white/15 text-sm font-semibold py-2 rounded-lg transition-colors text-white border border-white/10">
            Edit profile
          </button>
          <button className="flex-1 bg-white/10 hover:bg-white/15 text-sm font-semibold py-2 rounded-lg transition-colors text-white border border-white/10">
            Share profile
          </button>
          <button className="bg-white/10 hover:bg-white/15 p-2 rounded-lg transition-colors text-white border border-white/10">
            <UserPlus className="w-4 h-4" />
          </button>
        </div>

        {getApplicationStatusUI()}
        
        {/* Balance Card (Custom Addition kept minimal) */}
        <div className="bg-gradient-to-r from-[#0a1a38] via-[#0f1f44] to-[#0a1a38] border border-white/5 rounded-xl p-4 flex items-center justify-between mb-4 shadow-[0_10px_35px_rgba(0,0,0,0.25)] relative z-10">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-blue-200 tracking-wider">Wallet Balance</span>
            <span className="text-xl font-semibold text-white">{user.balance} Tokens</span>
          </div>
          <button className="bg-white text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm hover:shadow-md transition">
            + Add Funds
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-t border-white/5 bg-[#080808] sticky top-[56px] z-40">
        <button
          className={`flex-1 py-3 flex items-center justify-center border-b-[2px] transition-colors ${activeTab === 'posts' ? 'border-blue-500 text-white' : 'border-transparent text-white/50'}`}
          onClick={() => setActiveTab('posts')}
        >
          <Grid className="w-5 h-5" />
        </button>
        <button
          className={`flex-1 py-3 flex items-center justify-center border-b-[2px] transition-colors ${activeTab === 'saved' ? 'border-blue-500 text-white' : 'border-transparent text-white/50'}`}
          onClick={() => setActiveTab('saved')}
        >
          <Bookmark className="w-5 h-5" />
        </button>
      </div>

      {/* Content Grid */}
      <div className="pb-28 bg-[#050505]">
        {loading ? (
          <div className="grid grid-cols-3 gap-[2px] px-[2px]">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="aspect-square bg-white/5 animate-pulse rounded-sm" />
            ))}
          </div>
        ) : activeTab === 'posts' ? (
          posts.length === 0 ? (
            <div className="py-20 text-center text-white">
              <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center mx-auto mb-4 bg-white/5">
                 <Grid className="w-7 h-7 text-white/70" />
              </div>
              <h3 className="font-bold text-lg mb-2">No posts yet</h3>
              <p className="text-sm text-white/60">Share your first photo or video to fill your grid.</p>
              {user.is_creator && (
                 <button className="text-blue-400 font-semibold text-sm mt-4">Share your first post</button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-[2px] px-[2px]">
              {posts.map((post) => (
                <motion.div
                  key={post.id}
                  className="relative aspect-square cursor-pointer overflow-hidden bg-white/5"
                  whileTap={{ opacity: 0.9 }}
                  onClick={() => setSelectedPost(post)}
                >
                  <ProfileMediaTile post={post} />
                  {post.visibility !== 'public' && (
                    <div className="absolute top-1 right-1 bg-black/50 rounded-full p-[2px]">
                      <Lock className="w-3 h-3 text-white" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )
        ) : (
          savedPosts.length === 0 ? (
            <div className="py-20 text-center text-white">
              <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center mx-auto mb-4 bg-white/5">
                 <Bookmark className="w-7 h-7 text-white/70" />
              </div>
              <h3 className="font-bold text-lg mb-2">No saved items</h3>
              <p className="text-sm text-white/60 max-w-xs mx-auto">Save photos and videos you love. Only you can see them.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-[2px] px-[2px]">
              {savedPosts.map((post) => (
                <motion.div
                  key={post.id}
                  className="relative aspect-square cursor-pointer overflow-hidden bg-white/5"
                  whileTap={{ opacity: 0.9 }}
                  onClick={() => setSelectedPost(post)}
                >
                  <ProfileMediaTile post={post} />
                </motion.div>
              ))}
            </div>
          )
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

      {/* Instagram-Style Action Menu */}
      <AnimatePresence>
        {showActionMenu && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/50 z-[100]"
              onClick={() => setShowActionMenu(false)}
            />

            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 bg-[#0c0c0f] text-white rounded-t-3xl z-[101] safe-area-bottom border border-white/5 border-b-0 shadow-[0_-14px_40px_rgba(0,0,0,0.4)]"
            >
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-white/15 rounded-full" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 pb-3 border-b border-white/10">
                <span className="text-lg font-bold">Create</span>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setShowActionMenu(false)}
                  className="p-1"
                >
                  <X className="w-6 h-6 text-white/70" />
                </motion.button>
              </div>

              {/* Menu Options */}
              <div className="py-2">
                {/* Upload Profile Image */}
                <motion.button
                  whileTap={{ scale: 0.98, backgroundColor: '#f3f4f6' }}
                  onClick={handleProfileImageUpload}
                  className="w-full flex items-center gap-4 px-4 py-4 active:bg-white/5 transition-colors"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-orange-400 rounded-full flex items-center justify-center shadow-lg shadow-pink-500/20">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-white">Upload Profile Image</div>
                    <div className="text-sm text-white/60">Change your profile picture</div>
                  </div>
                </motion.button>

                {/* Add Story */}
                <motion.button
                  whileTap={{ scale: 0.98, backgroundColor: '#f3f4f6' }}
                  onClick={handleStoryUpload}
                  className="w-full flex items-center gap-4 px-4 py-4 active:bg-white/5 transition-colors"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-purple-500/25">
                    <Plus className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-white">Add Story</div>
                    <div className="text-sm text-white/60">Share a moment with followers</div>
                  </div>
                </motion.button>

                {/* Upload Story Image */}
                <motion.button
                  whileTap={{ scale: 0.98, backgroundColor: '#f3f4f6' }}
                  onClick={handleStoryUpload}
                  className="w-full flex items-center gap-4 px-4 py-4 active:bg-white/5 transition-colors"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-teal-400 rounded-full flex items-center justify-center shadow-lg shadow-green-500/20">
                    <Image className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-white">Upload Story Image</div>
                    <div className="text-sm text-white/60">Add a photo to your story</div>
                  </div>
                </motion.button>

                {/* Upload Story Video */}
                <motion.button
                  whileTap={{ scale: 0.98, backgroundColor: '#f3f4f6' }}
                  onClick={handleStoryUpload}
                  className="w-full flex items-center gap-4 px-4 py-4 active:bg-white/5 transition-colors"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg shadow-red-500/20">
                    <Video className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-white">Upload Story Video</div>
                    <div className="text-sm text-white/60">Add a video to your story</div>
                  </div>
                </motion.button>
              </div>

              {/* Cancel Button */}
              <div className="px-4 pb-4 pt-2">
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowActionMenu(false)}
                  className="w-full py-3 bg-white/10 rounded-xl font-semibold text-white"
                >
                  Cancel
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

const VIDEO_REGEX = /\.(mp4|webm|mov|m4v)(\?|$)/i

function isVideoPost(post: Post) {
  if (!post.media_url) return false
  if (post.media_type) {
    const type = post.media_type.toLowerCase()
    if (type.includes('video')) return true
  }
  return VIDEO_REGEX.test(post.media_url)
}

function ProfileMediaTile({ post }: { post: Post }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [shouldLoad, setShouldLoad] = useState(false)
  const isVisible = useInViewport(containerRef, { minimumRatio: 0.25 })
  const displayUrl = post.media_thumbnail || post.media_url
  const { isDataSaver } = useConnectionQuality()
  usePrefetchMedia(isDataSaver ? null : displayUrl)

  useEffect(() => {
    if (isVisible) setShouldLoad(true)
  }, [isVisible])

  if (!post.media_url) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-white/5 p-3">
        <p className="text-[11px] text-white/70 text-center line-clamp-4">{post.content}</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full h-full">
      {!shouldLoad ? (
        <div className="w-full h-full bg-white/5 animate-pulse" />
      ) : isVideoPost(post) ? (
        <>
          <img
            src={displayUrl || post.media_url}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/20 to-transparent" />
          <div className="absolute top-1 right-1 bg-black/60 rounded-full p-1">
            <Video className="w-3.5 h-3.5 text-white" />
          </div>
        </>
      ) : (
        <img
          src={post.media_url}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      )}
    </div>
  )
}

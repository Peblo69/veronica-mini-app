import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, CheckCircle, Lock, Grid, Star, X, Gift, Heart, Repeat2, MoreHorizontal, UserPlus, Play, Video, Image as ImageIcon } from 'lucide-react'
import { getCreatorPosts, followUser, unfollowUser, subscribeToFollowerChanges, subscribeToUserUpdates, getFollowCounts, type User, type Post } from '../lib/api'
import { getOrCreateConversation } from '../lib/chatApi'
import { unlockPostWithPayment, sendTipWithPayment } from '../lib/paymentsApi'
import { toast } from '../lib/toast'
import PostDetail from '../components/PostDetail'
import FollowersSheet from '../components/FollowersSheet'
import { useInViewport } from '../hooks/useInViewport'
import { usePrefetchMedia } from '../hooks/usePrefetchMedia'
import { useConnectionQuality } from '../hooks/useConnectionQuality'

interface CreatorProfilePageProps {
  creator: User
  currentUser: User
  onBack: () => void
  onMessage?: (conversationId: string) => void
  onUserUpdate?: (updatedUser: Partial<User>) => void
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

export default function CreatorProfilePage({ creator, currentUser, onBack, onMessage, onUserUpdate, onViewProfile }: CreatorProfilePageProps) {
  const [activeTab, setActiveTab] = useState<'posts' | 'locked' | 'reposts' | 'liked'>('posts')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [followersCount, setFollowersCount] = useState(creator.followers_count || 0)
  const [followingCount, setFollowingCount] = useState(creator.following_count || 0)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [viewingPost, setViewingPost] = useState<Post | null>(null)
  const [purchasing, setPurchasing] = useState(false)
  const [startingChat, setStartingChat] = useState(false)
  const [followInProgress, setFollowInProgress] = useState(false)
  const [showTipModal, setShowTipModal] = useState(false)
  const [tipAmount, setTipAmount] = useState(50)
  const [tipMessage, setTipMessage] = useState('')
  const [tipping, setTipping] = useState(false)
  const [followersSheetOpen, setFollowersSheetOpen] = useState(false)
  const [followersSheetType, setFollowersSheetType] = useState<'followers' | 'following'>('followers')
  const [showSubscribeModal, setShowSubscribeModal] = useState(false)
  const [subscribing] = useState(false)

  // Calculate total likes
  const totalLikes = creator.likes_received || posts.reduce((sum, p) => sum + (p.likes_count || 0), 0)

  useEffect(() => {
    loadData()
  }, [creator.telegram_id])

  useEffect(() => {
    const unsubscribeFollowers = subscribeToFollowerChanges(creator.telegram_id, {
      onNewFollower: (followerId) => {
        if (followerId !== currentUser.telegram_id) {
          setFollowersCount(prev => prev + 1)
        }
      },
      onUnfollow: (followerId) => {
        if (followerId !== currentUser.telegram_id) {
          setFollowersCount(prev => Math.max(0, prev - 1))
        }
      }
    })

    const unsubscribeUser = subscribeToUserUpdates(creator.telegram_id, (updatedUser) => {
      setFollowersCount(updatedUser.followers_count || 0)
    })

    return () => {
      unsubscribeFollowers()
      unsubscribeUser()
    }
  }, [creator.telegram_id, currentUser.telegram_id])

  const loadData = async () => {
    setLoading(true)
    const [postsResult, counts] = await Promise.all([
      getCreatorPosts(creator.telegram_id, currentUser.telegram_id),
      getFollowCounts(creator.telegram_id)
    ])
    setPosts(postsResult.posts)
    setIsFollowing(postsResult.relationship.is_following)
    setIsSubscribed(postsResult.relationship.is_subscribed)
    setFollowersCount(counts.followers)
    setFollowingCount(counts.following)
    setLoading(false)
  }

  const handleFollow = async () => {
    if (followInProgress) return
    setFollowInProgress(true)

    try {
      if (isFollowing) {
        setIsFollowing(false)
        setFollowersCount(prev => Math.max(0, prev - 1))
        if (onUserUpdate) {
          onUserUpdate({ following_count: Math.max(0, (currentUser.following_count || 0) - 1) })
        }

        const success = await unfollowUser(currentUser.telegram_id, creator.telegram_id)
        if (!success) {
          setIsFollowing(true)
          setFollowersCount(prev => prev + 1)
          if (onUserUpdate) {
            onUserUpdate({ following_count: (currentUser.following_count || 0) })
          }
          toast.error('Failed to unfollow')
        }
      } else {
        setIsFollowing(true)
        setFollowersCount(prev => prev + 1)
        if (onUserUpdate) {
          onUserUpdate({ following_count: (currentUser.following_count || 0) + 1 })
        }

        const success = await followUser(currentUser.telegram_id, creator.telegram_id)
        if (!success) {
          setIsFollowing(false)
          setFollowersCount(prev => Math.max(0, prev - 1))
          if (onUserUpdate) {
            onUserUpdate({ following_count: Math.max(0, (currentUser.following_count || 0)) })
          }
          toast.error('Failed to follow')
        }
      }
    } finally {
      setFollowInProgress(false)
    }
  }

  const handleSubscribe = async () => {
    setShowSubscribeModal(false)
    toast.info('Subscription with Stars coming soon!')
  }

  const handlePurchase = async (post: Post) => {
    setPurchasing(true)

    await unlockPostWithPayment(
      currentUser.telegram_id,
      post.id,
      () => {
        setPosts(posts.map(p => p.id === post.id ? { ...p, can_view: true, is_purchased: true } : p))
        setSelectedPost(null)
        setPurchasing(false)
        toast.success('Content unlocked!')
      },
      (error) => {
        setPurchasing(false)
        toast.error(error || 'Purchase failed')
      }
    )
  }

  const handleTip = async () => {
    if (tipAmount < 1) {
      toast.error('Minimum tip is 1 Star')
      return
    }

    setTipping(true)

    await sendTipWithPayment(
      currentUser.telegram_id,
      creator.telegram_id,
      tipAmount,
      tipMessage || undefined,
      undefined,
      () => {
        setShowTipModal(false)
        setTipAmount(50)
        setTipMessage('')
        setTipping(false)
        toast.success(`Sent ${tipAmount} Stars!`)
      },
      (error) => {
        setTipping(false)
        toast.error(error || 'Tip failed')
      }
    )
  }

  const handleMessage = async () => {
    if (!onMessage || startingChat) return
    setStartingChat(true)
    try {
      const conversation = await getOrCreateConversation(currentUser.telegram_id, creator.telegram_id, currentUser.telegram_id)
      if (conversation) {
        onMessage(conversation.id)
      } else {
        toast.error('Could not start conversation')
      }
    } catch {
      toast.error('Failed to start chat')
    } finally {
      setStartingChat(false)
    }
  }

  const handlePostClick = (post: Post) => {
    if (post.can_view) {
      setViewingPost(post)
    } else if (post.unlock_price > 0) {
      setSelectedPost(post)
    }
  }

  const handlePostDeleted = () => {
    if (viewingPost) {
      setPosts(posts.filter(p => p.id !== viewingPost.id))
      setViewingPost(null)
    }
  }

  const handlePostUpdated = (updatedPost: Post) => {
    setPosts(posts.map(p => p.id === updatedPost.id ? { ...updatedPost, can_view: p.can_view } : p))
  }

  // Filter posts
  const publicPosts = posts.filter(p => p.visibility === 'public')
  const lockedPosts = posts.filter(p => p.visibility !== 'public')

  return (
    <div className="bg-black min-h-screen text-white pb-20">
      {/* TikTok Style Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <button onClick={onBack} className="p-1.5">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>

        <div className="flex items-center gap-3">
          <button className="p-1.5" onClick={() => setShowTipModal(true)}>
            <Star className="w-5 h-5 text-white" />
          </button>
          <button className="p-1.5">
            <MoreHorizontal className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Centered Avatar - TikTok Style */}
      <div className="flex flex-col items-center px-4 pt-1 pb-3">
        <div className="relative mb-2">
          {/* Avatar with gradient ring */}
          <div className="w-18 h-18 rounded-full p-[2px] bg-gradient-to-tr from-pink-500 via-red-500 to-yellow-500" style={{ width: '72px', height: '72px' }}>
            <div className="w-full h-full rounded-full p-[2px] bg-black">
              <img
                src={creator.avatar_url || `https://i.pravatar.cc/150?u=${creator.telegram_id}`}
                alt={creator.first_name}
                className="w-full h-full rounded-full object-cover"
              />
            </div>
          </div>

          {/* Verified badge */}
          {creator.is_verified && (
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
              <CheckCircle className="w-5 h-5 text-blue-400 fill-blue-400 bg-black rounded-full" />
            </div>
          )}
        </div>

        {/* Username centered */}
        <div className="w-full flex justify-center mb-0.5">
          <span className="text-base font-bold tracking-wide">
            {creator.first_name?.toUpperCase() || 'USER'}
          </span>
        </div>

        {/* Handle/Username */}
        <span className="text-[12px] text-white/50 mb-3">
          @{creator.username || `user${creator.telegram_id}`}
        </span>

        {/* Stats Row: Following | Followers | Likes - TikTok Style */}
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
        <div className="text-center px-6 mb-4">
          <p className="text-[13px] text-white/90 whitespace-pre-wrap">
            {creator.bio || 'No bio yet'}
          </p>
        </div>

        {/* Action Buttons - TikTok Style */}
        <div className="flex items-center justify-center gap-2 w-full px-4">
          {/* Follow Button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            className={`flex-1 max-w-[140px] py-2.5 rounded-md font-semibold text-sm transition-all ${
              isFollowing === null || followInProgress
                ? 'bg-white/10 text-white/50'
                : isFollowing
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-[#FE2C55] text-white'
            }`}
            onClick={handleFollow}
            disabled={isFollowing === null || followInProgress}
          >
            {isFollowing === null || followInProgress ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isFollowing ? 'Following' : 'Follow'}
          </motion.button>

          {/* Message Button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            className="flex-1 max-w-[140px] py-2.5 bg-white/10 rounded-md font-semibold text-sm border border-white/20"
            onClick={handleMessage}
            disabled={startingChat}
          >
            {startingChat ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : 'Message'}
          </motion.button>

          {/* Subscribe/DM Icon Button */}
          {creator.is_creator && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              className={`w-10 h-10 rounded-md flex items-center justify-center ${
                isSubscribed ? 'bg-[#00D4FF]/20 border border-[#00D4FF]/50' : 'bg-white/10 border border-white/20'
              }`}
              onClick={() => !isSubscribed && setShowSubscribeModal(true)}
            >
              {isSubscribed ? (
                <CheckCircle className="w-5 h-5 text-[#00D4FF]" />
              ) : (
                <UserPlus className="w-5 h-5 text-white" />
              )}
            </motion.button>
          )}

          {/* Gift/Tip Button */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            className="w-10 h-10 bg-white/10 rounded-md flex items-center justify-center border border-white/20"
            onClick={() => setShowTipModal(true)}
          >
            <Gift className="w-5 h-5 text-white" />
          </motion.button>
        </div>
      </div>

      {/* TikTok Style Tab Bar */}
      <div className="flex border-b border-white/10">
        {/* Grid/Posts Tab */}
        <button
          className={`flex-1 py-3 flex items-center justify-center ${activeTab === 'posts' ? 'border-b-2 border-white' : ''}`}
          onClick={() => setActiveTab('posts')}
        >
          <Grid className={`w-5 h-5 ${activeTab === 'posts' ? 'text-white' : 'text-white/40'}`} />
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
              <p className="text-sm text-white/50">Posts will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-[1px]">
              {publicPosts.map((post) => (
                <motion.div
                  key={post.id}
                  className="relative aspect-[3/4] cursor-pointer overflow-hidden bg-[#1a1a1a]"
                  whileTap={{ opacity: 0.9 }}
                  onClick={() => handlePostClick(post)}
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
              <h3 className="font-semibold text-lg mb-2">No exclusive content</h3>
              <p className="text-sm text-white/50">Subscriber-only content will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-[1px]">
              {lockedPosts.map((post) => (
                <motion.div
                  key={post.id}
                  className="relative aspect-[3/4] cursor-pointer overflow-hidden bg-[#1a1a1a]"
                  whileTap={{ opacity: 0.9 }}
                  onClick={() => handlePostClick(post)}
                >
                  <TikTokMediaTile post={post} showLock={!post.can_view} />
                  {/* Price tag */}
                  {!post.can_view && post.unlock_price > 0 && (
                    <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded-full flex items-center gap-1">
                      <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      <span className="text-xs font-semibold">{post.unlock_price}</span>
                    </div>
                  )}
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
            <h3 className="font-semibold text-lg mb-2">No reposts</h3>
            <p className="text-sm text-white/50">Reposted content will appear here</p>
          </div>
        )}

        {/* Liked Tab */}
        {activeTab === 'liked' && (
          <div className="py-20 text-center">
            <div className="w-20 h-20 rounded-full border border-white/10 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-white/30" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Liked videos are private</h3>
            <p className="text-sm text-white/50">Only this user can see their liked videos</p>
          </div>
        )}
      </div>

      {/* Subscribe Modal */}
      <AnimatePresence>
        {showSubscribeModal && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSubscribeModal(false)}
          >
            <motion.div
              className="bg-[#1c1c1e] rounded-[2rem] w-full max-w-sm p-6 shadow-2xl border border-white/10"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="w-20 h-20 mx-auto rounded-full p-1 border-2 border-[#00D4FF] mb-4">
                  <img
                    src={creator.avatar_url || `https://i.pravatar.cc/150?u=${creator.telegram_id}`}
                    alt={creator.first_name}
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
                <h3 className="text-xl font-bold mb-1">Subscribe to {creator.first_name}</h3>
                <p className="text-white/50 text-sm mb-6">Unlock exclusive content</p>

                <div className="space-y-3 mb-6 text-left">
                  <div className="flex items-center gap-3 text-sm text-white/80">
                    <CheckCircle className="w-5 h-5 text-[#00D4FF] shrink-0" />
                    <span>Full access to exclusive content</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-white/80">
                    <CheckCircle className="w-5 h-5 text-[#00D4FF] shrink-0" />
                    <span>Direct messaging priority</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-white/80">
                    <CheckCircle className="w-5 h-5 text-[#00D4FF] shrink-0" />
                    <span>Support the creator directly</span>
                  </div>
                </div>

                <button
                  className="w-full py-3 bg-[#00D4FF] text-black font-bold rounded-xl disabled:opacity-50"
                  onClick={handleSubscribe}
                  disabled={subscribing}
                >
                  {subscribing ? 'Processing...' : `Subscribe for ${creator.subscription_price || 'Free'} Stars/month`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Purchase Modal */}
      <AnimatePresence>
        {selectedPost && !selectedPost.can_view && selectedPost.unlock_price > 0 && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !purchasing && setSelectedPost(null)}
          >
            <motion.div
              className="bg-[#1c1c1e] rounded-[2rem] w-full max-w-sm p-6 shadow-2xl border border-white/10"
              initial={{ scale: 0.9, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 30 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Unlock Content</h3>
                <button onClick={() => !purchasing && setSelectedPost(null)} className="p-1 hover:bg-white/10 rounded-full">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="text-center mb-8 relative">
                <div className="absolute inset-0 bg-yellow-500/20 blur-3xl rounded-full" />
                <div className="relative w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <Star className="w-10 h-10 text-white fill-white" />
                </div>
                <p className="text-gray-400 text-sm mb-2">Pay with Telegram Stars</p>
                <div className="flex items-center justify-center gap-2">
                  <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                  <span className="text-4xl font-bold">{Math.ceil(selectedPost.unlock_price)}</span>
                </div>
              </div>

              <div className="bg-white/5 rounded-2xl p-4 mb-6 border border-white/10">
                <div className="flex items-center gap-3">
                  <img
                    src={creator.avatar_url || `https://i.pravatar.cc/150?u=${creator.telegram_id}`}
                    className="w-10 h-10 rounded-full object-cover"
                    alt=""
                  />
                  <div className="flex-1">
                    <p className="font-medium">{creator.first_name || creator.username}</p>
                    <p className="text-gray-500 text-sm">Creator receives 85%</p>
                  </div>
                </div>
              </div>

              <motion.button
                className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-black"
                whileTap={{ scale: 0.98 }}
                onClick={() => handlePurchase(selectedPost)}
                disabled={purchasing}
              >
                {purchasing ? (
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                ) : (
                  <>
                    <Star className="w-5 h-5 fill-current" />
                    Pay {Math.ceil(selectedPost.unlock_price)} Stars
                  </>
                )}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tip Modal */}
      <AnimatePresence>
        {showTipModal && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !tipping && setShowTipModal(false)}
          >
            <motion.div
              className="bg-[#1c1c1e] rounded-[2rem] w-full max-w-sm p-6 shadow-2xl border border-white/10"
              initial={{ scale: 0.9, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 30 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Send a Tip</h3>
                <button onClick={() => !tipping && setShowTipModal(false)} className="p-1 hover:bg-white/10 rounded-full">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="text-center mb-6 relative">
                <div className="absolute inset-0 bg-yellow-500/20 blur-3xl rounded-full" />
                <div className="relative w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <Gift className="w-8 h-8 text-white" />
                </div>
                <p className="text-gray-400 text-sm">Show support to {creator.first_name}</p>
              </div>

              <div className="grid grid-cols-4 gap-2 mb-4">
                {[10, 50, 100, 250].map((amount) => (
                  <button
                    key={amount}
                    className={`py-2 rounded-xl text-sm font-semibold transition-all ${
                      tipAmount === amount
                        ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-black'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                    onClick={() => setTipAmount(amount)}
                  >
                    {amount}
                  </button>
                ))}
              </div>

              <div className="relative mb-4">
                <Star className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-yellow-400 fill-yellow-400" />
                <input
                  type="number"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-yellow-400"
                  placeholder="Enter amount"
                  min="1"
                />
              </div>

              <input
                type="text"
                value={tipMessage}
                onChange={(e) => setTipMessage(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-yellow-400 mb-6"
                placeholder="Add a message (optional)"
                maxLength={100}
              />

              <motion.button
                className="w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-black"
                whileTap={{ scale: 0.98 }}
                onClick={handleTip}
                disabled={tipping || tipAmount < 1}
              >
                {tipping ? (
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                ) : (
                  <>
                    <Star className="w-5 h-5 fill-current" />
                    Send {tipAmount} Stars
                  </>
                )}
              </motion.button>

              <p className="text-center text-gray-500 text-xs mt-4">
                Creator receives 85% of your tip
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Post Detail Modal */}
      <AnimatePresence>
        {viewingPost && (
          <PostDetail
            post={viewingPost}
            user={currentUser}
            onBack={() => setViewingPost(null)}
            onDeleted={handlePostDeleted}
            onUpdated={handlePostUpdated}
          />
        )}
      </AnimatePresence>

      {/* Followers/Following Sheet */}
      <FollowersSheet
        isOpen={followersSheetOpen}
        onClose={() => setFollowersSheetOpen(false)}
        userId={creator.telegram_id}
        currentUserId={currentUser.telegram_id}
        type={followersSheetType}
        onUserClick={onViewProfile}
      />
    </div>
  )
}

// Video detection
const VIDEO_REGEX = /\.(mp4|webm|mov|m4v)(\?|$)/i

function isVideoPost(post: Post): boolean {
  if (!post.media_url) return false
  if (post.media_type?.toLowerCase().includes('video')) return true
  return VIDEO_REGEX.test(post.media_url)
}

function TikTokMediaTile({ post, showLock = false }: { post: Post; showLock?: boolean }) {
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
    const bgGradient = post.background_gradient || 'from-purple-900/50 to-pink-900/50'
    return (
      <div ref={containerRef} className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${bgGradient} p-4`}>
        <p className="text-[13px] text-white text-center line-clamp-5">{post.content}</p>
      </div>
    )
  }

  if (imageError) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-[#1a1a1a]">
        <ImageIcon className="w-8 h-8 text-white/20" />
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
            className={`w-full h-full object-cover transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'} ${showLock ? 'blur-lg scale-110' : ''}`}
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />

          {/* Lock overlay */}
          {showLock && imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Lock className="w-6 h-6 text-white drop-shadow-lg" />
            </div>
          )}

          {/* Video view count */}
          {imageLoaded && isVideo && !showLock && (
            <>
              <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5">
                <Play className="w-3 h-3 text-white fill-white" />
                <span className="text-white text-[11px] font-medium">
                  {formatCount(post.view_count || 0)}
                </span>
              </div>
            </>
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

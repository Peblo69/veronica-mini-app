import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, MoreHorizontal, CheckCircle, Image as ImageIcon, Heart, Lock, MessageCircle, UserPlus, UserCheck, Crown, DollarSign, X, AlertTriangle, Eye, Coins } from 'lucide-react'
import { getCreatorPosts, followUser, unfollowUser, getUserRelationship, type User, type Post, canViewPost } from '../lib/api'
import { getOrCreateConversation } from '../lib/chatApi'
import { processSubscriptionPayment, processContentPurchase } from '../lib/payments'
import PostDetail from '../components/PostDetail'

interface CreatorProfilePageProps {
  creator: User
  currentUser: User
  onBack: () => void
  onMessage?: (conversationId: string) => void
}

export default function CreatorProfilePage({ creator, currentUser, onBack, onMessage }: CreatorProfilePageProps) {
  const [activeTab, setActiveTab] = useState<'posts' | 'media' | 'exclusive'>('posts')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [isFollowing, setIsFollowing] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [showSubscribeModal, setShowSubscribeModal] = useState(false)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [viewingPost, setViewingPost] = useState<Post | null>(null)
  const [purchasing, setPurchasing] = useState(false)
  const [startingChat, setStartingChat] = useState(false)
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [creator.telegram_id])

  const loadData = async () => {
    setLoading(true)
    const [creatorPosts, relationship] = await Promise.all([
      getCreatorPosts(creator.telegram_id, currentUser.telegram_id),
      getUserRelationship(currentUser.telegram_id, creator.telegram_id)
    ])

    // Add visibility info to posts
    const postsWithVisibility = creatorPosts.map(post => ({
      ...post,
      is_following: relationship.is_following,
      is_subscribed: relationship.is_subscribed,
      can_view: canViewPost(post, currentUser.telegram_id, relationship.is_following, relationship.is_subscribed, false)
    }))

    setPosts(postsWithVisibility)
    setIsFollowing(relationship.is_following)
    setIsSubscribed(relationship.is_subscribed)
    setLoading(false)
  }

  const handleFollow = async () => {
    if (isFollowing) {
      await unfollowUser(currentUser.telegram_id, creator.telegram_id)
      setIsFollowing(false)
    } else {
      await followUser(currentUser.telegram_id, creator.telegram_id)
      setIsFollowing(true)
    }
    // Refresh posts visibility
    loadData()
  }

  const handleSubscribe = async () => {
    setSubscribing(true)
    setSubscriptionError(null)

    const result = await processSubscriptionPayment(
      currentUser.telegram_id,
      creator.telegram_id,
      creator.subscription_price || 0
    )

    setSubscribing(false)

    if (result.success) {
      setIsSubscribed(true)
      setShowSubscribeModal(false)
      loadData()
    } else {
      setSubscriptionError(result.error || 'Subscription failed')
    }
  }

  const handlePurchase = async (post: Post) => {
    setPurchasing(true)
    setPurchaseError(null)

    const result = await processContentPurchase(
      currentUser.telegram_id,
      post.id,
      post.creator_id,
      post.unlock_price
    )
    setPurchasing(false)

    if (result.success) {
      setPosts(posts.map(p => p.id === post.id ? { ...p, can_view: true, is_purchased: true } : p))
      setSelectedPost(null)
    } else {
      setPurchaseError(result.error || 'Purchase failed')
    }
  }

  const handleMessage = async () => {
    if (!onMessage) return
    setStartingChat(true)
    const conversation = await getOrCreateConversation(currentUser.telegram_id, creator.telegram_id)
    setStartingChat(false)
    if (conversation) {
      onMessage(conversation.id)
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

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
  }

  const filteredPosts = posts.filter(post => {
    if (activeTab === 'posts') return true
    if (activeTab === 'media') return post.media_url
    if (activeTab === 'exclusive') return post.visibility === 'subscribers' || post.is_nsfw
    return true
  })

  const exclusiveCount = posts.filter(p => p.visibility === 'subscribers' || p.is_nsfw).length
  const mediaCount = posts.filter(p => p.media_url).length

  return (
    <div className="bg-white min-h-screen">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-of-blue text-white">
        <div className="flex items-center justify-between px-2 py-3">
          <button onClick={onBack} className="p-2">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-1">
            <span className="font-semibold">{creator.first_name}</span>
            {creator.is_verified && <CheckCircle className="w-4 h-4 fill-white" />}
          </div>
          <button className="p-2"><MoreHorizontal className="w-6 h-6" /></button>
        </div>
      </div>

      <div className="pt-14">
        {/* Cover Image */}
        <div className="h-32 bg-gradient-to-r from-of-blue to-blue-400">
          {creator.cover_url && (
            <img src={creator.cover_url} alt="Cover" className="w-full h-full object-cover" />
          )}
        </div>

        {/* Profile Info */}
        <div className="px-4 -mt-12 relative z-10">
          <div className="flex justify-between items-end">
            <div className="relative">
              <img
                src={creator.avatar_url || 'https://i.pravatar.cc/150?u=' + creator.telegram_id}
                alt={creator.first_name}
                className="w-24 h-24 rounded-full border-4 border-white object-cover shadow-lg"
              />
              {creator.is_verified && (
                <div className="absolute bottom-1 right-1 w-7 h-7 bg-of-blue rounded-full flex items-center justify-center border-2 border-white">
                  <CheckCircle className="w-4 h-4 text-white fill-white" />
                </div>
              )}
            </div>
            <div className="flex gap-2 mb-2">
              <motion.button
                className={"w-10 h-10 rounded-full flex items-center justify-center " + (isFollowing ? 'bg-of-blue text-white' : 'border border-gray-300')}
                whileTap={{ scale: 0.95 }}
                onClick={handleFollow}
              >
                {isFollowing ? <UserCheck className="w-5 h-5" /> : <UserPlus className="w-5 h-5 text-gray-600" />}
              </motion.button>
              <motion.button
                className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center"
                whileTap={{ scale: 0.95 }}
                onClick={handleMessage}
                disabled={startingChat}
              >
                {startingChat ? (
                  <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <MessageCircle className="w-5 h-5 text-gray-600" />
                )}
              </motion.button>
            </div>
          </div>
        </div>

        <div className="px-4 pt-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{creator.first_name} {creator.last_name || ''}</h1>
            {creator.is_verified && <CheckCircle className="w-5 h-5 text-of-blue fill-of-blue" />}
          </div>
          <p className="text-gray-500 text-sm">@{creator.username || 'creator'}</p>

          {/* Stats */}
          <div className="flex items-center gap-4 mt-3 text-sm">
            <div className="flex items-center gap-1">
              <ImageIcon className="w-4 h-4 text-gray-400" />
              <span className="font-semibold">{creator.posts_count || 0}</span>
            </div>
            <div className="flex items-center gap-1">
              <Heart className="w-4 h-4 text-gray-400" />
              <span className="font-semibold">{formatNumber(creator.likes_received || 0)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-semibold">{formatNumber(creator.followers_count || 0)}</span>
              <span className="text-gray-400">followers</span>
            </div>
          </div>

          {creator.bio && <p className="mt-3 text-sm text-gray-700">{creator.bio}</p>}

          {/* Follow/Subscribe Actions */}
          <div className="mt-4 space-y-3">
            {/* Follow Button */}
            <motion.button
              className={"w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 " + (isFollowing ? 'bg-gray-100 text-gray-700' : 'bg-of-blue text-white')}
              whileTap={{ scale: 0.98 }}
              onClick={handleFollow}
            >
              {isFollowing ? (
                <>
                  <UserCheck className="w-5 h-5" />
                  Following
                </>
              ) : (
                <>
                  <UserPlus className="w-5 h-5" />
                  Follow
                </>
              )}
            </motion.button>

            {/* Subscribe Button - Only for creators */}
            {creator.is_creator && (
              <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-100">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="w-5 h-5 text-purple-500" />
                  <span className="font-semibold text-purple-700">Exclusive Content</span>
                </div>
                <p className="text-sm text-gray-600 mb-3">Get access to exclusive posts, NSFW content, and more!</p>
                <div className="flex items-center justify-between">
                  <motion.button
                    className={"flex-1 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 " + (isSubscribed ? 'bg-purple-100 text-purple-700' : 'bg-purple-500 text-white')}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => !isSubscribed && setShowSubscribeModal(true)}
                  >
                    {isSubscribed ? (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        Subscribed
                      </>
                    ) : (
                      <>
                        <Crown className="w-5 h-5" />
                        Subscribe
                      </>
                    )}
                  </motion.button>
                  <div className="text-right ml-3">
                    <div className="text-lg font-bold text-purple-600">
                      {creator.subscription_price > 0 ? `$${creator.subscription_price}/mo` : 'FREE'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mt-4">
          <button
            className={'flex-1 py-3 text-center text-sm font-semibold ' + (activeTab === 'posts' ? 'tab-active' : 'text-gray-500')}
            onClick={() => setActiveTab('posts')}
          >
            <span className="flex items-center justify-center gap-1">
              <ImageIcon className="w-4 h-4" />
              {posts.length} Posts
            </span>
          </button>
          <button
            className={'flex-1 py-3 text-center text-sm font-semibold ' + (activeTab === 'media' ? 'tab-active' : 'text-gray-500')}
            onClick={() => setActiveTab('media')}
          >
            <span className="flex items-center justify-center gap-1">
              <Eye className="w-4 h-4" />
              {mediaCount} Media
            </span>
          </button>
          <button
            className={'flex-1 py-3 text-center text-sm font-semibold ' + (activeTab === 'exclusive' ? 'tab-active' : 'text-gray-500')}
            onClick={() => setActiveTab('exclusive')}
          >
            <span className="flex items-center justify-center gap-1">
              <Lock className="w-4 h-4" />
              {exclusiveCount} Exclusive
            </span>
          </button>
        </div>

        {/* Content Grid */}
        {loading ? (
          <div className="grid grid-cols-3 gap-0.5 p-0.5">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="aspect-square bg-gray-200 animate-pulse" />
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Lock className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No posts in this category yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5 p-0.5">
            {filteredPosts.map((post) => (
              <motion.div
                key={post.id}
                className="relative aspect-square cursor-pointer"
                whileTap={{ scale: 0.98 }}
                onClick={() => handlePostClick(post)}
              >
                {post.media_url ? (
                  <img
                    src={post.media_url}
                    alt=""
                    className={"w-full h-full object-cover " + (!post.can_view ? 'blur-lg' : '')}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center p-2">
                    <p className={"text-xs text-gray-500 line-clamp-3 " + (!post.can_view ? 'blur-sm' : '')}>
                      {post.content}
                    </p>
                  </div>
                )}

                {/* Lock Overlay */}
                {!post.can_view && (
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center">
                    {post.is_nsfw && (
                      <AlertTriangle className="w-5 h-5 text-orange-400 mb-1" />
                    )}
                    <Lock className="w-6 h-6 text-white" />
                    {post.unlock_price > 0 && (
                      <span className="text-white text-xs mt-1 font-semibold">${post.unlock_price}</span>
                    )}
                  </div>
                )}

                {/* Badges */}
                <div className="absolute top-1 right-1 flex gap-1">
                  {post.is_nsfw && post.can_view && (
                    <span className="bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded">18+</span>
                  )}
                  {post.visibility === 'subscribers' && post.can_view && (
                    <span className="bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded">VIP</span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Subscribe Modal */}
      <AnimatePresence>
        {showSubscribeModal && (
          <motion.div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSubscribeModal(false)}
          >
            <motion.div
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">Subscribe to {creator.first_name}</h3>
                <button onClick={() => setShowSubscribeModal(false)}>
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="text-center mb-6">
                <img
                  src={creator.avatar_url || 'https://i.pravatar.cc/150?u=' + creator.telegram_id}
                  alt={creator.first_name}
                  className="w-20 h-20 rounded-full mx-auto mb-3 object-cover"
                />
                <p className="text-gray-600 mb-2">Get exclusive access to all content</p>
                <p className="text-3xl font-bold text-purple-600">
                  {creator.subscription_price > 0 ? `$${creator.subscription_price}/mo` : 'FREE'}
                </p>
              </div>

              <ul className="text-sm text-gray-600 space-y-2 mb-4">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Access to all exclusive posts
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  NSFW content unlocked
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Direct messaging
                </li>
              </ul>

              {(creator.subscription_price || 0) > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 flex items-center gap-1">
                      <Coins className="w-4 h-4" /> Your balance
                    </span>
                    <span className="font-semibold">{currentUser.balance} tokens</span>
                  </div>
                </div>
              )}

              {subscriptionError && (
                <p className="text-red-500 text-sm text-center mb-4">{subscriptionError}</p>
              )}

              {(creator.subscription_price || 0) > 0 && currentUser.balance < (creator.subscription_price || 0) && (
                <p className="text-orange-500 text-sm text-center mb-4">
                  Insufficient balance. Need {(creator.subscription_price || 0) - currentUser.balance} more tokens.
                </p>
              )}

              <motion.button
                className="w-full py-3 bg-purple-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                whileTap={{ scale: 0.98 }}
                onClick={handleSubscribe}
                disabled={subscribing || ((creator.subscription_price || 0) > 0 && currentUser.balance < (creator.subscription_price || 0))}
              >
                {subscribing ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Crown className="w-5 h-5" />
                    {(creator.subscription_price || 0) > 0 ? `Pay ${creator.subscription_price} tokens` : 'Subscribe Free'}
                  </>
                )}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Purchase Modal */}
      <AnimatePresence>
        {selectedPost && !selectedPost.can_view && selectedPost.unlock_price > 0 && (
          <motion.div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedPost(null)}
          >
            <motion.div
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">Unlock Content</h3>
                <button onClick={() => setSelectedPost(null)}>
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <DollarSign className="w-8 h-8 text-green-600" />
                </div>
                <p className="text-gray-600 mb-2">Unlock this content for</p>
                <p className="text-3xl font-bold text-green-600">${selectedPost.unlock_price.toFixed(2)}</p>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Your balance</span>
                  <span className="font-semibold">{currentUser.balance} tokens</span>
                </div>
              </div>

              <motion.button
                className="w-full py-3 bg-green-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
                whileTap={{ scale: 0.98 }}
                onClick={() => handlePurchase(selectedPost)}
                disabled={purchasing || currentUser.balance < selectedPost.unlock_price}
              >
                {purchasing ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Unlock
                  </>
                )}
              </motion.button>

              {purchaseError && (
                <p className="text-red-500 text-sm text-center mt-2">{purchaseError}</p>
              )}

              {currentUser.balance < selectedPost.unlock_price && !purchaseError && (
                <p className="text-red-500 text-sm text-center mt-2">Insufficient balance</p>
              )}
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
    </div>
  )
}

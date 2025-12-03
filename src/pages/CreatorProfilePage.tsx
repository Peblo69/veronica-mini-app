import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, MoreHorizontal, CheckCircle, Lock, Grid } from 'lucide-react'
import { getCreatorPosts, followUser, unfollowUser, type User, type Post } from '../lib/api'
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
  const [_startingChat, setStartingChat] = useState(false)
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null)
  const [_purchaseError, setPurchaseError] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [creator.telegram_id])

  const loadData = async () => {
    setLoading(true)
    const { posts: creatorPosts, relationship } = await getCreatorPosts(creator.telegram_id, currentUser.telegram_id)
    setPosts(creatorPosts)
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

  return (
    <div className="bg-white min-h-full">
      {/* Top Bar */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-100 px-4 py-2 flex items-center justify-between safe-area-top">
        <button onClick={onBack}>
          <ArrowLeft className="w-7 h-7 text-gray-900" />
        </button>
        <div className="font-bold text-lg flex items-center gap-1">
           {creator.username || 'user'} 
           {creator.is_verified && <CheckCircle className="w-3.5 h-3.5 text-blue-500 fill-blue-500" />}
        </div>
        <button>
          <MoreHorizontal className="w-7 h-7 text-gray-900" />
        </button>
      </div>

      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-8 mb-4">
          {/* Avatar */}
          <div className="relative shrink-0">
             <div className="w-20 h-20 rounded-full p-[2px] bg-gradient-to-tr from-gray-200 to-gray-100">
               <img 
                 src={creator.avatar_url || 'https://i.pravatar.cc/150?u=' + creator.telegram_id} 
                 alt={creator.first_name} 
                 className="w-full h-full rounded-full object-cover border-2 border-white" 
               />
            </div>
          </div>

          {/* Stats */}
          <div className="flex-1 flex justify-around items-center">
            <div className="flex flex-col items-center">
              <span className="font-bold text-lg leading-tight">{creator.posts_count || 0}</span>
              <span className="text-[13px] text-gray-900">posts</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-bold text-lg leading-tight">{formatNumber(creator.followers_count || 0)}</span>
              <span className="text-[13px] text-gray-900">followers</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-bold text-lg leading-tight">{formatNumber(creator.following_count || 0)}</span>
              <span className="text-[13px] text-gray-900">following</span>
            </div>
          </div>
        </div>

        {/* Bio Section */}
        <div className="mb-4">
          <div className="font-bold text-sm mb-0.5">{creator.first_name} {creator.last_name}</div>
          {creator.is_creator && <div className="text-xs text-gray-500 mb-1">Digital Creator</div>}
          <div className="text-sm whitespace-pre-wrap leading-snug">
            {creator.bio || 'No bio yet.'}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mb-6">
          <button 
            className={`flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors ${isFollowing ? 'bg-gray-100 text-gray-900' : 'bg-blue-500 text-white'}`}
            onClick={handleFollow}
          >
            {isFollowing ? 'Following' : 'Follow'}
          </button>
          <button 
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-sm font-semibold py-1.5 rounded-lg transition-colors text-gray-900"
            onClick={handleMessage}
          >
            Message
          </button>
          {creator.is_creator && (
            <button 
              className={`flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors ${isSubscribed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-900'}`}
              onClick={() => !isSubscribed && setShowSubscribeModal(true)}
            >
              {isSubscribed ? 'Subscribed' : 'Subscribe'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-t border-gray-100">
        <button
          className={`flex-1 py-3 flex items-center justify-center border-b-[1px] transition-colors ${activeTab === 'posts' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}
          onClick={() => setActiveTab('posts')}
        >
          <Grid className="w-6 h-6" />
        </button>
        {creator.is_creator && (
          <button
            className={`flex-1 py-3 flex items-center justify-center border-b-[1px] transition-colors ${activeTab === 'exclusive' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}
            onClick={() => setActiveTab('exclusive')}
          >
            <Lock className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Content Grid */}
      <div className="pb-24">
        {loading ? (
          <div className="grid grid-cols-3 gap-0.5">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="aspect-square bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : filteredPosts.length === 0 ? (
          <div className="py-20 text-center">
            <div className="w-16 h-16 rounded-full border-2 border-gray-800 flex items-center justify-center mx-auto mb-4">
               <Grid className="w-8 h-8 text-gray-800" />
            </div>
            <h3 className="font-bold text-xl mb-2">No Posts Yet</h3>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5">
            {filteredPosts.map((post) => (
              <motion.div
                key={post.id}
                className="relative aspect-square cursor-pointer overflow-hidden bg-gray-100"
                whileTap={{ opacity: 0.9 }}
                onClick={() => handlePostClick(post)}
              >
                {post.media_url ? (
                  <img 
                    src={post.media_url} 
                    alt="" 
                    className={`w-full h-full object-cover ${!post.can_view ? 'blur-md scale-110' : ''}`} 
                  />
                ) : (
                  <div className="w-full h-full bg-gray-50 flex items-center justify-center p-3">
                    <p className={`text-[10px] text-gray-500 text-center line-clamp-4 ${!post.can_view ? 'blur-sm' : ''}`}>{post.content}</p>
                  </div>
                )}
                {!post.can_view && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                    <Lock className="w-5 h-5 text-white drop-shadow-md" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Subscribe Modal */}
      <AnimatePresence>
        {showSubscribeModal && (
          <motion.div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSubscribeModal(false)}
          >
            <motion.div
              className="bg-white rounded-2xl w-full max-w-sm overflow-hidden"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 text-center">
                <div className="w-20 h-20 mx-auto rounded-full p-1 border-2 border-purple-500 mb-4">
                  <img
                    src={creator.avatar_url || 'https://i.pravatar.cc/150?u=' + creator.telegram_id}
                    alt={creator.first_name}
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
                <h3 className="text-xl font-bold mb-1">Subscribe to {creator.first_name}</h3>
                <p className="text-gray-500 text-sm mb-6">Unlock exclusive posts and more</p>
                
                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-3 text-sm text-left">
                    <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Full access to exclusive content</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-left">
                    <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Direct messaging</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-left">
                    <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Support the creator directly</span>
                  </div>
                </div>

                {subscriptionError && (
                  <p className="text-red-500 text-sm mb-4">{subscriptionError}</p>
                )}

                <button
                  className="w-full py-3 bg-blue-500 text-white font-bold rounded-xl disabled:opacity-50"
                  onClick={handleSubscribe}
                  disabled={subscribing || ((creator.subscription_price || 0) > 0 && currentUser.balance < (creator.subscription_price || 0))}
                >
                  {subscribing ? 'Processing...' : `Subscribe for $${creator.subscription_price || 'Free'}`}
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
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedPost(null)}
          >
            <motion.div
              className="bg-white rounded-2xl w-full max-w-sm p-6"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-center mb-4">Unlock Post</h3>
              <p className="text-center text-gray-500 mb-6">
                Unlock this post for <span className="font-bold text-gray-900">${selectedPost.unlock_price}</span>
              </p>
              <button
                className="w-full py-3 bg-green-500 text-white font-bold rounded-xl disabled:opacity-50"
                onClick={() => handlePurchase(selectedPost)}
                disabled={purchasing || currentUser.balance < selectedPost.unlock_price}
              >
                {purchasing ? 'Processing...' : 'Confirm Purchase'}
              </button>
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

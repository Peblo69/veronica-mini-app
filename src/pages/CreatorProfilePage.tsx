import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, MoreHorizontal, CheckCircle, Image as ImageIcon, Lock, MessageCircle, UserPlus, Crown, DollarSign, X, AlertTriangle, Grid } from 'lucide-react'
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
  const [_purchaseError, setPurchaseError] = useState<string | null>(null)

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

  const _exclusiveCount = posts.filter(p => p.visibility === 'subscribers' || p.is_nsfw).length
  const _mediaCount = posts.filter(p => p.media_url).length
  void _exclusiveCount; void _mediaCount // Used for future tab counts

  return (
    <div className="bg-gray-50 min-h-full relative">
      {/* Animated Background Banner */}
      <div className="relative h-44 overflow-hidden">
         <div className="absolute inset-0 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 animate-gradient bg-[length:200%_200%]" />
         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>
         <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-50/90" />

         {/* Back Navigation - Fixed at top */}
         <div className="absolute top-2 left-0 right-0 px-3 z-20 flex justify-between items-center">
            <button onClick={onBack} className="w-9 h-9 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/30 transition-colors border border-white/20">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button className="w-9 h-9 bg-black/20 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/30 transition-colors border border-white/20">
              <MoreHorizontal className="w-5 h-5" />
            </button>
         </div>
      </div>

      <div className="px-5 -mt-20 relative z-10">
        <div className="flex justify-between items-end mb-4">
          <motion.div 
            className="relative"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", duration: 0.6 }}
          >
            <div className="w-28 h-28 rounded-full p-[4px] bg-white/80 backdrop-blur-sm shadow-xl">
               <img 
                 src={creator.avatar_url || 'https://i.pravatar.cc/150?u=' + creator.telegram_id} 
                 alt={creator.first_name} 
                 className="w-full h-full rounded-full object-cover border-2 border-white" 
               />
            </div>
            {creator.is_verified && (
              <div className="absolute bottom-1 right-1 w-8 h-8 bg-of-blue rounded-full flex items-center justify-center border-[3px] border-white shadow-md">
                <CheckCircle className="w-4 h-4 text-white fill-white" />
              </div>
            )}
          </motion.div>
          
          <div className="flex gap-2 mb-1">
            <motion.button
              className={"h-11 px-6 rounded-full flex items-center gap-2 font-bold text-sm shadow-lg transition-all " + (isFollowing ? 'bg-gray-100 text-gray-700 border border-gray-200' : 'bg-gray-900 text-white shadow-gray-900/20')}
              whileTap={{ scale: 0.95 }}
              onClick={handleFollow}
            >
              {isFollowing ? (
                <>Following</>
              ) : (
                <><UserPlus className="w-4 h-4" /> Follow</>
              )}
            </motion.button>
            <motion.button
              className="w-11 h-11 rounded-full border border-gray-200 bg-white flex items-center justify-center text-gray-700 shadow-sm hover:bg-gray-50"
              whileTap={{ scale: 0.95 }}
              onClick={handleMessage}
              disabled={startingChat}
            >
              {startingChat ? (
                <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <MessageCircle className="w-5 h-5" />
              )}
            </motion.button>
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-5 mb-4 relative overflow-hidden">
          <div className="relative z-10">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              {creator.first_name} {creator.last_name || ''}
            </h1>
            <p className="text-gray-500 text-sm font-medium mb-4">@{creator.username || 'creator'}</p>

            <div className="flex items-center justify-between px-2 py-3 bg-white/50 rounded-2xl mb-4 border border-white/60">
              <div className="text-center flex-1">
                <div className="font-bold text-lg text-gray-900">{creator.posts_count || 0}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Posts</div>
              </div>
              <div className="w-px h-8 bg-gray-200/80" />
              <div className="text-center flex-1">
                <div className="font-bold text-lg text-gray-900">{formatNumber(creator.likes_received || 0)}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Likes</div>
              </div>
              <div className="w-px h-8 bg-gray-200/80" />
              <div className="text-center flex-1">
                <div className="font-bold text-lg text-gray-900">{formatNumber(creator.followers_count || 0)}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fans</div>
              </div>
            </div>

            <p className="text-sm text-gray-600 leading-relaxed mb-5">{creator.bio || 'No bio available.'}</p>

            {/* Subscription Card */}
            {creator.is_creator && (
              <div className="relative overflow-hidden rounded-2xl p-[1px] bg-gradient-to-br from-purple-400 via-pink-500 to-of-blue">
                <div className="bg-white rounded-2xl p-4 relative h-full">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600">
                        <Crown className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 text-sm">Premium Access</h3>
                        <p className="text-[10px] text-gray-500">Unlock exclusive content</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="block text-lg font-bold text-gray-900">{creator.subscription_price > 0 ? `$${creator.subscription_price}` : 'FREE'}</span>
                      <span className="text-[10px] text-gray-400 font-medium uppercase">PER MONTH</span>
                    </div>
                  </div>
                  
                  <motion.button
                    className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all
                      ${isSubscribed 
                        ? 'bg-green-50 text-green-600 border border-green-200 shadow-none' 
                        : 'bg-gradient-to-r from-of-blue to-blue-600 text-white shadow-blue-500/30'}`}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => !isSubscribed && setShowSubscribeModal(true)}
                    disabled={isSubscribed}
                  >
                    {isSubscribed ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Active Subscription
                      </>
                    ) : (
                      <>
                        Subscribe Now
                      </>
                    )}
                  </motion.button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-t-[2.5rem] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] min-h-[60vh] relative z-10 pb-24">
        <div className="flex justify-center pt-3 pb-1">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
        </div>
        <div className="flex border-b border-gray-100 px-4 sticky top-0 bg-white/95 backdrop-blur-xl z-20">
          <button
            className={'flex-1 py-4 flex items-center justify-center gap-2 text-[13px] font-bold transition-colors relative ' + (activeTab === 'posts' ? 'text-gray-900' : 'text-gray-400')}
            onClick={() => setActiveTab('posts')}
          >
            <Grid className="w-4 h-4" /> POSTS
            {activeTab === 'posts' && <motion.div layoutId="activeTabCreator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-t-full" />}
          </button>
          <button
            className={'flex-1 py-4 flex items-center justify-center gap-2 text-[13px] font-bold transition-colors relative ' + (activeTab === 'media' ? 'text-gray-900' : 'text-gray-400')}
            onClick={() => setActiveTab('media')}
          >
            <ImageIcon className="w-4 h-4" /> MEDIA
            {activeTab === 'media' && <motion.div layoutId="activeTabCreator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-t-full" />}
          </button>
          <button
            className={'flex-1 py-4 flex items-center justify-center gap-2 text-[13px] font-bold transition-colors relative ' + (activeTab === 'exclusive' ? 'text-gray-900' : 'text-gray-400')}
            onClick={() => setActiveTab('exclusive')}
          >
            <Lock className="w-4 h-4" /> VIP
            {activeTab === 'exclusive' && <motion.div layoutId="activeTabCreator" className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-t-full" />}
          </button>
        </div>

        {/* Content Grid */}
        <div className="p-1">
          {loading ? (
            <div className="grid grid-cols-3 gap-1">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="aspect-square bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredPosts.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                 <Lock className="w-6 h-6 text-gray-300" />
              </div>
              <p className="text-gray-400 font-medium text-sm">No posts found</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {filteredPosts.map((post) => (
                <motion.div
                  key={post.id}
                  className="relative aspect-square cursor-pointer overflow-hidden rounded-xl bg-gray-100"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handlePostClick(post)}
                >
                  {post.media_url ? (
                    <img
                      src={post.media_url}
                      alt=""
                      className={"w-full h-full object-cover transition-transform duration-500 hover:scale-110 " + (!post.can_view ? 'blur-xl scale-110 opacity-80' : '')}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-3">
                      <p className={"text-[10px] text-gray-400 text-center line-clamp-4 leading-tight " + (!post.can_view ? 'blur-sm' : '')}>
                        {post.content}
                      </p>
                    </div>
                  )}

                  {/* Lock Overlay */}
                  {!post.can_view && (
                    <div className="absolute inset-0 bg-black/10 flex flex-col items-center justify-center">
                      <div className="bg-black/40 backdrop-blur-md p-2 rounded-full">
                        <Lock className="w-4 h-4 text-white" />
                      </div>
                      {post.unlock_price > 0 && (
                        <span className="text-white text-[10px] mt-1 font-bold drop-shadow-md">${post.unlock_price}</span>
                      )}
                    </div>
                  )}

                  {/* Badges */}
                  <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
                    {post.is_nsfw && (
                      <span className="bg-orange-500/90 backdrop-blur-sm text-white text-[8px] px-1.5 py-0.5 rounded font-bold">18+</span>
                    )}
                    {post.visibility === 'subscribers' && (
                      <span className="bg-purple-500/90 backdrop-blur-sm text-white text-[8px] px-1.5 py-0.5 rounded font-bold">VIP</span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Subscribe Modal */}
      <AnimatePresence>
        {showSubscribeModal && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSubscribeModal(false)}
          >
            <motion.div
              className="bg-white rounded-[2rem] p-6 max-w-sm w-full relative overflow-hidden"
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-purple-50 to-transparent -z-10" />
              
              <div className="flex justify-between items-center mb-6 relative z-10">
                <h3 className="text-lg font-bold">Subscribe Access</h3>
                <button onClick={() => setShowSubscribeModal(false)} className="p-1 rounded-full hover:bg-gray-100 transition-colors">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="text-center mb-8 relative z-10">
                <div className="w-20 h-20 mx-auto mb-4 relative">
                   <div className="absolute inset-0 bg-purple-500/20 blur-xl rounded-full animate-pulse" />
                   <img
                    src={creator.avatar_url || 'https://i.pravatar.cc/150?u=' + creator.telegram_id}
                    alt={creator.first_name}
                    className="w-full h-full rounded-full object-cover border-2 border-white shadow-lg relative z-10"
                  />
                  <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow-sm z-20">
                    <Crown className="w-4 h-4 text-purple-500 fill-purple-500" />
                  </div>
                </div>
                
                <h4 className="text-xl font-bold text-gray-900 mb-1">{creator.first_name}'s VIP Club</h4>
                <p className="text-gray-500 text-sm">Unlock all exclusive content</p>
              </div>

              <div className="space-y-3 mb-8">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div className="text-sm">
                    <span className="font-bold text-gray-900">Exclusive Posts</span>
                    <p className="text-gray-500 text-xs">Full access to feed</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="text-sm">
                    <span className="font-bold text-gray-900">Uncensored Content</span>
                    <p className="text-gray-500 text-xs">View NSFW media</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                    <MessageCircle className="w-4 h-4" />
                  </div>
                  <div className="text-sm">
                    <span className="font-bold text-gray-900">Direct Messaging</span>
                    <p className="text-gray-500 text-xs">Chat with creator</p>
                  </div>
                </div>
              </div>

              {(creator.subscription_price || 0) > 0 && (
                <div className="flex justify-between text-sm mb-4 px-2">
                  <span className="text-gray-500">Wallet Balance</span>
                  <span className="font-bold text-gray-900">{currentUser.balance} tokens</span>
                </div>
              )}

              {subscriptionError && (
                <p className="text-red-500 text-sm text-center mb-4 bg-red-50 p-2 rounded-lg">{subscriptionError}</p>
              )}

              <motion.button
                className={`w-full py-4 rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 shadow-lg shadow-purple-500/30 transition-all
                  ${(creator.subscription_price || 0) > 0 && currentUser.balance < (creator.subscription_price || 0)
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                    : 'bg-gradient-to-r from-purple-500 to-pink-600 text-white'}`}
                whileTap={!((creator.subscription_price || 0) > 0 && currentUser.balance < (creator.subscription_price || 0)) ? { scale: 0.98 } : {}}
                onClick={handleSubscribe}
                disabled={subscribing || ((creator.subscription_price || 0) > 0 && currentUser.balance < (creator.subscription_price || 0))}
              >
                {subscribing ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    {(creator.subscription_price || 0) > 0 ? `Subscribe for $${creator.subscription_price}` : 'Subscribe for Free'}
                  </>
                )}
              </motion.button>
              
              {(creator.subscription_price || 0) > 0 && currentUser.balance < (creator.subscription_price || 0) && (
                 <button className="w-full mt-3 py-2 text-sm text-purple-600 font-semibold hover:bg-purple-50 rounded-xl transition-colors">
                   + Top Up Wallet
                 </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Purchase Modal */}
      <AnimatePresence>
        {selectedPost && !selectedPost.can_view && selectedPost.unlock_price > 0 && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedPost(null)}
          >
            <motion.div
              className="bg-white/90 backdrop-blur-xl rounded-[2rem] p-6 max-w-sm w-full shadow-2xl border border-white/50"
              initial={{ scale: 0.9, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 30 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900">Unlock Content</h3>
                <button onClick={() => setSelectedPost(null)} className="p-1 rounded-full hover:bg-gray-100 transition-colors">
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              <div className="text-center mb-8 relative">
                <div className="absolute inset-0 bg-green-400/20 blur-3xl rounded-full" />
                <div className="relative w-20 h-20 bg-gradient-to-br from-green-100 to-green-50 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner border border-white/50">
                  <DollarSign className="w-10 h-10 text-green-600" />
                </div>
                <p className="text-gray-500 text-sm font-medium mb-1">One-time purchase</p>
                <p className="text-4xl font-bold text-green-600 tracking-tight">${selectedPost.unlock_price.toFixed(2)}</p>
              </div>

              <div className="bg-gray-50/80 rounded-2xl p-4 mb-6 border border-gray-100">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-500">Your balance</span>
                  <span className="font-bold text-gray-800">{currentUser.balance} tokens</span>
                </div>
                <div className="w-full h-[1px] bg-gray-200 my-2" />
                <div className="flex justify-between text-sm items-center">
                  <span className="text-gray-500">Remaining</span>
                  <span className={`font-bold ${currentUser.balance >= selectedPost.unlock_price ? 'text-gray-800' : 'text-red-500'}`}>
                    {(currentUser.balance - selectedPost.unlock_price).toFixed(2)} tokens
                  </span>
                </div>
              </div>

              <motion.button
                className={`w-full py-3.5 rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 shadow-lg transition-all
                  ${currentUser.balance >= selectedPost.unlock_price 
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-green-500/25' 
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                whileHover={currentUser.balance >= selectedPost.unlock_price ? { scale: 1.02, y: -1 } : {}}
                whileTap={currentUser.balance >= selectedPost.unlock_price ? { scale: 0.98 } : {}}
                onClick={() => handlePurchase(selectedPost)}
                disabled={purchasing || currentUser.balance < selectedPost.unlock_price}
              >
                {purchasing ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    {currentUser.balance >= selectedPost.unlock_price ? 'Confirm Payment' : 'Insufficient Balance'}
                  </>
                )}
              </motion.button>

              {currentUser.balance < selectedPost.unlock_price && (
                <button className="w-full mt-3 py-2 text-sm text-of-blue font-semibold hover:bg-blue-50 rounded-xl transition-colors">
                  Top up wallet
                </button>
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

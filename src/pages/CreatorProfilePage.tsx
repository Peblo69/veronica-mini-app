import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, MoreHorizontal, CheckCircle, Lock, Grid, Star, X, Gift, Bookmark, Wallet, BarChart3, ArrowUpRight, ArrowDownLeft, Users, Eye, TrendingUp, Video, Image as ImageIcon } from 'lucide-react'
import { getCreatorPosts, followUser, unfollowUser, subscribeToFollowerChanges, subscribeToUserUpdates, type User, type Post } from '../lib/api'
import { getOrCreateConversation } from '../lib/chatApi'
import { unlockPostWithPayment, sendTipWithPayment, getWallet, getTransactions, type Wallet as WalletType, type Transaction } from '../lib/paymentsApi'
import { toast } from '../lib/toast'
import PostDetail from '../components/PostDetail'

interface CreatorProfilePageProps {
  creator: User
  currentUser: User
  onBack: () => void
  onMessage?: (conversationId: string) => void
  onUserUpdate?: (updatedUser: Partial<User>) => void
}

export default function CreatorProfilePage({ creator, currentUser, onBack, onMessage, onUserUpdate }: CreatorProfilePageProps) {
  const [activeTab, setActiveTab] = useState<'posts' | 'saved' | 'wallet' | 'stats'>('posts')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  // Initialize as null to distinguish "not loaded yet" from "not following"
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null)
  const [isSubscribed, setIsSubscribed] = useState(false)
  // Local state for real-time count updates
  const [followersCount, setFollowersCount] = useState(creator.followers_count || 0)
  const [followingCount] = useState(creator.following_count || 0)
  const [subscribing, setSubscribing] = useState(false)
  const [showSubscribeModal, setShowSubscribeModal] = useState(false)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [viewingPost, setViewingPost] = useState<Post | null>(null)
  const [purchasing, setPurchasing] = useState(false)
  const [startingChat, setStartingChat] = useState(false)
  const [followInProgress, setFollowInProgress] = useState(false)
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null)
  void setSubscribing
  void setSubscriptionError
  const [showTipModal, setShowTipModal] = useState(false)
  const [tipAmount, setTipAmount] = useState(50)
  const [tipMessage, setTipMessage] = useState('')
  const [tipping, setTipping] = useState(false)
  const [walletData, setWalletData] = useState<WalletType | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [walletLoading, setWalletLoading] = useState(false)

  useEffect(() => {
    loadData()
  }, [creator.telegram_id])

  // Subscribe to realtime follower changes
  useEffect(() => {
    const unsubscribeFollowers = subscribeToFollowerChanges(creator.telegram_id, {
      onNewFollower: (followerId) => {
        // Someone else followed this creator - update count
        if (followerId !== currentUser.telegram_id) {
          setFollowersCount(prev => prev + 1)
        }
      },
      onUnfollow: (followerId) => {
        // Someone else unfollowed this creator - update count
        if (followerId !== currentUser.telegram_id) {
          setFollowersCount(prev => Math.max(0, prev - 1))
        }
      }
    })

    // Also subscribe to user profile updates (for other stats)
    const unsubscribeUser = subscribeToUserUpdates(creator.telegram_id, (updatedUser) => {
      // Update any changed fields
      setFollowersCount(updatedUser.followers_count || 0)
    })

    return () => {
      unsubscribeFollowers()
      unsubscribeUser()
    }
  }, [creator.telegram_id, currentUser.telegram_id])

  // Load wallet data when wallet tab is selected
  useEffect(() => {
    if (activeTab === 'wallet' && !walletData && !walletLoading) {
      loadWalletData()
    }
  }, [activeTab])

  const loadWalletData = async () => {
    setWalletLoading(true)
    try {
      const [walletResult, transactionsResult] = await Promise.all([
        getWallet(creator.telegram_id),
        getTransactions(creator.telegram_id)
      ])
      if (walletResult.wallet) {
        setWalletData(walletResult.wallet)
      }
      if (transactionsResult.transactions) {
        setTransactions(transactionsResult.transactions)
      }
    } catch (err) {
      console.error('Failed to load wallet data:', err)
    }
    setWalletLoading(false)
  }

  const loadData = async () => {
    setLoading(true)
    const { posts: creatorPosts, relationship } = await getCreatorPosts(creator.telegram_id, currentUser.telegram_id)
    setPosts(creatorPosts)
    setIsFollowing(relationship.is_following)
    setIsSubscribed(relationship.is_subscribed)
    setLoading(false)
  }

  const handleFollow = async () => {
    // Prevent double-clicks
    if (followInProgress) return
    setFollowInProgress(true)

    try {
      if (isFollowing) {
        // Optimistic update - update UI immediately
        setIsFollowing(false)
        setFollowersCount(prev => Math.max(0, prev - 1))
        // Update current user's following_count locally
        if (onUserUpdate) {
          onUserUpdate({ following_count: Math.max(0, (currentUser.following_count || 0) - 1) })
        }

        const success = await unfollowUser(currentUser.telegram_id, creator.telegram_id)
        if (!success) {
          // Revert on failure
          setIsFollowing(true)
          setFollowersCount(prev => prev + 1)
          if (onUserUpdate) {
            onUserUpdate({ following_count: (currentUser.following_count || 0) })
          }
          toast.error('Failed to unfollow. Please try again.')
        }
      } else {
        // Optimistic update - update UI immediately
        setIsFollowing(true)
        setFollowersCount(prev => prev + 1)
        // Update current user's following_count locally
        if (onUserUpdate) {
          onUserUpdate({ following_count: (currentUser.following_count || 0) + 1 })
        }

        const success = await followUser(currentUser.telegram_id, creator.telegram_id)
        if (!success) {
          // Revert on failure
          setIsFollowing(false)
          setFollowersCount(prev => Math.max(0, prev - 1))
          if (onUserUpdate) {
            onUserUpdate({ following_count: Math.max(0, (currentUser.following_count || 0)) })
          }
          toast.error('Failed to follow. Please try again.')
        }
      }
    } finally {
      setFollowInProgress(false)
    }
  }

  const handleSubscribe = async () => {
    // TODO: Implement subscription via Telegram Stars
    // For now, show a message that subscription feature is coming soon
    setShowSubscribeModal(false)
    toast.info('Subscription with Stars coming soon!')
  }

  const handlePurchase = async (post: Post) => {
    setPurchasing(true)

    await unlockPostWithPayment(
      currentUser.telegram_id,
      post.id,
      () => {
        // Success callback
        setPosts(posts.map(p => p.id === post.id ? { ...p, can_view: true, is_purchased: true } : p))
        setSelectedPost(null)
        setPurchasing(false)
        toast.success('Content unlocked!')
      },
      (error) => {
        // Failed callback
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
        // Success
        setShowTipModal(false)
        setTipAmount(50)
        setTipMessage('')
        setTipping(false)
        toast.success(`Sent ${tipAmount} Stars to ${creator.first_name}!`)
      },
      (error) => {
        // Failed
        setTipping(false)
        toast.error(error || 'Tip failed')
      }
    )
  }

  const handleMessage = async () => {
    if (!onMessage || startingChat) return
    setStartingChat(true)
    try {
      // Pass currentUser as the initiator so the request goes to the creator
      const conversation = await getOrCreateConversation(currentUser.telegram_id, creator.telegram_id, currentUser.telegram_id)
      if (conversation) {
        onMessage(conversation.id)
      } else {
        toast.error('Could not start conversation. Please try again.')
      }
    } catch (err) {
      console.error('Failed to start chat:', err)
      toast.error('Failed to start chat. Please try again.')
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

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
  }

  // Fixed header rendered via portal to escape the animated container
  const fixedHeader = createPortal(
    <div
      className="fixed left-0 right-0 z-[100] bg-[#0c0c0c] border-b border-white/5 px-4 py-3 flex items-center justify-between"
      style={{ top: 'max(44px, calc(env(safe-area-inset-top, 0px) + 44px))' }}
    >
      <button onClick={onBack}>
        <ArrowLeft className="w-7 h-7 text-white" />
      </button>
      <div className="font-bold text-lg flex items-center gap-1">
         {creator.username || 'user'}
         {creator.is_verified && <CheckCircle className="w-3.5 h-3.5 text-blue-400 fill-blue-400" />}
      </div>
      <button>
        <MoreHorizontal className="w-7 h-7 text-white" />
      </button>
    </div>,
    document.body
  )

  return (
    <div className="bg-[#050505] min-h-full text-white">
      {/* Fixed header via portal */}
      {fixedHeader}

      {/* Spacer for fixed header */}
      <div style={{ height: '52px' }} />

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
                 src={creator.avatar_url || 'https://i.pravatar.cc/150?u=' + creator.telegram_id}
                 alt={creator.first_name}
                 className="w-full h-full rounded-full object-cover border border-white/15"
               />
            </div>
          </div>

          {/* Stats */}
          <div className="flex-1 flex justify-around items-center">
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-semibold text-[18px] leading-tight text-white">{creator.posts_count || 0}</span>
              <span className="text-[12px] text-white/60">Posts</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-semibold text-[18px] leading-tight text-white">{formatNumber(followersCount)}</span>
              <span className="text-[12px] text-white/60">Followers</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-semibold text-[18px] leading-tight text-white">{formatNumber(followingCount)}</span>
              <span className="text-[12px] text-white/60">Following</span>
            </div>
          </div>
        </div>

        {/* Bio Section */}
        <div className="mb-5 relative z-10">
          <div className="font-bold text-sm mb-0.5 text-white flex items-center gap-2">
            {creator.first_name} {creator.last_name}
          </div>
          {creator.is_creator && <div className="text-xs text-blue-300 mb-1">Digital Creator</div>}
          <div className="text-sm whitespace-pre-wrap leading-snug text-white/80">
            {creator.bio || 'No bio yet.'}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mb-4 relative z-10">
          <button
            className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-colors border ${
              isFollowing === null || followInProgress
                ? 'bg-white/5 border-white/10 text-white/50'
                : isFollowing
                  ? 'bg-white/10 border-white/10 text-white'
                  : 'bg-blue-500 border-blue-500 text-white'
            }`}
            onClick={handleFollow}
            disabled={isFollowing === null || followInProgress}
          >
            {isFollowing === null || followInProgress ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white/70 rounded-full animate-spin" />
            ) : isFollowing ? 'Following' : 'Follow'}
          </button>
          <button
            className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-colors border ${
              startingChat
                ? 'bg-white/5 border-white/10 text-white/50'
                : 'bg-white/10 hover:bg-white/15 border-white/10 text-white'
            }`}
            onClick={handleMessage}
            disabled={startingChat}
          >
            {startingChat ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white/70 rounded-full animate-spin" />
            ) : 'Message'}
          </button>
          {creator.is_creator && (
            <button
              className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-colors border ${isSubscribed ? 'bg-green-500/20 border-green-500/30 text-green-400' : 'bg-white/10 border-white/10 text-white'}`}
              onClick={() => !isSubscribed && setShowSubscribeModal(true)}
            >
              {isSubscribed ? 'Subscribed' : 'Subscribe'}
            </button>
          )}
        </div>

        {/* Tip Button */}
        {creator.is_creator && creator.telegram_id !== currentUser.telegram_id && (
          <button
            className="w-full mb-4 py-2.5 bg-gradient-to-r from-yellow-400 to-orange-500 text-black text-sm font-bold rounded-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity relative z-10"
            onClick={() => setShowTipModal(true)}
          >
            <Star className="w-4 h-4 fill-current" />
            Send a Tip
          </button>
        )}
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
        <button
          className={`flex-1 py-3 flex items-center justify-center border-b-[2px] transition-colors ${activeTab === 'wallet' ? 'border-blue-500 text-white' : 'border-transparent text-white/50'}`}
          onClick={() => setActiveTab('wallet')}
        >
          <Wallet className="w-5 h-5" />
        </button>
        <button
          className={`flex-1 py-3 flex items-center justify-center border-b-[2px] transition-colors ${activeTab === 'stats' ? 'border-blue-500 text-white' : 'border-transparent text-white/50'}`}
          onClick={() => setActiveTab('stats')}
        >
          <BarChart3 className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="pb-28 bg-[#050505]">
        {/* Posts Tab */}
        {activeTab === 'posts' && (
          loading ? (
            <div className="grid grid-cols-3 gap-[2px] px-[2px]">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="aspect-square bg-white/5 animate-pulse rounded-sm" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="py-20 text-center text-white">
              <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center mx-auto mb-4 bg-white/5">
                 <Grid className="w-7 h-7 text-white/70" />
              </div>
              <h3 className="font-bold text-lg mb-2">No posts yet</h3>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-[2px] px-[2px]">
              {posts.map((post) => (
                <motion.div
                  key={post.id}
                  className="relative aspect-square cursor-pointer overflow-hidden bg-white/5"
                  whileTap={{ opacity: 0.9 }}
                  onClick={() => handlePostClick(post)}
                >
                  <CreatorMediaTile post={post} />
                  {!post.can_view && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Lock className="w-5 h-5 text-white drop-shadow-md" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )
        )}

        {/* Saved Tab - Placeholder for creator's saved/highlights */}
        {activeTab === 'saved' && (
          <div className="py-20 text-center text-white">
            <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center mx-auto mb-4 bg-white/5">
               <Bookmark className="w-7 h-7 text-white/70" />
            </div>
            <h3 className="font-bold text-lg mb-2">Highlights</h3>
            <p className="text-sm text-white/60 max-w-xs mx-auto">Creator's saved content and highlights</p>
          </div>
        )}

        {/* Wallet Tab */}
        {activeTab === 'wallet' && (
          walletLoading ? (
            <div className="p-3 space-y-3">
              <div className="h-24 bg-white/5 animate-pulse rounded-xl" />
              <div className="h-16 bg-white/5 animate-pulse rounded-xl" />
              <div className="h-16 bg-white/5 animate-pulse rounded-xl" />
            </div>
          ) : (
            <div className="p-3 space-y-3 relative">
              {/* Premium Star Background */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-4 left-8 w-1 h-1 bg-yellow-400/40 rounded-full animate-pulse" />
                <div className="absolute top-12 right-12 w-0.5 h-0.5 bg-yellow-300/30 rounded-full" />
                <div className="absolute top-24 left-16 w-0.5 h-0.5 bg-white/20 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }} />
                <div className="absolute top-32 right-8 w-1 h-1 bg-yellow-400/25 rounded-full" />
                <div className="absolute top-48 left-6 w-0.5 h-0.5 bg-yellow-300/35 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
                <div className="absolute top-56 right-20 w-0.5 h-0.5 bg-white/15 rounded-full" />
              </div>

              {/* Balance Card - Compact */}
              <div className="relative bg-[#0a0a0f] border border-white/5 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white/50 text-xs font-medium uppercase tracking-wide">Balance</span>
                  <Star className="w-4 h-4 text-yellow-500/70" />
                </div>
                <div className="flex items-baseline gap-1.5 mb-3">
                  <span className="text-3xl font-bold text-white">{walletData?.stars_balance || 0}</span>
                  <span className="text-white/40 text-sm">Stars</span>
                </div>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-2 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-lg border border-white/5 transition-colors"
                >
                  Cash Out
                </motion.button>
              </div>

              {/* Stats Grid - Smaller */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#0a0a0f] border border-white/5 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ArrowDownLeft className="w-3 h-3 text-emerald-500/70" />
                    <span className="text-white/40 text-[10px] uppercase tracking-wide">Earned</span>
                  </div>
                  <span className="text-lg font-semibold text-white">{walletData?.total_earned || 0}</span>
                </div>
                <div className="bg-[#0a0a0f] border border-white/5 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ArrowUpRight className="w-3 h-3 text-white/40" />
                    <span className="text-white/40 text-[10px] uppercase tracking-wide">Spent</span>
                  </div>
                  <span className="text-lg font-semibold text-white">{walletData?.total_spent || 0}</span>
                </div>
              </div>

              {/* Recent Transactions - Compact */}
              <div className="bg-[#0a0a0f] border border-white/5 rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-white/5">
                  <h3 className="text-xs font-medium text-white/60 uppercase tracking-wide">Transactions</h3>
                </div>
                {transactions.length === 0 ? (
                  <div className="py-6 text-center">
                    <Wallet className="w-6 h-6 text-white/20 mx-auto mb-1" />
                    <p className="text-white/30 text-xs">No transactions yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {transactions.slice(0, 5).map((tx) => (
                      <div key={tx.id} className="px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                            tx.to_user_id === creator.telegram_id ? 'bg-emerald-500/10' : 'bg-white/5'
                          }`}>
                            {tx.to_user_id === creator.telegram_id
                              ? <ArrowDownLeft className="w-3 h-3 text-emerald-500/70" />
                              : <ArrowUpRight className="w-3 h-3 text-white/40" />
                            }
                          </div>
                          <div>
                            <p className="text-white text-xs font-medium capitalize">{tx.type}</p>
                            <p className="text-white/30 text-[10px]">
                              {new Date(tx.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <span className={`text-xs font-medium ${
                          tx.to_user_id === creator.telegram_id ? 'text-emerald-500/80' : 'text-white/50'
                        }`}>
                          {tx.to_user_id === creator.telegram_id ? '+' : '-'}{tx.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Supporters - Compact */}
              {creator.is_creator && (
                <div className="bg-[#0a0a0f] border border-white/5 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-white/5 flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-white/40" />
                    <h3 className="text-xs font-medium text-white/60 uppercase tracking-wide">Supporters</h3>
                  </div>
                  {transactions.filter(tx => tx.to_user_id === creator.telegram_id).length === 0 ? (
                    <div className="py-5 text-center">
                      <p className="text-white/30 text-xs">No supporters yet</p>
                    </div>
                  ) : (
                    <div className="px-3 py-2">
                      <p className="text-white/50 text-xs">
                        {transactions.filter(tx => tx.to_user_id === creator.telegram_id && tx.type === 'subscription').length} subscribers, {' '}
                        {transactions.filter(tx => tx.to_user_id === creator.telegram_id && tx.type === 'tip').length} tips
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        )}

        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <div className="p-3 relative">
            {/* Premium Star Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute top-6 left-10 w-1 h-1 bg-purple-400/30 rounded-full animate-pulse" />
              <div className="absolute top-16 right-8 w-0.5 h-0.5 bg-pink-300/25 rounded-full" />
              <div className="absolute top-28 left-6 w-0.5 h-0.5 bg-white/15 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }} />
              <div className="absolute top-40 right-16 w-1 h-1 bg-purple-400/20 rounded-full" />
              <div className="absolute top-52 left-20 w-0.5 h-0.5 bg-pink-300/30 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
            </div>

            {/* Locked Stats Premium Feature - Compact */}
            <div className="relative overflow-hidden rounded-xl bg-[#0a0a0f] border border-white/5">
              {/* Blurred Background Preview */}
              <div className="absolute inset-0 opacity-20 blur-sm">
                <div className="p-3 space-y-2">
                  <div className="h-20 bg-white/10 rounded-lg" />
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="h-12 bg-white/10 rounded" />
                    <div className="h-12 bg-white/10 rounded" />
                    <div className="h-12 bg-white/10 rounded" />
                  </div>
                </div>
              </div>

              {/* Lock Overlay */}
              <div className="relative z-10 flex flex-col items-center justify-center py-6 px-4">
                <div className="w-10 h-10 rounded-full bg-white/10 border border-white/10 flex items-center justify-center mb-3">
                  <Lock className="w-5 h-5 text-white/70" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1">Pro Analytics</h3>
                <p className="text-white/40 text-xs text-center mb-4 max-w-[240px]">
                  Unlock insights about views, reach, and audience
                </p>

                {/* Features Preview - Compact */}
                <div className="grid grid-cols-3 gap-3 mb-4 w-full max-w-[260px]">
                  <div className="text-center">
                    <Eye className="w-4 h-4 text-white/30 mx-auto mb-0.5" />
                    <span className="text-white/30 text-[10px]">Views</span>
                  </div>
                  <div className="text-center">
                    <TrendingUp className="w-4 h-4 text-white/30 mx-auto mb-0.5" />
                    <span className="text-white/30 text-[10px]">Reach</span>
                  </div>
                  <div className="text-center">
                    <Users className="w-4 h-4 text-white/30 mx-auto mb-0.5" />
                    <span className="text-white/30 text-[10px]">Audience</span>
                  </div>
                </div>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-lg border border-white/5 flex items-center gap-1.5 transition-colors"
                >
                  <Star className="w-3.5 h-3.5 text-yellow-500/70" />
                  <span>Upgrade to Pro</span>
                </motion.button>

                <p className="text-white/25 text-[10px] mt-2">99 Stars/month</p>
              </div>
            </div>
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
              <div className="p-2 text-center">
                <div className="w-20 h-20 mx-auto rounded-full p-1 border-2 border-purple-500 mb-4">
                  <img
                    src={creator.avatar_url || 'https://i.pravatar.cc/150?u=' + creator.telegram_id}
                    alt={creator.first_name}
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
                <h3 className="text-xl font-bold mb-1 text-white">Subscribe to {creator.first_name}</h3>
                <p className="text-white/50 text-sm mb-6">Unlock exclusive posts and more</p>

                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-3 text-sm text-left text-white/80">
                    <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Full access to exclusive content</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-left text-white/80">
                    <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Direct messaging</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-left text-white/80">
                    <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                    <span>Support the creator directly</span>
                  </div>
                </div>

                {subscriptionError && (
                  <p className="text-red-500 text-sm mb-4">{subscriptionError}</p>
                )}

                <button
                  className="w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-bold rounded-xl disabled:opacity-50"
                  onClick={handleSubscribe}
                  disabled={subscribing || ((creator.subscription_price || 0) > 0 && currentUser.balance < (creator.subscription_price || 0))}
                >
                  {subscribing ? 'Processing...' : `Subscribe for ${creator.subscription_price || 'Free'} Stars`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Purchase Modal - Telegram Stars */}
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
              initial={{ scale: 0.9, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 30, opacity: 0 }}
              transition={{ type: "spring", duration: 0.5 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Unlock Content</h3>
                <button onClick={() => !purchasing && setSelectedPost(null)} className="p-1 rounded-full hover:bg-white/10 transition-colors">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="text-center mb-8 relative">
                <div className="absolute inset-0 bg-yellow-500/20 blur-3xl rounded-full" />
                <div className="relative w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <Star className="w-10 h-10 text-white fill-white" />
                </div>
                <p className="text-gray-400 text-sm font-medium mb-2">Pay with Telegram Stars</p>
                <div className="flex items-center justify-center gap-2">
                  <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                  <span className="text-4xl font-bold text-white tracking-tight">{Math.ceil(selectedPost.unlock_price)}</span>
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
                    <p className="text-white font-medium">{creator.first_name || creator.username}</p>
                    <p className="text-gray-500 text-sm">Creator receives 85%</p>
                  </div>
                </div>
              </div>

              <motion.button
                className="w-full py-4 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2 shadow-lg transition-all bg-gradient-to-r from-yellow-400 to-orange-500 text-black"
                whileHover={{ scale: 1.02, y: -1 }}
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

              <p className="text-center text-gray-500 text-xs mt-4">
                Payment powered by Telegram Stars
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tip Modal - Telegram Stars */}
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
              initial={{ scale: 0.9, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 30, opacity: 0 }}
              transition={{ type: "spring", duration: 0.5 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">Send a Tip</h3>
                <button onClick={() => !tipping && setShowTipModal(false)} className="p-1 rounded-full hover:bg-white/10 transition-colors">
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              <div className="text-center mb-6 relative">
                <div className="absolute inset-0 bg-yellow-500/20 blur-3xl rounded-full" />
                <div className="relative w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <Gift className="w-8 h-8 text-white" />
                </div>
                <p className="text-gray-400 text-sm">Show your support to {creator.first_name}</p>
              </div>

              {/* Amount Selection */}
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

              {/* Custom Amount Input */}
              <div className="relative mb-4">
                <Star className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-yellow-400 fill-yellow-400" />
                <input
                  type="number"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400"
                  placeholder="Enter amount"
                  min="1"
                />
              </div>

              {/* Optional Message */}
              <input
                type="text"
                value={tipMessage}
                onChange={(e) => setTipMessage(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-yellow-400 mb-6"
                placeholder="Add a message (optional)"
                maxLength={100}
              />

              <motion.button
                className="w-full py-4 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2 shadow-lg transition-all bg-gradient-to-r from-yellow-400 to-orange-500 text-black"
                whileHover={{ scale: 1.02, y: -1 }}
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
    </div>
  )
}

// Video detection regex
const VIDEO_REGEX = /\.(mp4|webm|mov|m4v)(\?|$)/i

function isVideoPost(post: Post): boolean {
  if (post.media_type === 'video') return true
  if (!post.media_url) return false
  return VIDEO_REGEX.test(post.media_url)
}

// Media tile component with error handling, loading state, and indicators
function CreatorMediaTile({ post }: { post: Post }) {
  const [imageError, setImageError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const displayUrl = post.media_thumbnail || post.media_url

  // Text-only post (no media)
  if (!post.media_url) {
    return (
      <div className={`w-full h-full flex items-center justify-center bg-white/5 p-3 ${!post.can_view ? 'blur-sm' : ''}`}>
        <p className="text-[10px] text-white/70 text-center line-clamp-4">{post.content}</p>
      </div>
    )
  }

  // Image failed to load - show error state
  if (imageError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white/5">
        <div className="text-center">
          <ImageIcon className="w-6 h-6 text-white/30 mx-auto mb-1" />
          <p className="text-[9px] text-white/30">Failed to load</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative">
      {/* Skeleton loader while loading */}
      {!imageLoaded && (
        <div className="absolute inset-0 bg-white/5 animate-pulse" />
      )}

      <img
        src={displayUrl || post.media_url}
        alt=""
        className={`w-full h-full object-cover transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'} ${!post.can_view ? 'blur-md scale-110' : ''}`}
        loading="lazy"
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageError(true)}
      />

      {/* Video indicator */}
      {imageLoaded && isVideoPost(post) && (
        <>
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/20 to-transparent" />
          <div className="absolute top-1 right-1 bg-black/60 rounded-full p-1">
            <Video className="w-3.5 h-3.5 text-white" />
          </div>
        </>
      )}

      {/* Multiple images indicator */}
      {imageLoaded && !isVideoPost(post) && post.media_urls && post.media_urls.length > 1 && (
        <div className="absolute top-1 right-1 bg-black/60 rounded-full px-1.5 py-0.5">
          <span className="text-[9px] text-white font-medium">{post.media_urls.length}</span>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Grid, Bookmark, Clock, CheckCircle, Lock, Plus, Settings, Camera, Image, Video, X, Wallet, BarChart3, Star, ArrowUpRight, ArrowDownLeft, Users, Eye, TrendingUp } from 'lucide-react'
import { type User, type Post, getCreatorPosts, getSavedPosts, subscribeToFollowerChanges } from '../lib/api'
import { getWallet, getTransactions, type Wallet as WalletType, type Transaction } from '../lib/paymentsApi'
import PostDetail from '../components/PostDetail'
import { useInViewport } from '../hooks/useInViewport'
import { usePrefetchMedia } from '../hooks/usePrefetchMedia'
import { useConnectionQuality } from '../hooks/useConnectionQuality'
import { useTranslation } from 'react-i18next'
import { uploadAvatar, uploadStoryMedia } from '../lib/storage'
import { createStory } from '../lib/storyApi'
import { updateProfile } from '../lib/settingsApi'

interface ProfilePageProps {
  user: User & { application_status?: string }
  setUser: (user: User) => void
  onBecomeCreator: () => void
  onSettingsClick: () => void
}

export default function ProfilePage({ user, setUser, onBecomeCreator, onSettingsClick }: ProfilePageProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'posts' | 'saved' | 'wallet' | 'stats'>('posts')
  const [posts, setPosts] = useState<Post[]>([])
  const [savedPosts, setSavedPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [showActionMenu, setShowActionMenu] = useState(false)
  const [walletData, setWalletData] = useState<WalletType | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [walletLoading, setWalletLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const storyInputRef = useRef<HTMLInputElement>(null)
  const [uploadingStory, setUploadingStory] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  useEffect(() => {
    loadData()
  }, [user.telegram_id])

  // Subscribe to realtime follower changes for own profile
  useEffect(() => {
    const unsubscribe = subscribeToFollowerChanges(user.telegram_id, {
      onNewFollower: () => {
        // Someone followed us - update local user state
        setUser({ ...user, followers_count: (user.followers_count || 0) + 1 })
      },
      onUnfollow: () => {
        // Someone unfollowed us - update local user state
        setUser({ ...user, followers_count: Math.max(0, (user.followers_count || 0) - 1) })
      }
    })

    return () => unsubscribe()
  }, [user.telegram_id, user.followers_count, setUser])

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
        getWallet(user.telegram_id),
        getTransactions(user.telegram_id)
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
    // Always load user's posts (works for both creators and regular users)
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

  const handleShareProfile = async () => {
    const link = `${window.location.origin}/profile/${user.username || user.telegram_id}`
    try {
      if (navigator.share) {
        await navigator.share({ url: link, title: user.username || t('profile.title') })
        return
      }
    } catch {
      // fall back to clipboard
    }
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

    // Story upload
    void (async () => {
      setUploadingStory(true)
      const uploadResult = await uploadStoryMedia(file, user.telegram_id)
      if (uploadResult.error || !uploadResult.url) {
        alert(t('profile.upload.error'))
      } else {
        const mediaType = file.type.startsWith('video/') ? 'video' : 'image'
        const { error } = await createStory(user.telegram_id, uploadResult.url, mediaType)
        if (error) {
          console.error('[Stories] insert error', error)
          alert(t('profile.upload.error'))
        } else {
          alert(t('profile.upload.storySuccess'))
        }
      }
      setUploadingStory(false)
      e.target.value = ''
    })()
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
              <div className="font-semibold text-white">{t('profile.application.pendingTitle')}</div>
              <div className="text-sm text-yellow-100/80">{t('profile.application.pendingDesc')}</div>
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
              <div className="font-semibold text-white">{t('profile.application.approvedTitle')}</div>
              <div className="text-sm text-emerald-100/80">{t('profile.application.approvedDesc')}</div>
            </div>
          </div>
        </div>
      )
    }

    if (status === 'rejected') {
      return (
        <div className="mt-4">
          <div className="p-4 bg-red-500/10 border border-red-500/25 rounded-xl mb-3">
            <div className="font-semibold text-white">{t('profile.application.rejectedTitle')}</div>
            <div className="text-sm text-red-100/80">{t('profile.application.rejectedDesc')}</div>
          </div>
          <motion.button 
            className="w-full py-2 bg-white/10 text-white font-bold rounded-lg text-sm border border-white/10" 
            whileTap={{ scale: 0.98 }}
            onClick={onBecomeCreator}
          >
            {t('profile.application.reapply')}
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
        {t('profile.application.becomeCreator')}
      </motion.button>
    )
  }

  return (
    <div className="bg-[#050505] min-h-screen text-white pb-20 relative">

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
              <span className="text-[12px] text-white/60">{t('profile.stats.posts')}</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-semibold text-[18px] leading-tight text-white">{user.followers_count}</span>
              <span className="text-[12px] text-white/60">{t('profile.stats.followers')}</span>
            </div>
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-semibold text-[18px] leading-tight text-white">{user.following_count || 0}</span>
              <span className="text-[12px] text-white/60">{t('profile.stats.following')}</span>
            </div>
          </div>
        </div>

        {/* Bio Section */}
        <div className="mb-5 relative z-10">
          <div className="font-bold text-sm mb-0.5 text-white flex items-center gap-2">
            {user.first_name} {user.last_name}
          </div>
          {user.is_creator && <div className="text-xs text-blue-300 mb-1">{t('profile.creatorTag')}</div>}
          <div className="text-sm whitespace-pre-wrap leading-snug text-white/80">
            {user.bio || t('profile.noBio')}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mb-5 relative z-10">
          <button
            className="flex-1 bg-white/10 hover:bg-white/15 text-sm font-semibold py-2 rounded-lg transition-colors text-white border border-white/10"
            onClick={onSettingsClick}
          >
            {t('profile.actions.editProfile')}
          </button>
          <button
            className="flex-1 bg-white/10 hover:bg-white/15 text-sm font-semibold py-2 rounded-lg transition-colors text-white border border-white/10"
            onClick={handleShareProfile}
          >
            {t('profile.actions.shareProfile')}
          </button>
          <button
            className="bg-white/10 hover:bg-white/15 p-2 rounded-lg transition-colors text-white border border-white/10"
            onClick={onSettingsClick}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {getApplicationStatusUI()}
      </div>

      {/* Tabs - NOT sticky, just normal flow */}
      <div className="flex border-t border-white/5 bg-[#080808]">
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

      {/* Content Grid */}
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
              <h3 className="font-bold text-lg mb-2">{t('profile.posts.emptyTitle')}</h3>
              <p className="text-sm text-white/60">{t('profile.posts.emptySubtitle')}</p>
              {user.is_creator && (
                 <button className="text-blue-400 font-semibold text-sm mt-4">{t('profile.posts.emptyCta')}</button>
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
        )}

        {/* Saved Tab */}
        {activeTab === 'saved' && (
          loading ? (
            <div className="grid grid-cols-3 gap-[2px] px-[2px]">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="aspect-square bg-white/5 animate-pulse rounded-sm" />
              ))}
            </div>
          ) : savedPosts.length === 0 ? (
            <div className="py-20 text-center text-white">
              <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center mx-auto mb-4 bg-white/5">
                 <Bookmark className="w-7 h-7 text-white/70" />
              </div>
              <h3 className="font-bold text-lg mb-2">{t('profile.saved.emptyTitle')}</h3>
              <p className="text-sm text-white/60 max-w-xs mx-auto">{t('profile.saved.emptySubtitle')}</p>
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

        {/* Wallet Tab */}
        {activeTab === 'wallet' && (
          walletLoading ? (
            <div className="p-4 space-y-4">
              <div className="h-32 bg-white/5 animate-pulse rounded-xl" />
              <div className="h-20 bg-white/5 animate-pulse rounded-xl" />
              <div className="h-20 bg-white/5 animate-pulse rounded-xl" />
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
                  <span className="text-white/50 text-xs font-medium uppercase tracking-wide">{t('profile.wallet.balance')}</span>
                  <Star className="w-4 h-4 text-yellow-500/70" />
                </div>
                <div className="flex items-baseline gap-1.5 mb-3">
                  <span className="text-3xl font-bold text-white">{walletData?.stars_balance || 0}</span>
                  <span className="text-white/40 text-sm">{t('profile.wallet.stars')}</span>
                </div>
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-2 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-lg border border-white/5 transition-colors"
                >
                  {t('profile.wallet.cashOut')}
                </motion.button>
              </div>

              {/* Stats Grid - Smaller */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#0a0a0f] border border-white/5 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ArrowDownLeft className="w-3 h-3 text-emerald-500/70" />
                    <span className="text-white/40 text-[10px] uppercase tracking-wide">{t('profile.wallet.earned')}</span>
                  </div>
                  <span className="text-lg font-semibold text-white">{walletData?.total_earned || 0}</span>
                </div>
                <div className="bg-[#0a0a0f] border border-white/5 rounded-lg p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <ArrowUpRight className="w-3 h-3 text-white/40" />
                    <span className="text-white/40 text-[10px] uppercase tracking-wide">{t('profile.wallet.spent')}</span>
                  </div>
                  <span className="text-lg font-semibold text-white">{walletData?.total_spent || 0}</span>
                </div>
              </div>

              {/* Recent Transactions - Compact */}
              <div className="bg-[#0a0a0f] border border-white/5 rounded-xl overflow-hidden">
                <div className="px-3 py-2 border-b border-white/5">
                  <h3 className="text-xs font-medium text-white/60 uppercase tracking-wide">{t('profile.wallet.transactions')}</h3>
                </div>
                {transactions.length === 0 ? (
                  <div className="py-6 text-center">
                    <Wallet className="w-6 h-6 text-white/20 mx-auto mb-1" />
                    <p className="text-white/30 text-xs">{t('profile.wallet.noTransactions')}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {transactions.slice(0, 5).map((tx) => (
                      <div key={tx.id} className="px-3 py-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                            tx.to_user_id === user.telegram_id ? 'bg-emerald-500/10' : 'bg-white/5'
                          }`}>
                            {tx.to_user_id === user.telegram_id
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
                          tx.to_user_id === user.telegram_id ? 'text-emerald-500/80' : 'text-white/50'
                        }`}>
                          {tx.to_user_id === user.telegram_id ? '+' : '-'}{tx.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Supporters - Compact */}
              {user.is_creator && (
                <div className="bg-[#0a0a0f] border border-white/5 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-white/5 flex items-center gap-1.5">
                    <Users className="w-3 h-3 text-white/40" />
                    <h3 className="text-xs font-medium text-white/60 uppercase tracking-wide">{t('profile.wallet.supporters')}</h3>
                  </div>
                  {transactions.filter(tx => tx.to_user_id === user.telegram_id).length === 0 ? (
                    <div className="py-5 text-center">
                      <p className="text-white/30 text-xs">{t('profile.wallet.noSupporters')}</p>
                    </div>
                  ) : (
                    <div className="px-3 py-2">
                      <p className="text-white/50 text-xs">
                        {transactions.filter(tx => tx.to_user_id === user.telegram_id && tx.type === 'subscription').length} {t('profile.wallet.subscribersLabel')}, {' '}
                        {transactions.filter(tx => tx.to_user_id === user.telegram_id && tx.type === 'tip').length} {t('profile.wallet.tipsLabel')}
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
                <h3 className="text-base font-semibold text-white mb-1">{t('profile.stats.proTitle')}</h3>
                <p className="text-white/40 text-xs text-center mb-4 max-w-[240px]">
                  {t('profile.stats.proSubtitle')}
                </p>

                {/* Features Preview - Compact */}
                <div className="grid grid-cols-3 gap-3 mb-4 w-full max-w-[260px]">
                  <div className="text-center">
                    <Eye className="w-4 h-4 text-white/30 mx-auto mb-0.5" />
                    <span className="text-white/30 text-[10px]">{t('profile.stats.views')}</span>
                  </div>
                  <div className="text-center">
                    <TrendingUp className="w-4 h-4 text-white/30 mx-auto mb-0.5" />
                    <span className="text-white/30 text-[10px]">{t('profile.stats.reach')}</span>
                  </div>
                  <div className="text-center">
                    <Users className="w-4 h-4 text-white/30 mx-auto mb-0.5" />
                    <span className="text-white/30 text-[10px]">{t('profile.stats.audience')}</span>
                  </div>
                </div>

                <motion.button
                  whileTap={{ scale: 0.98 }}
                  className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-lg border border-white/5 flex items-center gap-1.5 transition-colors"
                >
                  <Star className="w-3.5 h-3.5 text-yellow-500/70" />
                  <span>{t('profile.stats.upgrade')}</span>
                </motion.button>

                <p className="text-white/25 text-[10px] mt-2">{t('profile.stats.price')}</p>
              </div>
            </div>
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
                <span className="text-lg font-bold">{t('profile.upload.sheetTitle')}</span>
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
                  disabled={uploadingAvatar}
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-pink-500 to-orange-400 rounded-full flex items-center justify-center shadow-lg shadow-pink-500/20">
                    <Camera className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-white">
                      {uploadingAvatar ? t('profile.upload.uploading') : t('profile.upload.profileImage')}
                    </div>
                    <div className="text-sm text-white/60">{t('profile.upload.profileImageDesc')}</div>
                  </div>
                </motion.button>

                {/* Add Story */}
                <motion.button
                  whileTap={{ scale: 0.98, backgroundColor: '#f3f4f6' }}
                  onClick={handleStoryUpload}
                  className="w-full flex items-center gap-4 px-4 py-4 active:bg-white/5 transition-colors"
                  disabled={uploadingStory}
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-purple-500/25">
                    <Plus className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-white">
                      {uploadingStory ? t('profile.upload.uploading') : t('profile.upload.addStory')}
                    </div>
                    <div className="text-sm text-white/60">{t('profile.upload.addStoryDesc')}</div>
                  </div>
                </motion.button>

                {/* Upload Story Image */}
                <motion.button
                  whileTap={{ scale: 0.98, backgroundColor: '#f3f4f6' }}
                  onClick={handleStoryUpload}
                  className="w-full flex items-center gap-4 px-4 py-4 active:bg-white/5 transition-colors"
                  disabled={uploadingStory}
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-teal-400 rounded-full flex items-center justify-center shadow-lg shadow-green-500/20">
                    <Image className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-white">
                      {uploadingStory ? t('profile.upload.uploading') : t('profile.upload.storyImage')}
                    </div>
                    <div className="text-sm text-white/60">{t('profile.upload.storyImageDesc')}</div>
                  </div>
                </motion.button>

                {/* Upload Story Video */}
                <motion.button
                  whileTap={{ scale: 0.98, backgroundColor: '#f3f4f6' }}
                  onClick={handleStoryUpload}
                  className="w-full flex items-center gap-4 px-4 py-4 active:bg-white/5 transition-colors"
                  disabled={uploadingStory}
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg shadow-red-500/20">
                    <Video className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-white">
                      {uploadingStory ? t('profile.upload.uploading') : t('profile.upload.storyVideo')}
                    </div>
                    <div className="text-sm text-white/60">{t('profile.upload.storyVideoDesc')}</div>
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
                  {t('profile.upload.cancel')}
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
  const [imageError, setImageError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const isVisible = useInViewport(containerRef, { minimumRatio: 0.25 })
  const displayUrl = post.media_thumbnail || post.media_url
  const { isDataSaver } = useConnectionQuality()
  usePrefetchMedia(isDataSaver ? null : displayUrl)

  useEffect(() => {
    if (isVisible) setShouldLoad(true)
  }, [isVisible])

  // Text-only post (no media)
  if (!post.media_url) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-white/5 p-3">
        <p className="text-[11px] text-white/70 text-center line-clamp-4">{post.content}</p>
      </div>
    )
  }

  // Image failed to load - show error state
  if (imageError) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-white/5">
        <div className="text-center">
          <Image className="w-6 h-6 text-white/30 mx-auto mb-1" />
          <p className="text-[9px] text-white/30">Failed to load</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full h-full relative">
      {/* Skeleton loader while loading */}
      {(!shouldLoad || !imageLoaded) && (
        <div className="absolute inset-0 bg-white/5 animate-pulse" />
      )}

      {shouldLoad && (
        <>
          {isVideoPost(post) ? (
            <>
              <img
                src={displayUrl || post.media_url}
                alt=""
                className={`w-full h-full object-cover transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                loading="lazy"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
              {imageLoaded && (
                <>
                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/20 to-transparent" />
                  <div className="absolute top-1 right-1 bg-black/60 rounded-full p-1">
                    <Video className="w-3.5 h-3.5 text-white" />
                  </div>
                </>
              )}
            </>
          ) : (
            <img
              src={displayUrl || post.media_url}
              alt=""
              className={`w-full h-full object-cover transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          )}

          {/* Multiple images indicator */}
          {imageLoaded && post.media_urls && post.media_urls.length > 1 && (
            <div className="absolute top-1 right-1 bg-black/60 rounded-full px-1.5 py-0.5">
              <span className="text-[9px] text-white font-medium">{post.media_urls.length}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

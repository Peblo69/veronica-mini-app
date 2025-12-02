import { useState, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, MessageCircle, Bookmark, Share2, MoreHorizontal, CheckCircle, Lock, Eye, DollarSign, AlertTriangle, X, Radio, Users, Trash2, EyeOff, Edit3, Flag, Copy, UserX } from 'lucide-react'
import { getFeed, getSuggestedCreators, likePost, unlikePost, savePost, unsavePost, purchaseContent, deletePost, type User, type Post } from '../lib/api'
import { getLivestreams, type Livestream } from '../lib/livestreamApi'
import PostDetail from '../components/PostDetail'
import { reportPost } from '../lib/reportApi'
import { blockUser } from '../lib/settingsApi'

interface HomePageProps {
  user: User
  onCreatorClick: (creator: any) => void
  onLivestreamClick?: (livestreamId: string) => void
  onGoLive?: () => void
  scrollElement?: HTMLElement | null
}

export default function HomePage({ user, onCreatorClick, onLivestreamClick, onGoLive, scrollElement }: HomePageProps) {
  const [posts, setPosts] = useState<Post[]>([])
  const [suggestions, setSuggestions] = useState<User[]>([])
  const [livestreams, setLivestreams] = useState<Livestream[]>([])
  const [loading, setLoading] = useState(true)
  const [purchaseModal, setPurchaseModal] = useState<Post | null>(null)
  const [purchasing, setPurchasing] = useState(false)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [postMenuOpen, setPostMenuOpen] = useState<number | null>(null)
  const defaultScrollElement = typeof document !== 'undefined' ? (document.querySelector('main') as HTMLElement | null) || document.documentElement : null
  const fallbackScrollElement = defaultScrollElement ?? (typeof document !== 'undefined' ? document.documentElement : null)
  const feedVirtualizer = useVirtualizer({
    count: posts.length,
    getScrollElement: () => (scrollElement ?? fallbackScrollElement)!,
    estimateSize: () => 620,
    overscan: 4,
    measureElement: element => element?.getBoundingClientRect().height || 0,
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [feedPosts, suggestedCreators, liveStreams] = await Promise.all([
      getFeed(user.telegram_id),
      getSuggestedCreators(6),
      getLivestreams()
    ])
    setPosts(feedPosts)
    setSuggestions(suggestedCreators)
    setLivestreams(liveStreams)
    setLoading(false)
  }

  const handleLike = async (post: Post) => {
    if (!post.can_view) return
    if (post.liked) {
      await unlikePost(user.telegram_id, post.id)
      setPosts(posts.map(p => p.id === post.id ? { ...p, liked: false, likes_count: Math.max(0, (p.likes_count || 0) - 1) } : p))
    } else {
      await likePost(user.telegram_id, post.id)
      setPosts(posts.map(p => p.id === post.id ? { ...p, liked: true, likes_count: (p.likes_count || 0) + 1 } : p))
    }
  }

  const handleSave = async (post: Post) => {
    if (post.saved) {
      await unsavePost(user.telegram_id, post.id)
      setPosts(posts.map(p => p.id === post.id ? { ...p, saved: false } : p))
    } else {
      await savePost(user.telegram_id, post.id)
      setPosts(posts.map(p => p.id === post.id ? { ...p, saved: true } : p))
    }
  }

  const handlePurchase = async (post: Post) => {
    setPurchasing(true)
    const result = await purchaseContent(user.telegram_id, post.id, post.unlock_price)
    setPurchasing(false)

    if (result.success) {
      setPosts(posts.map(p => p.id === post.id ? { ...p, can_view: true, is_purchased: true } : p))
      setPurchaseModal(null)
    } else {
      alert(result.error || 'Purchase failed')
    }
  }

  const handlePostDeleted = () => {
    if (selectedPost) {
      setPosts(posts.filter(p => p.id !== selectedPost.id))
      setSelectedPost(null)
    }
  }

  const handlePostUpdated = (updatedPost: Post) => {
    setPosts(posts.map(p => p.id === updatedPost.id ? updatedPost : p))
  }

  const handleDeletePost = async (post: Post) => {
    if (!window.confirm('Are you sure you want to delete this post?')) return
    
    const result = await deletePost(post.id, post.creator_id)
    if (result.success) {
      setPosts(posts.filter(p => p.id !== post.id))
    } else {
      alert('Failed to delete post')
    }
    setPostMenuOpen(null)
  }

  const handleHidePost = (post: Post) => {
    // Hide from local feed (doesn't delete from database)
    setPosts(posts.filter(p => p.id !== post.id))
    setPostMenuOpen(null)
  }

  const handleReportPost = async (post: Post) => {
    const reason = window.prompt('Let us know why you are reporting this post:', 'Inappropriate content')
    const trimmedReason = reason?.trim()
    if (!trimmedReason) {
      setPostMenuOpen(null)
      return
    }

    const description = window.prompt('Add any additional details (optional):')?.trim()
    const result = await reportPost(user.telegram_id, post.id, trimmedReason, description || undefined)

    if (result.success) {
      alert('Post reported. Thank you for helping keep the community safe.')
    } else {
      alert(`Unable to submit report: ${result.error || 'Please try again later.'}`)
    }
    setPostMenuOpen(null)
  }

  const handleCopyLink = (post: Post) => {
    const link = `${window.location.origin}/post/${post.id}`
    navigator.clipboard.writeText(link)
    alert('Link copied to clipboard!')
    setPostMenuOpen(null)
  }

  const handleBlockUser = async (post: Post) => {
    if (!window.confirm(`Block @${post.creator?.username || 'this user'}? You won't see their content anymore.`)) {
      return
    }

    const success = await blockUser(user.telegram_id, post.creator_id)

    if (success) {
      setPosts(prev => prev.filter(p => p.creator_id !== post.creator_id))
      setSuggestions(prev => prev.filter(creator => creator.telegram_id !== post.creator_id))
      alert('User blocked successfully.')
    } else {
      alert('Failed to block this user. Please try again later.')
    }
    setPostMenuOpen(null)
  }

  const openPostDetail = (post: Post) => {
    if (post.can_view) {
      setSelectedPost(post)
    }
  }

  const formatTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return 'Just now'
    if (hours < 24) return hours + 'h'
    return Math.floor(hours / 24) + 'd'
  }

  const getVisibilityBadge = (post: Post) => {
    if (post.is_nsfw) {
      return (
        <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-xs rounded-full flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          NSFW
        </span>
      )
    }
    if (post.visibility === 'subscribers') {
      return (
        <span className="px-2 py-0.5 bg-purple-100 text-purple-600 text-xs rounded-full flex items-center gap-1">
          <Lock className="w-3 h-3" />
          Exclusive
        </span>
      )
    }
    if (post.visibility === 'followers') {
      return (
        <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded-full flex items-center gap-1">
          <Eye className="w-3 h-3" />
          Followers
        </span>
      )
    }
    return null
  }

  const renderPostCard = (post: Post, index: number) => (
    <motion.div
      key={post.id}
      className="glass-panel rounded-[2rem] overflow-hidden border-white/60 shadow-sm hover:shadow-md transition-shadow duration-300 mb-6"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.4), type: "spring", damping: 20 }}
    >
      <div className="flex items-center justify-between p-4">
        <button className="flex items-center gap-3 group" onClick={() => post.creator && onCreatorClick(post.creator)}>
          <div className="relative">
            <img
              src={post.creator?.avatar_url || 'https://i.pravatar.cc/150?u=' + post.creator_id}
              alt=""
              loading="lazy"
              className="w-11 h-11 rounded-full object-cover border border-gray-100 group-hover:border-of-blue transition-colors"
            />
            {post.creator?.is_verified && (
              <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-[1px]">
                <CheckCircle className="w-3.5 h-3.5 text-of-blue fill-of-blue" />
              </div>
            )}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1">
              <span className="font-bold text-[15px] text-gray-900 group-hover:text-of-blue transition-colors">{post.creator?.first_name || 'Creator'}</span>
            </div>
            <span className="text-xs text-gray-400 font-medium">@{post.creator?.username || 'creator'} · {formatTime(post.created_at)}</span>
          </div>
        </button>
        <div className="flex items-center gap-2">
          {getVisibilityBadge(post)}
          <div className="relative">
            <button 
              onClick={(e) => {
                e.stopPropagation()
                setPostMenuOpen(postMenuOpen === post.id ? null : post.id)
              }}
              className="p-2 hover:bg-gray-50 rounded-full transition-colors text-gray-400 hover:text-gray-600"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
            <AnimatePresence>
              {postMenuOpen === post.id && (
                <>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-40"
                    onClick={() => setPostMenuOpen(null)}
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                    className="absolute right-0 top-full mt-1 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 min-w-[180px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {Number(post.creator_id) === Number(user.telegram_id) && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedPost(post)
                            setPostMenuOpen(null)
                          }}
                          className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                        >
                          <Edit3 className="w-4 h-4" /> Edit Post
                        </button>
                        <button
                          onClick={() => handleDeletePost(post)}
                          className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 flex items-center gap-3"
                        >
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleCopyLink(post)}
                      className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                    >
                      <Copy className="w-4 h-4" /> Copy Link
                    </button>
                    <button
                      onClick={() => handleHidePost(post)}
                      className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                    >
                      <EyeOff className="w-4 h-4" /> Hide Post
                    </button>
                    {Number(post.creator_id) !== Number(user.telegram_id) && (
                      <>
                        <button
                          onClick={() => handleBlockUser(post)}
                          className="w-full px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
                        >
                          <UserX className="w-4 h-4" /> Block User
                        </button>
                        <button
                          onClick={() => handleReportPost(post)}
                          className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-red-50 flex items-center gap-3"
                        >
                          <Flag className="w-4 h-4" /> Report
                        </button>
                      </>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {post.media_url && post.can_view ? (
        <div className="relative">
          {post.media_url.match(/\.(mp4|webm)$/i) ? (
            <video
              src={post.media_url}
              className="w-full max-h-[520px] object-cover"
              controls
              playsInline
              preload="metadata"
            />
          ) : (
            <img src={post.media_url} alt="" loading="lazy" className="w-full max-h-[520px] object-cover" />
          )}
        </div>
      ) : (
        <div className="relative bg-gradient-to-br from-gray-900 to-gray-800 text-white p-10 text-center overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent)]" />
          <div className="relative z-10">
            <div className="w-12 h-12 mx-auto rounded-full bg-white/10 flex items-center justify-center mb-4">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold mb-2">{getLockReason(post)}</h3>
            <p className="text-sm text-white/70 mb-4">Unlock premium content from {post.creator?.first_name || 'this creator'}</p>
            {post.unlock_price > 0 ? (
              <motion.button
                className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full text-sm font-bold text-white shadow-lg shadow-green-500/30 flex items-center gap-2 border border-white/20"
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setPurchaseModal(post)}
              >
                <DollarSign className="w-4 h-4" />
                Unlock for ${post.unlock_price.toFixed(2)}
              </motion.button>
            ) : (
              <motion.button
                className="px-8 py-3 btn-subscribe text-sm font-bold shadow-lg flex items-center gap-2"
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => post.creator && onCreatorClick(post.creator)}
              >
                {post.visibility === 'followers' ? (
                  <><Eye className="w-4 h-4" /> Follow to View</>
                ) : (
                  <><CheckCircle className="w-4 h-4" /> Subscribe to View</>
                )}
              </motion.button>
            )}
          </div>
        </div>
      )}

      {post.content && (
        <div className="px-5 py-4 bg-gray-50/50 border-t border-gray-100">
          <p className="text-sm text-gray-500 italic line-clamp-2">
            {post.content.substring(0, 100)}...
          </p>
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-3 bg-white/40 backdrop-blur-sm">
        <div className="flex items-center gap-6">
          <button
            className={"group flex items-center gap-1.5 transition-colors " + (!post.can_view ? 'opacity-50 cursor-not-allowed' : '')}
            onClick={() => handleLike(post)}
            disabled={!post.can_view}
          >
            <div className={`p-2 rounded-full transition-colors ${post.liked ? 'bg-red-50' : 'group-hover:bg-gray-100'}`}>
              <Heart className={"w-6 h-6 transition-all " + (post.liked ? 'text-red-500 fill-red-500 scale-110' : 'text-gray-600 group-hover:scale-110')} />
            </div>
            <span className={`text-sm font-medium ${post.liked ? 'text-red-500' : 'text-gray-500'}`}>{post.likes_count}</span>
          </button>
          
          <button
            className={"group flex items-center gap-1.5 transition-colors " + (!post.can_view ? 'opacity-50 cursor-not-allowed' : '')}
            disabled={!post.can_view}
            onClick={() => openPostDetail(post)}
          >
            <div className="p-2 rounded-full group-hover:bg-gray-100 transition-colors">
              <MessageCircle className="w-6 h-6 text-gray-600 group-hover:text-of-blue transition-colors" />
            </div>
            <span className="text-sm font-medium text-gray-500 group-hover:text-of-blue">{post.comments_count}</span>
          </button>
          
          <button className="p-2 rounded-full hover:bg-gray-100 transition-colors group">
            <Share2 className="w-6 h-6 text-gray-600 group-hover:text-gray-800" />
          </button>
        </div>
        
        <button 
          onClick={() => handleSave(post)}
          className="p-2 rounded-full hover:bg-gray-100 transition-colors group"
        >
          <Bookmark className={"w-6 h-6 transition-colors " + (post.saved ? 'text-of-blue fill-of-blue' : 'text-gray-600 group-hover:text-gray-800')} />
        </button>
      </div>
    </motion.div>
  )

  const getLockReason = (post: Post) => {
    if (post.unlock_price > 0 && !post.is_purchased) {
      return `Pay $${post.unlock_price.toFixed(2)} to unlock`
    }
    if (post.is_nsfw && !post.is_subscribed) {
      return 'Subscribe to see NSFW content'
    }
    if (post.visibility === 'subscribers' && !post.is_subscribed) {
      return 'Subscribe to see exclusive content'
    }
    if (post.visibility === 'followers' && !post.is_following && !post.is_subscribed) {
      return 'Follow to see this content'
    }
    return 'Content locked'
  }

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        {[1,2,3].map(i => (
          <div key={i} className="card p-4 animate-pulse">
            <div className="flex gap-3 mb-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-16"></div>
              </div>
            </div>
            <div className="h-48 bg-gray-200 rounded-xl"></div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6 p-3 max-w-2xl mx-auto">
      {/* Live Now Section */}
      {(livestreams.length > 0 || user.is_creator) && (
        <div className="glass-panel p-4 rounded-3xl relative overflow-hidden">
          <div className="flex justify-between items-center mb-4 relative z-10">
            <h3 className="text-xs font-bold text-gray-500 flex items-center gap-2 tracking-wider">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.6)]" />
              LIVE NOW
            </h3>
            {user.is_creator && onGoLive && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onGoLive}
                className="px-4 py-1.5 bg-gradient-to-r from-red-500 to-pink-600 text-white text-xs font-bold rounded-full flex items-center gap-1.5 shadow-lg shadow-red-500/30"
              >
                <Radio className="w-3 h-3" />
                Go Live
              </motion.button>
            )}
          </div>
          
          {/* Decorative background blur */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-red-500/10 blur-3xl rounded-full" />
          
          {livestreams.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar px-2">
              {livestreams.map((stream, idx) => (
                <motion.button
                  key={stream.id}
                  className="relative flex flex-col items-center min-w-[72px]"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => onLivestreamClick?.(stream.id)}
                >
                  <div className="relative">
                    <div className="w-[72px] h-[72px] rounded-full p-[3px] bg-gradient-to-r from-red-500 to-pink-500 animate-pulse-slow shadow-lg shadow-red-500/20">
                      <div className="w-full h-full rounded-full p-[2px] bg-white">
                        {stream.thumbnail_url ? (
                           <img src={stream.thumbnail_url} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <img
                            src={stream.creator?.avatar_url || `https://i.pravatar.cc/150?u=${stream.creator_id}`}
                            alt=""
                            className="w-full h-full rounded-full object-cover"
                          />
                        )}
                      </div>
                    </div>
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full border-2 border-white shadow-sm flex items-center gap-0.5">
                       <span>LIVE</span>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-gray-700 mt-2 truncate w-full text-center max-w-[72px]">
                    {stream.creator?.first_name}
                  </span>
                </motion.button>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-sm text-center py-8 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
              No active streams right now
            </p>
          )}
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="py-2">
          <div className="flex items-center justify-between px-2 mb-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Recommended for you</h3>
              <p className="text-xs text-gray-500 font-medium">Creators you might like</p>
            </div>
            <button className="text-xs font-bold text-of-blue bg-blue-50 px-3 py-1.5 rounded-full hover:bg-blue-100 transition-colors">
              See All
            </button>
          </div>
          
          <div className="flex gap-3 overflow-x-auto pb-6 px-2 no-scrollbar snap-x">
            {suggestions.map((creator, idx) => (
              <motion.div
                key={creator.telegram_id}
                className="min-w-[150px] bg-white rounded-[1.5rem] p-4 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col items-center relative group overflow-hidden snap-center cursor-pointer"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                whileHover={{ y: -4 }}
                onClick={() => onCreatorClick(creator)}
              >
                 {/* Premium background decoration */}
                 <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-blue-50/80 to-transparent opacity-50" />
                 <div className="absolute top-[-20px] -right-4 w-12 h-12 bg-gradient-to-br from-of-blue/20 to-purple-500/20 rounded-full blur-xl" />
                 
                 {/* Avatar */}
                 <div className="relative w-16 h-16 mb-3 z-10">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-of-blue to-purple-500 p-[2px] shadow-sm opacity-80 group-hover:opacity-100 transition-opacity">
                      <div className="w-full h-full bg-white rounded-full" />
                    </div>
                    <img 
                      src={creator.avatar_url || `https://i.pravatar.cc/150?u=${creator.telegram_id}`} 
                      className="absolute inset-[2px] w-[calc(100%-4px)] h-[calc(100%-4px)] rounded-full object-cover"
                      alt={creator.first_name}
                    />
                    {creator.is_verified && (
                      <div className="absolute bottom-0 right-0 z-20 bg-white rounded-full p-[2px] shadow-sm ring-1 ring-gray-50">
                        <CheckCircle className="w-3.5 h-3.5 text-of-blue fill-of-blue" />
                      </div>
                    )}
                 </div>

                 {/* Text */}
                 <div className="text-center z-10 mb-4 w-full">
                   <h4 className="font-bold text-[15px] text-gray-900 truncate leading-tight mb-0.5">{creator.first_name}</h4>
                   <p className="text-[11px] text-gray-400 truncate font-medium">@{creator.username}</p>
                 </div>

                 {/* Button */}
                 <motion.button 
                   whileTap={{ scale: 0.95 }}
                   className="w-full py-2 bg-gray-900 text-white text-[11px] font-bold rounded-xl shadow-lg shadow-gray-900/10 group-hover:bg-gradient-to-r group-hover:from-of-blue group-hover:to-blue-600 group-hover:shadow-blue-500/20 transition-all duration-300 z-10"
                 >
                   View Profile
                 </motion.button>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Posts Feed */}
      <div className="space-y-6">
        {posts.length === 0 ? (
          <div className="glass-panel p-12 text-center rounded-3xl">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">Your feed is empty</h3>
            <p className="text-gray-500 text-sm mb-6">Follow some creators to see their exclusive content here.</p>
          </div>
        ) : (
          <div className="relative" style={{ height: feedVirtualizer.getTotalSize() || posts.length * 620 }}>
            {feedVirtualizer.getVirtualItems().map((virtualRow) => (
              <div
                key={virtualRow.key}
                className="absolute left-0 w-full"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                {renderPostCard(posts[virtualRow.index], virtualRow.index)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Purchase Modal */}
      <AnimatePresence>
        {purchaseModal && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPurchaseModal(null)}
          >
            <motion.div
              className="bg-white/90 backdrop-blur-xl rounded-[2rem] p-6 max-w-sm w-full shadow-2xl border border-white/50"
              initial={{ scale: 0.9, y: 30, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 30, opacity: 0 }}
              transition={{ type: "spring", duration: 0.5 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900">Unlock Content</h3>
                <button onClick={() => setPurchaseModal(null)} className="p-1 rounded-full hover:bg-gray-100 transition-colors">
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              <div className="text-center mb-8 relative">
                <div className="absolute inset-0 bg-green-400/20 blur-3xl rounded-full" />
                <div className="relative w-20 h-20 bg-gradient-to-br from-green-100 to-green-50 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner border border-white/50">
                  <DollarSign className="w-10 h-10 text-green-600" />
                </div>
                <p className="text-gray-500 text-sm font-medium mb-1">One-time purchase</p>
                <p className="text-4xl font-bold text-green-600 tracking-tight">${purchaseModal.unlock_price.toFixed(2)}</p>
              </div>

              <div className="bg-gray-50/80 rounded-2xl p-4 mb-6 border border-gray-100">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-500">Your balance</span>
                  <span className="font-bold text-gray-800">{user.balance} tokens</span>
                </div>
                <div className="w-full h-[1px] bg-gray-200 my-2" />
                <div className="flex justify-between text-sm items-center">
                  <span className="text-gray-500">Remaining</span>
                  <span className={`font-bold ${user.balance >= purchaseModal.unlock_price ? 'text-gray-800' : 'text-red-500'}`}>
                    {(user.balance - purchaseModal.unlock_price).toFixed(2)} tokens
                  </span>
                </div>
              </div>

              <motion.button
                className={`w-full py-3.5 rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 shadow-lg transition-all
                  ${user.balance >= purchaseModal.unlock_price 
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-green-500/25' 
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
                whileHover={user.balance >= purchaseModal.unlock_price ? { scale: 1.02, y: -1 } : {}}
                whileTap={user.balance >= purchaseModal.unlock_price ? { scale: 0.98 } : {}}
                onClick={() => handlePurchase(purchaseModal)}
                disabled={purchasing || user.balance < purchaseModal.unlock_price}
              >
                {purchasing ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    {user.balance >= purchaseModal.unlock_price ? 'Confirm Payment' : 'Insufficient Balance'}
                  </>
                )}
              </motion.button>

              {user.balance < purchaseModal.unlock_price && (
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
    </div>
  )
}

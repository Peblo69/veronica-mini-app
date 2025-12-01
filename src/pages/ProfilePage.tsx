import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, Edit, Grid, Bookmark, Share2, Clock, CheckCircle, Lock } from 'lucide-react'
import { type User, type Post, getCreatorPosts, getSavedPosts } from '../lib/api'
import PostDetail from '../components/PostDetail'

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

  useEffect(() => {
    loadData()
  }, [user.telegram_id])

  const loadData = async () => {
    setLoading(true)
    const [userPosts, saved] = await Promise.all([
      user.is_creator ? getCreatorPosts(user.telegram_id, user.telegram_id) : Promise.resolve([]),
      getSavedPosts(user.telegram_id)
    ])
    setPosts(userPosts.map(p => ({ ...p, can_view: true })))
    setSavedPosts(saved.map(p => ({ ...p, can_view: true })))
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
  const getApplicationStatusUI = () => {
    if (user.is_creator) return null

    const status = (user as any).application_status

    if (status === 'pending') {
      return (
        <div className="mt-4 p-4 bg-yellow-50 rounded-xl">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-yellow-600" />
            <div>
              <div className="font-semibold text-yellow-800">Application Pending</div>
              <div className="text-sm text-yellow-600">We're reviewing your application. This usually takes 24-48 hours.</div>
            </div>
          </div>
        </div>
      )
    }

    if (status === 'approved') {
      return (
        <div className="mt-4 p-4 bg-green-50 rounded-xl">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <div>
              <div className="font-semibold text-green-800">Application Approved!</div>
              <div className="text-sm text-green-600">You can now start creating content.</div>
            </div>
          </div>
        </div>
      )
    }

    if (status === 'rejected') {
      return (
        <div className="mt-4">
          <div className="p-4 bg-red-50 rounded-xl mb-3">
            <div className="font-semibold text-red-800">Application Not Approved</div>
            <div className="text-sm text-red-600">Please review our requirements and try again.</div>
          </div>
          <motion.button 
            className="btn-subscribe w-full" 
            whileTap={{ scale: 0.98 }}
            onClick={onBecomeCreator}
          >
            REAPPLY
          </motion.button>
        </div>
      )
    }

    return (
      <motion.button 
        className="btn-subscribe w-full mt-4" 
        whileTap={{ scale: 0.98 }}
        onClick={onBecomeCreator}
      >
        BECOME A CREATOR
      </motion.button>
    )
  }

  return (
    <div className="bg-gray-50 min-h-screen relative overflow-hidden">
      {/* Animated Background Banner */}
      <div className="relative h-48 overflow-hidden">
         <div className="absolute inset-0 bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 animate-gradient bg-[length:200%_200%]" />
         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150"></div>
         <div className="absolute inset-0 bg-gradient-to-b from-transparent to-gray-50/90" />
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
               <img src={user.avatar_url || 'https://i.pravatar.cc/150?u=' + user.telegram_id} alt={user.first_name} className="w-full h-full rounded-full object-cover border-2 border-white" />
            </div>
            <motion.button 
              className="absolute bottom-1 right-1 w-9 h-9 bg-of-blue rounded-full flex items-center justify-center border-[3px] border-white shadow-md"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <Edit className="w-4 h-4 text-white" />
            </motion.button>
          </motion.div>
          <div className="flex gap-3 mb-1">
            <motion.button 
              className="w-11 h-11 rounded-full bg-white/80 backdrop-blur-md border border-white shadow-sm flex items-center justify-center hover:bg-white transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Share2 className="w-5 h-5 text-gray-700" />
            </motion.button>
            <motion.button 
              className="w-11 h-11 rounded-full bg-white/80 backdrop-blur-md border border-white shadow-sm flex items-center justify-center hover:bg-white transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onSettingsClick}
            >
              <Settings className="w-5 h-5 text-gray-700" />
            </motion.button>
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-4 mb-4 relative overflow-hidden">
          <div className="relative z-10">
            <h1 className="text-2xl font-bold text-gray-900">{user.first_name} {user.last_name || ''}</h1>
            <p className="text-gray-500 text-sm font-medium mb-3">@{user.username || 'user'}</p>

            <div className="flex items-center justify-between px-4 py-3 bg-white/50 rounded-2xl mb-4">
              <div className="text-center">
                <div className="font-bold text-lg text-gray-900">{user.posts_count}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Posts</div>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div className="text-center">
                <div className="font-bold text-lg text-gray-900">{user.likes_received}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Likes</div>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div className="text-center">
                <div className="font-bold text-lg text-gray-900">{user.followers_count}</div>
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fans</div>
              </div>
            </div>

            <p className="text-sm text-gray-600 leading-relaxed mb-4 line-clamp-3">{user.bio || 'No bio yet'}</p>

            {getApplicationStatusUI()}
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 mb-6 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100">
          <div>
            <div className="text-xl font-bold text-gray-900 tracking-tight">{user.balance} <span className="text-xs font-medium text-gray-500">TOKENS</span></div>
            <div className="text-[10px] text-blue-600 font-bold uppercase tracking-wide">Available Balance</div>
          </div>
          <motion.button 
            className="px-4 py-2 bg-white text-of-blue text-xs font-bold rounded-xl shadow-sm border border-blue-100"
            whileTap={{ scale: 0.95 }}
          >
            + Top Up
          </motion.button>
        </div>
      </div>

      <div className="bg-white rounded-t-[2.5rem] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] min-h-[50vh] relative z-10">
        <div className="flex justify-center pt-3 pb-1">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
        </div>
        <div className="flex border-b border-gray-100 px-6">
          <button
            className={'flex-1 py-4 flex items-center justify-center gap-2 text-sm font-bold transition-colors relative ' + (activeTab === 'posts' ? 'text-of-blue' : 'text-gray-400')}
            onClick={() => setActiveTab('posts')}
          >
            <Grid className="w-5 h-5" /> Posts
            {activeTab === 'posts' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-of-blue rounded-t-full" />}
          </button>
          <button
            className={'flex-1 py-4 flex items-center justify-center gap-2 text-sm font-bold transition-colors relative ' + (activeTab === 'saved' ? 'text-of-blue' : 'text-gray-400')}
            onClick={() => setActiveTab('saved')}
          >
            <Bookmark className="w-5 h-5" /> Saved
            {activeTab === 'saved' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-of-blue rounded-t-full" />}
          </button>
        </div>

        {/* Content Grid */}
        <div className="p-1 pb-24">
          {loading ? (
            <div className="grid grid-cols-3 gap-1">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="aspect-square bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : activeTab === 'posts' ? (
            posts.length === 0 ? (
              <div className="py-20 text-center">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                   <Grid className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-500 font-medium">{user.is_creator ? 'No posts yet' : 'Become a creator to post'}</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {posts.map((post) => (
                  <motion.div
                    key={post.id}
                    className="relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-gray-100"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedPost(post)}
                  >
                    {post.media_url ? (
                      <img src={post.media_url} alt="" className="w-full h-full object-cover transition-transform duration-500 hover:scale-110" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-3">
                        <p className="text-[10px] text-gray-400 text-center line-clamp-4 leading-tight">{post.content}</p>
                      </div>
                    )}
                    {post.visibility !== 'public' && (
                      <div className="absolute top-1.5 right-1.5 bg-black/30 backdrop-blur-md p-1 rounded-full">
                        <Lock className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )
          ) : (
            savedPosts.length === 0 ? (
              <div className="py-20 text-center">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                   <Bookmark className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-gray-500 font-medium">No saved posts yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {savedPosts.map((post) => (
                  <motion.div
                    key={post.id}
                    className="relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-gray-100"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedPost(post)}
                  >
                    {post.media_url ? (
                      <img src={post.media_url} alt="" className="w-full h-full object-cover transition-transform duration-500 hover:scale-110" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-3">
                         <p className="text-[10px] text-gray-400 text-center line-clamp-4 leading-tight">{post.content}</p>
                      </div>
                    )}
                  </motion.div>
                ))}
              </div>
            )
          )}
        </div>
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
    </div>
  )
}

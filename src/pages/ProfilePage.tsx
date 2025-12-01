import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Grid, Bookmark, Clock, CheckCircle, Lock, Menu, Plus, UserPlus } from 'lucide-react'
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
            className="w-full py-2 bg-gray-900 text-white font-bold rounded-lg text-sm" 
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
        className="w-full py-2 bg-gray-900 text-white font-bold rounded-lg text-sm mt-4" 
        whileTap={{ scale: 0.98 }}
        onClick={onBecomeCreator}
      >
        Become a Creator
      </motion.button>
    )
  }

  return (
    <div className="bg-white min-h-full">
      {/* Top Bar */}
      <div className="sticky top-0 z-50 bg-white border-b border-gray-100 px-4 py-2 flex items-center justify-between safe-area-top">
        <div className="flex items-center gap-1">
          <Plus className="w-7 h-7 text-gray-900" />
        </div>
        <div className="font-bold text-lg flex items-center gap-1">
           {user.username || 'user'} 
           {user.is_verified && <CheckCircle className="w-3.5 h-3.5 text-blue-500 fill-blue-500" />}
        </div>
        <div className="flex items-center gap-4">
          <motion.button whileTap={{ scale: 0.9 }} onClick={onSettingsClick}>
            <Menu className="w-7 h-7 text-gray-900" />
          </motion.button>
        </div>
      </div>

      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-8 mb-4">
          {/* Avatar */}
          <div className="relative shrink-0">
             <div className="w-20 h-20 rounded-full p-[2px] bg-gradient-to-tr from-gray-200 to-gray-100">
               <img 
                 src={user.avatar_url || 'https://i.pravatar.cc/150?u=' + user.telegram_id} 
                 alt={user.first_name} 
                 className="w-full h-full rounded-full object-cover border-2 border-white" 
               />
            </div>
            <div className="absolute bottom-0 right-0 bg-blue-500 rounded-full p-1 border-2 border-white">
              <Plus className="w-3 h-3 text-white" />
            </div>
          </div>

          {/* Stats */}
          <div className="flex-1 flex justify-around items-center">
            <div className="flex flex-col items-center">
              <span className="font-bold text-lg leading-tight">{user.posts_count}</span>
              <span className="text-[13px] text-gray-900">posts</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-bold text-lg leading-tight">{user.followers_count}</span>
              <span className="text-[13px] text-gray-900">followers</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="font-bold text-lg leading-tight">{user.following_count || 0}</span>
              <span className="text-[13px] text-gray-900">following</span>
            </div>
          </div>
        </div>

        {/* Bio Section */}
        <div className="mb-4">
          <div className="font-bold text-sm mb-0.5">{user.first_name} {user.last_name}</div>
          {user.is_creator && <div className="text-xs text-gray-500 mb-1">Digital Creator</div>}
          <div className="text-sm whitespace-pre-wrap leading-snug">
            {user.bio || 'No bio yet.'}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mb-6">
          <button className="flex-1 bg-gray-100 hover:bg-gray-200 text-sm font-semibold py-1.5 rounded-lg transition-colors text-gray-900">
            Edit profile
          </button>
          <button className="flex-1 bg-gray-100 hover:bg-gray-200 text-sm font-semibold py-1.5 rounded-lg transition-colors text-gray-900">
            Share profile
          </button>
          <button className="bg-gray-100 hover:bg-gray-200 p-1.5 rounded-lg transition-colors text-gray-900">
            <UserPlus className="w-5 h-5" />
          </button>
        </div>

        {getApplicationStatusUI()}
        
        {/* Balance Card (Custom Addition kept minimal) */}
        <div className="bg-blue-50 rounded-lg p-3 flex items-center justify-between mb-6">
           <div className="flex flex-col">
             <span className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">Wallet Balance</span>
             <span className="text-lg font-bold text-gray-900">{user.balance} Tokens</span>
           </div>
           <button className="bg-white text-blue-600 px-3 py-1.5 rounded-md text-xs font-bold shadow-sm">
             + Add Funds
           </button>
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
        <button
          className={`flex-1 py-3 flex items-center justify-center border-b-[1px] transition-colors ${activeTab === 'saved' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}
          onClick={() => setActiveTab('saved')}
        >
          <Bookmark className="w-6 h-6" />
        </button>
      </div>

      {/* Content Grid */}
      <div className="pb-24">
        {loading ? (
          <div className="grid grid-cols-3 gap-0.5">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="aspect-square bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : activeTab === 'posts' ? (
          posts.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 rounded-full border-2 border-gray-800 flex items-center justify-center mx-auto mb-4">
                 <Grid className="w-8 h-8 text-gray-800" />
              </div>
              <h3 className="font-bold text-xl mb-2">Profile</h3>
              <p className="text-sm text-gray-500">When you share photos and videos, they'll appear on your profile.</p>
              {user.is_creator && (
                 <button className="text-blue-500 font-semibold text-sm mt-4">Share your first photo</button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5">
              {posts.map((post) => (
                <motion.div
                  key={post.id}
                  className="relative aspect-square cursor-pointer overflow-hidden bg-gray-100"
                  whileTap={{ opacity: 0.9 }}
                  onClick={() => setSelectedPost(post)}
                >
                  {post.media_url ? (
                    <img src={post.media_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gray-50 flex items-center justify-center p-3">
                      <p className="text-[10px] text-gray-500 text-center line-clamp-4">{post.content}</p>
                    </div>
                  )}
                  {post.visibility !== 'public' && (
                    <div className="absolute top-1 right-1">
                      <Lock className="w-3 h-3 text-white drop-shadow-md" />
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )
        ) : (
          savedPosts.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-16 h-16 rounded-full border-2 border-gray-800 flex items-center justify-center mx-auto mb-4">
                 <Bookmark className="w-8 h-8 text-gray-800" />
              </div>
              <h3 className="font-bold text-xl mb-2">Saved</h3>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">Save photos and videos that you want to see again. No one is notified, and only you can see what you've saved.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5">
              {savedPosts.map((post) => (
                <motion.div
                  key={post.id}
                  className="relative aspect-square cursor-pointer overflow-hidden bg-gray-100"
                  whileTap={{ opacity: 0.9 }}
                  onClick={() => setSelectedPost(post)}
                >
                  {post.media_url ? (
                    <img src={post.media_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gray-50 flex items-center justify-center p-3">
                       <p className="text-[10px] text-gray-500 text-center line-clamp-4">{post.content}</p>
                    </div>
                  )}
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
    </div>
  )
}

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Settings, Edit, Grid, Bookmark, Share2, Clock, CheckCircle, Lock } from 'lucide-react'
import { type User, type Post, getCreatorPosts, getSavedPosts } from '../lib/api'
import PostDetail from '../components/PostDetail'

interface ProfilePageProps {
  user: User & { application_status?: string }
  setUser: (user: User) => void
  onBecomeCreator: () => void
}

export default function ProfilePage({ user, setUser, onBecomeCreator }: ProfilePageProps) {
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
    <div className="bg-white min-h-screen">
      <div className="h-28 bg-gradient-to-r from-of-blue to-blue-400" />

      <div className="px-4 -mt-12">
        <div className="flex justify-between items-end">
          <div className="relative">
            <img src={user.avatar_url || 'https://i.pravatar.cc/150?u=' + user.telegram_id} alt={user.first_name} className="w-24 h-24 rounded-full border-4 border-white object-cover shadow-lg" />
            <button className="absolute bottom-0 right-0 w-8 h-8 bg-of-blue rounded-full flex items-center justify-center border-2 border-white">
              <Edit className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="flex gap-2 mb-2">
            <button className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center">
              <Share2 className="w-5 h-5 text-gray-600" />
            </button>
            <button className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center">
              <Settings className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-4 pt-3">
        <h1 className="text-xl font-bold">{user.first_name} {user.last_name || ''}</h1>
        <p className="text-gray-500 text-sm">@{user.username || 'user'}</p>

        <div className="flex items-center gap-6 mt-3 text-sm">
          <div className="text-center">
            <div className="font-bold">{user.posts_count}</div>
            <div className="text-gray-500">Posts</div>
          </div>
          <div className="text-center">
            <div className="font-bold">{user.likes_received}</div>
            <div className="text-gray-500">Likes</div>
          </div>
          <div className="text-center">
            <div className="font-bold">{user.followers_count}</div>
            <div className="text-gray-500">Fans</div>
          </div>
        </div>

        <p className="mt-3 text-sm text-gray-700">{user.bio || 'No bio yet'}</p>

        {getApplicationStatusUI()}

        <div className="mt-4 p-4 bg-gray-50 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-lg">{user.balance}</div>
              <div className="text-sm text-gray-500">Token Balance</div>
            </div>
            <motion.button className="btn-subscribe" whileTap={{ scale: 0.95 }}>
              Buy Tokens
            </motion.button>
          </div>
        </div>
      </div>

      <div className="flex border-b border-gray-200 mt-4">
        <button
          className={'flex-1 py-3 flex items-center justify-center gap-2 text-sm font-semibold ' + (activeTab === 'posts' ? 'tab-active' : 'text-gray-500')}
          onClick={() => setActiveTab('posts')}
        >
          <Grid className="w-4 h-4" /> Posts
        </button>
        <button
          className={'flex-1 py-3 flex items-center justify-center gap-2 text-sm font-semibold ' + (activeTab === 'saved' ? 'tab-active' : 'text-gray-500')}
          onClick={() => setActiveTab('saved')}
        >
          <Bookmark className="w-4 h-4" /> Saved
        </button>
      </div>

      {/* Content Grid */}
      {loading ? (
        <div className="grid grid-cols-3 gap-0.5 p-0.5">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="aspect-square bg-gray-200 animate-pulse" />
          ))}
        </div>
      ) : activeTab === 'posts' ? (
        posts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Grid className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{user.is_creator ? 'No posts yet' : 'Become a creator to post content'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5 p-0.5">
            {posts.map((post) => (
              <motion.div
                key={post.id}
                className="relative aspect-square cursor-pointer"
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedPost(post)}
              >
                {post.media_url ? (
                  <img src={post.media_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center p-2">
                    <p className="text-xs text-gray-500 line-clamp-3">{post.content}</p>
                  </div>
                )}
                {post.visibility !== 'public' && (
                  <div className="absolute top-1 right-1">
                    <Lock className="w-4 h-4 text-white drop-shadow" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )
      ) : (
        savedPosts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Bookmark className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No saved posts yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5 p-0.5">
            {savedPosts.map((post) => (
              <motion.div
                key={post.id}
                className="relative aspect-square cursor-pointer"
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelectedPost(post)}
              >
                {post.media_url ? (
                  <img src={post.media_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center p-2">
                    <p className="text-xs text-gray-500 line-clamp-3">{post.content}</p>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )
      )}

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

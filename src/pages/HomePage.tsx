import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Heart, MessageCircle, Bookmark, Share2, MoreHorizontal, CheckCircle } from 'lucide-react'
import { getFeed, getSuggestedCreators, likePost, unlikePost, type User, type Post } from '../lib/api'

interface HomePageProps {
  user: User
  onCreatorClick: (creator: any) => void
}

export default function HomePage({ user, onCreatorClick }: HomePageProps) {
  const [posts, setPosts] = useState<Post[]>([])
  const [suggestions, setSuggestions] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const [feedPosts, suggestedCreators] = await Promise.all([
      getFeed(user.telegram_id),
      getSuggestedCreators(6)
    ])
    setPosts(feedPosts)
    setSuggestions(suggestedCreators)
    setLoading(false)
  }

  const handleLike = async (post: Post) => {
    if (post.liked) {
      await unlikePost(user.telegram_id, post.id)
      setPosts(posts.map(p => p.id === post.id ? { ...p, liked: false, likes_count: p.likes_count - 1 } : p))
    } else {
      await likePost(user.telegram_id, post.id)
      setPosts(posts.map(p => p.id === post.id ? { ...p, liked: true, likes_count: p.likes_count + 1 } : p))
    }
  }

  const formatTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return 'Just now'
    if (hours < 24) return hours + 'h'
    return Math.floor(hours / 24) + 'd'
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
    <div className="space-y-3 p-3">
      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-gray-500 mb-3">SUGGESTIONS</h3>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {suggestions.map((creator) => (
              <motion.button
                key={creator.telegram_id}
                className="flex flex-col items-center min-w-[70px]"
                whileTap={{ scale: 0.95 }}
                onClick={() => onCreatorClick(creator)}
              >
                <div className="relative">
                  <div className="w-16 h-16 rounded-full p-0.5 bg-gradient-to-br from-of-blue to-blue-400">
                    <img 
                      src={creator.avatar_url || 'https://i.pravatar.cc/150?u=' + creator.telegram_id} 
                      alt={creator.first_name} 
                      className="w-full h-full rounded-full object-cover border-2 border-white" 
                    />
                  </div>
                  {creator.is_verified && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-of-blue rounded-full flex items-center justify-center border-2 border-white">
                      <CheckCircle className="w-3 h-3 text-white fill-white" />
                    </div>
                  )}
                </div>
                <span className="text-xs mt-1 truncate w-full text-center">{creator.first_name}</span>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Posts Feed */}
      {posts.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-500">No posts yet. Follow some creators!</p>
        </div>
      ) : (
        posts.map((post, index) => (
          <motion.div
            key={post.id}
            className="card overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <div className="flex items-center justify-between p-3">
              <button className="flex items-center gap-3" onClick={() => post.creator && onCreatorClick(post.creator)}>
                <img 
                  src={post.creator?.avatar_url || 'https://i.pravatar.cc/150?u=' + post.creator_id} 
                  alt="" 
                  className="w-10 h-10 rounded-full object-cover" 
                />
                <div className="text-left">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-sm">{post.creator?.first_name || 'Creator'}</span>
                    {post.creator?.is_verified && <CheckCircle className="w-4 h-4 text-of-blue fill-of-blue" />}
                  </div>
                  <span className="text-xs text-gray-500">@{post.creator?.username || 'creator'} · {formatTime(post.created_at)}</span>
                </div>
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-full">
                <MoreHorizontal className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {post.content && <p className="px-3 pb-3 text-sm">{post.content}</p>}
            
            {post.media_url && <img src={post.media_url} alt="" className="w-full" />}

            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-4">
                <button className="flex items-center gap-1" onClick={() => handleLike(post)}>
                  <Heart className={"w-6 h-6 " + (post.liked ? 'text-red-500 fill-red-500' : 'text-gray-600')} />
                  <span className="text-sm text-gray-600">{post.likes_count}</span>
                </button>
                <button className="flex items-center gap-1">
                  <MessageCircle className="w-6 h-6 text-gray-600" />
                  <span className="text-sm text-gray-600">{post.comments_count}</span>
                </button>
                <button><Share2 className="w-6 h-6 text-gray-600" /></button>
              </div>
              <button><Bookmark className="w-6 h-6 text-gray-600" /></button>
            </div>
          </motion.div>
        ))
      )}
    </div>
  )
}

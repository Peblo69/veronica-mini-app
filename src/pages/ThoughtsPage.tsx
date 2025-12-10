import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Search, X, Heart, MessageCircle, Repeat2, Share, MoreHorizontal,
  Loader2, Send, Sparkles, TrendingUp, Users, Clock
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { type User, type Post, likePost, unlikePost } from '../lib/api'
import { toast } from '../lib/toast'
import { moderateText } from '../lib/moderation'

interface ThoughtsPageProps {
  user: User
  onBack: () => void
  onViewProfile?: (user: User) => void
}

type FilterType = 'foryou' | 'following' | 'popular' | 'recent'

interface ThoughtWithCreator extends Post {
  creator: User
  reply_count?: number
  repost_count?: number
}

// Format time ago
function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Format count (1.2K, 3.4M, etc.)
function formatCount(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
  return num.toString()
}

export default function ThoughtsPage({ user, onBack, onViewProfile }: ThoughtsPageProps) {
  const [thoughts, setThoughts] = useState<ThoughtWithCreator[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterType>('foryou')
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [searching, setSearching] = useState(false)

  // Composer state
  const [composerText, setComposerText] = useState('')
  const [posting, setPosting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const MAX_LENGTH = 500

  // Load thoughts
  useEffect(() => {
    loadThoughts()
  }, [filter, user.telegram_id])

  const loadThoughts = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('posts')
        .select(`
          *,
          creator:users!posts_creator_id_fkey(*)
        `)
        .eq('post_type', 'thought')
        .is('media_url', null) // Only text-only posts
        .eq('is_hidden', false)
        .order('created_at', { ascending: false })
        .limit(50)

      if (filter === 'following') {
        // Get posts from users the current user follows
        const { data: following } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.telegram_id)

        if (following && following.length > 0) {
          const followingIds = following.map(f => f.following_id)
          query = query.in('creator_id', followingIds)
        } else {
          // No following, show empty
          setThoughts([])
          setLoading(false)
          return
        }
      } else if (filter === 'popular') {
        query = query.order('likes_count', { ascending: false })
      }
      // 'recent' and 'foryou' both use created_at desc

      const { data, error } = await query

      if (error) throw error

      // Get like status for all posts
      const postIds = (data || []).map(p => p.id)
      const { data: likes } = await supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', user.telegram_id)
        .in('post_id', postIds)

      const likedPostIds = new Set((likes || []).map(l => l.post_id))

      const thoughtsWithLikes = (data || []).map(t => ({
        ...t,
        liked: likedPostIds.has(t.id),
        creator: t.creator || {
          telegram_id: t.creator_id,
          first_name: 'User',
          username: 'user'
        }
      }))

      setThoughts(thoughtsWithLikes as ThoughtWithCreator[])
    } catch (err) {
      console.error('Failed to load thoughts:', err)
      toast.error('Failed to load thoughts')
    }
    setLoading(false)
  }

  // Search thoughts
  const searchThoughts = async () => {
    if (!searchQuery.trim()) {
      loadThoughts()
      return
    }

    setSearching(true)
    try {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          creator:users!posts_creator_id_fkey(*)
        `)
        .eq('post_type', 'thought')
        .is('media_url', null)
        .eq('is_hidden', false)
        .ilike('content', `%${searchQuery}%`)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error

      // Get like status
      const postIds = (data || []).map(p => p.id)
      const { data: likes } = await supabase
        .from('likes')
        .select('post_id')
        .eq('user_id', user.telegram_id)
        .in('post_id', postIds)

      const likedPostIds = new Set((likes || []).map(l => l.post_id))

      const results = (data || []).map(t => ({
        ...t,
        liked: likedPostIds.has(t.id),
        creator: t.creator || {
          telegram_id: t.creator_id,
          first_name: 'User',
          username: 'user'
        }
      }))

      setThoughts(results as ThoughtWithCreator[])
    } catch (err) {
      console.error('Search failed:', err)
    }
    setSearching(false)
  }

  // Post a new thought
  const postThought = async () => {
    if (!composerText.trim() || posting) return

    setPosting(true)
    try {
      // Moderate text
      const modResult = await moderateText(composerText)
      if (modResult?.flagged) {
        toast.error('Content flagged by moderation')
        setPosting(false)
        return
      }

      const { data, error } = await supabase
        .from('posts')
        .insert({
          creator_id: user.telegram_id,
          content: composerText.trim(),
          post_type: 'thought',
          visibility: 'public',
          is_nsfw: false,
          unlock_price: 0
        })
        .select(`
          *,
          creator:users!posts_creator_id_fkey(*)
        `)
        .single()

      if (error) throw error

      // Add to top of list
      setThoughts(prev => [{
        ...data,
        liked: false,
        creator: data.creator || user
      } as ThoughtWithCreator, ...prev])

      setComposerText('')
      toast.success('Thought posted!')
    } catch (err) {
      console.error('Failed to post thought:', err)
      toast.error('Failed to post thought')
    }
    setPosting(false)
  }

  // Like/unlike
  const handleLike = async (thought: ThoughtWithCreator) => {
    const wasLiked = thought.liked

    // Optimistic update
    setThoughts(prev => prev.map(t =>
      t.id === thought.id
        ? { ...t, liked: !wasLiked, likes_count: (t.likes_count || 0) + (wasLiked ? -1 : 1) }
        : t
    ))

    try {
      if (wasLiked) {
        await unlikePost(user.telegram_id, thought.id)
      } else {
        await likePost(user.telegram_id, thought.id)
      }
    } catch {
      // Revert on error
      setThoughts(prev => prev.map(t =>
        t.id === thought.id
          ? { ...t, liked: wasLiked, likes_count: (t.likes_count || 0) + (wasLiked ? 1 : -1) }
          : t
      ))
    }
  }

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px'
    }
  }, [composerText])

  const filterTabs: { id: FilterType; label: string; icon: any }[] = [
    { id: 'foryou', label: 'For You', icon: Sparkles },
    { id: 'following', label: 'Following', icon: Users },
    { id: 'popular', label: 'Popular', icon: TrendingUp },
    { id: 'recent', label: 'Recent', icon: Clock },
  ]

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={onBack} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <span className="font-bold text-lg">Thoughts</span>
          </div>

          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-2 -mr-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <Search className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <AnimatePresence>
          {showSearch && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-white/10"
            >
              <div className="p-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && searchThoughts()}
                    placeholder="Search thoughts..."
                    className="w-full pl-10 pr-10 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:border-purple-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => { setSearchQuery(''); loadThoughts() }}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                    >
                      <X className="w-5 h-5 text-white/40" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Content */}
      <div className={`pt-${showSearch ? '28' : '16'}`} style={{ paddingTop: showSearch ? '7rem' : '4rem' }}>
        {/* Composer Section - Fixed at top */}
        <div className="bg-black border-b border-white/10 p-4">
          <div className="flex gap-3">
            <img
              src={user.avatar_url || `https://i.pravatar.cc/150?u=${user.telegram_id}`}
              alt=""
              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <textarea
                ref={textareaRef}
                value={composerText}
                onChange={(e) => setComposerText(e.target.value.slice(0, MAX_LENGTH))}
                placeholder="What's on your mind?"
                className="w-full bg-transparent text-white placeholder-white/40 resize-none focus:outline-none text-[15px] leading-relaxed"
                rows={1}
              />
              <div className="flex items-center justify-between mt-2">
                <span className={`text-xs ${composerText.length > MAX_LENGTH * 0.9 ? 'text-orange-400' : 'text-white/30'}`}>
                  {composerText.length}/{MAX_LENGTH}
                </span>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={postThought}
                  disabled={!composerText.trim() || posting}
                  className={`px-4 py-1.5 rounded-full font-semibold text-sm flex items-center gap-2 transition-all ${
                    composerText.trim()
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/10 text-white/30'
                  }`}
                >
                  {posting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Post
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="bg-black border-b border-white/10 px-2 py-2 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2">
            {filterTabs.map((tab) => (
              <motion.button
                key={tab.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => { setFilter(tab.id); setSearchQuery('') }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  filter === tab.id
                    ? 'bg-purple-500 text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Thoughts Feed */}
        <div className="pb-20">
          {loading || searching ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            </div>
          ) : thoughts.length === 0 ? (
            <div className="py-20 text-center px-6">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-purple-500/20 flex items-center justify-center">
                <Sparkles className="w-10 h-10 text-purple-400" />
              </div>
              <h3 className="text-lg font-bold mb-2">No thoughts yet</h3>
              <p className="text-white/50 text-sm">
                {filter === 'following'
                  ? "Follow people to see their thoughts here"
                  : searchQuery
                    ? "No thoughts match your search"
                    : "Be the first to share a thought!"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {thoughts.map((thought) => (
                <ThoughtCard
                  key={thought.id}
                  thought={thought}
                  onLike={() => handleLike(thought)}
                  onViewProfile={onViewProfile}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Thought Card Component
function ThoughtCard({
  thought,
  onLike,
  onViewProfile
}: {
  thought: ThoughtWithCreator
  onLike: () => void
  onViewProfile?: (user: User) => void
}) {
  const [showOptions, setShowOptions] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 hover:bg-white/[0.02] transition-colors"
    >
      <div className="flex gap-3">
        {/* Avatar */}
        <button
          onClick={() => onViewProfile?.(thought.creator)}
          className="flex-shrink-0"
        >
          <img
            src={thought.creator.avatar_url || `https://i.pravatar.cc/150?u=${thought.creator.telegram_id}`}
            alt=""
            className="w-10 h-10 rounded-full object-cover"
          />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => onViewProfile?.(thought.creator)}
                className="font-semibold text-white truncate hover:underline"
              >
                {thought.creator.first_name || 'User'}
              </button>
              <span className="text-white/40 text-sm truncate">
                @{thought.creator.username || `user${thought.creator.telegram_id}`}
              </span>
              <span className="text-white/30">·</span>
              <span className="text-white/40 text-sm flex-shrink-0">
                {timeAgo(thought.created_at)}
              </span>
            </div>
            <button
              onClick={() => setShowOptions(!showOptions)}
              className="p-1 hover:bg-white/10 rounded-full transition-colors"
            >
              <MoreHorizontal className="w-4 h-4 text-white/40" />
            </button>
          </div>

          {/* Text Content */}
          <p className="text-[15px] text-white/90 whitespace-pre-wrap break-words leading-relaxed">
            {thought.content}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-6 mt-3">
            {/* Reply */}
            <button className="flex items-center gap-1.5 text-white/40 hover:text-blue-400 transition-colors group">
              <div className="p-1.5 rounded-full group-hover:bg-blue-400/10 transition-colors">
                <MessageCircle className="w-[18px] h-[18px]" />
              </div>
              <span className="text-sm">{formatCount(thought.comments_count || 0)}</span>
            </button>

            {/* Repost */}
            <button className="flex items-center gap-1.5 text-white/40 hover:text-green-400 transition-colors group">
              <div className="p-1.5 rounded-full group-hover:bg-green-400/10 transition-colors">
                <Repeat2 className="w-[18px] h-[18px]" />
              </div>
              <span className="text-sm">{formatCount(thought.repost_count || 0)}</span>
            </button>

            {/* Like */}
            <button
              onClick={onLike}
              className={`flex items-center gap-1.5 transition-colors group ${
                thought.liked ? 'text-pink-500' : 'text-white/40 hover:text-pink-500'
              }`}
            >
              <div className={`p-1.5 rounded-full transition-colors ${
                thought.liked ? 'bg-pink-500/10' : 'group-hover:bg-pink-500/10'
              }`}>
                <Heart className={`w-[18px] h-[18px] ${thought.liked ? 'fill-current' : ''}`} />
              </div>
              <span className="text-sm">{formatCount(thought.likes_count || 0)}</span>
            </button>

            {/* Share */}
            <button className="flex items-center gap-1.5 text-white/40 hover:text-purple-400 transition-colors group">
              <div className="p-1.5 rounded-full group-hover:bg-purple-400/10 transition-colors">
                <Share className="w-[18px] h-[18px]" />
              </div>
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

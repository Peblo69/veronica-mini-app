import { motion } from 'framer-motion'
import { Heart, MessageCircle, Bookmark, Share2, MoreHorizontal, CheckCircle } from 'lucide-react'

interface HomePageProps {

  onCreatorClick: (creator: any) => void
}

// Mock creators/posts data
const posts = [
  {
    id: 1,
    creator: {
      id: 1,
      name: 'Elena Rose',
      username: 'elenarose',
      avatar: 'https://i.pravatar.cc/150?img=1',
      verified: true,
      isOnline: true,
    },
    content: 'Just finished my new photoshoot! What do you think? More exclusive content coming soon for subscribers...',
    image: 'https://picsum.photos/400/500?random=1',
    likes: 1234,
    comments: 89,
    timeAgo: '2h',
    liked: false,
  },
  {
    id: 2,
    creator: {
      id: 2,
      name: 'Sophie Chen',
      username: 'sophiechen',
      avatar: 'https://i.pravatar.cc/150?img=5',
      verified: true,
      isOnline: false,
    },
    content: 'Behind the scenes from today. Subscribe to see the full set!',
    image: 'https://picsum.photos/400/400?random=2',
    likes: 892,
    comments: 45,
    timeAgo: '4h',
    liked: true,
  },
  {
    id: 3,
    creator: {
      id: 3,
      name: 'Mia Williams',
      username: 'miawilliams',
      avatar: 'https://i.pravatar.cc/150?img=9',
      verified: false,
      isOnline: true,
    },
    content: 'New week, new content! Check my profile for the latest updates',
    image: 'https://picsum.photos/400/350?random=3',
    likes: 567,
    comments: 23,
    timeAgo: '6h',
    liked: false,
  },
]

const suggestions = [
  { id: 4, name: 'Anna K.', username: 'annak', avatar: 'https://i.pravatar.cc/150?img=10', verified: true },
  { id: 5, name: 'Lisa M.', username: 'lisam', avatar: 'https://i.pravatar.cc/150?img=16', verified: true },
  { id: 6, name: 'Kate J.', username: 'katej', avatar: 'https://i.pravatar.cc/150?img=20', verified: false },
]

export default function HomePage({ onCreatorClick }: HomePageProps) {
  return (
    <div className="space-y-3 p-3">
      {/* Stories/Suggestions */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-gray-500 mb-3">SUGGESTIONS FOR YOU</h3>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {suggestions.map((creator) => (
            <motion.button
              key={creator.id}
              className="flex flex-col items-center min-w-[70px]"
              whileTap={{ scale: 0.95 }}
              onClick={() => onCreatorClick(creator)}
            >
              <div className="relative">
                <div className="w-16 h-16 rounded-full p-0.5 bg-gradient-to-br from-of-blue to-blue-400">
                  <img src={creator.avatar} alt={creator.name} className="w-full h-full rounded-full object-cover border-2 border-white" />
                </div>
                {creator.verified && (
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-of-blue rounded-full flex items-center justify-center border-2 border-white">
                    <CheckCircle className="w-3 h-3 text-white fill-white" />
                  </div>
                )}
              </div>
              <span className="text-xs mt-1 truncate w-full text-center">{creator.name.split(' ')[0]}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Posts Feed */}
      {posts.map((post, index) => (
        <motion.div
          key={post.id}
          className="card overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
        >
          {/* Post Header */}
          <div className="flex items-center justify-between p-3">
            <button 
              className="flex items-center gap-3"
              onClick={() => onCreatorClick(post.creator)}
            >
              <div className="relative">
                <img src={post.creator.avatar} alt={post.creator.name} className="w-10 h-10 rounded-full object-cover" />
                {post.creator.isOnline && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                )}
              </div>
              <div className="text-left">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-sm">{post.creator.name}</span>
                  {post.creator.verified && (
                    <CheckCircle className="w-4 h-4 text-of-blue fill-of-blue" />
                  )}
                </div>
                <span className="text-xs text-gray-500">@{post.creator.username} · {post.timeAgo}</span>
              </div>
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-full">
              <MoreHorizontal className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Post Content */}
          <p className="px-3 pb-3 text-sm">{post.content}</p>

          {/* Post Image */}
          <img src={post.image} alt="Post" className="w-full" />

          {/* Post Actions */}
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-4">
              <button className="flex items-center gap-1">
                <Heart className={"w-6 h-6 " + (post.liked ? 'text-red-500 fill-red-500' : 'text-gray-600')} />
                <span className="text-sm text-gray-600">{post.likes}</span>
              </button>
              <button className="flex items-center gap-1">
                <MessageCircle className="w-6 h-6 text-gray-600" />
                <span className="text-sm text-gray-600">{post.comments}</span>
              </button>
              <button>
                <Share2 className="w-6 h-6 text-gray-600" />
              </button>
            </div>
            <button>
              <Bookmark className="w-6 h-6 text-gray-600" />
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

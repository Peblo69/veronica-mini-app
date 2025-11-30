import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, MoreHorizontal, CheckCircle, Image as ImageIcon, Heart, Lock, Star, MessageCircle } from 'lucide-react'

interface CreatorProfilePageProps {
  creator: any
  onBack: () => void
}

const mockCreatorData = {
  coverImage: 'https://picsum.photos/800/300?random=100',
  bio: 'Content creator and lifestyle enthusiast. Exclusive content daily!',
  postsCount: 156,
  mediaCount: 892,
  likesCount: 45600,
  subscribersCount: 2300,
  subscriptionPrice: 15,
  isSubscribed: false,
  posts: [
    { id: 1, image: 'https://picsum.photos/200/200?random=10', locked: true, likes: 234 },
    { id: 2, image: 'https://picsum.photos/200/250?random=11', locked: false, likes: 456 },
    { id: 3, image: 'https://picsum.photos/200/200?random=12', locked: true, likes: 123 },
    { id: 4, image: 'https://picsum.photos/200/300?random=13', locked: true, likes: 789 },
    { id: 5, image: 'https://picsum.photos/200/200?random=14', locked: false, likes: 321 },
    { id: 6, image: 'https://picsum.photos/200/250?random=15', locked: true, likes: 567 },
  ],
}

export default function CreatorProfilePage({ creator, onBack }: CreatorProfilePageProps) {
  const [activeTab, setActiveTab] = useState('posts')
  const [isSubscribed, setIsSubscribed] = useState(false)

  const formatNumber = (num: number) => {
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="fixed top-0 left-0 right-0 z-50 bg-of-blue text-white">
        <div className="flex items-center justify-between px-2 py-3">
          <button onClick={onBack} className="p-2">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-1">
            <span className="font-semibold">{creator.name}</span>
            {creator.verified && <CheckCircle className="w-4 h-4 fill-white" />}
          </div>
          <button className="p-2"><MoreHorizontal className="w-6 h-6" /></button>
        </div>
      </div>

      <div className="pt-14">
        <div className="h-32 bg-gradient-to-r from-of-blue to-blue-400">
          <img src={mockCreatorData.coverImage} alt="Cover" className="w-full h-full object-cover" />
        </div>

        <div className="px-4 -mt-12 relative z-10">
          <div className="flex justify-between items-end">
            <div className="relative">
              <img src={creator.avatar || 'https://i.pravatar.cc/150?img=1'} alt={creator.name} className="w-24 h-24 rounded-full border-4 border-white object-cover shadow-lg" />
              {creator.verified && (
                <div className="absolute bottom-1 right-1 w-7 h-7 bg-of-blue rounded-full flex items-center justify-center border-2 border-white">
                  <CheckCircle className="w-4 h-4 text-white fill-white" />
                </div>
              )}
            </div>
            <div className="flex gap-2 mb-2">
              <button className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center">
                <Star className="w-5 h-5 text-gray-600" />
              </button>
              <button className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-4 pt-3">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{creator.name}</h1>
            {creator.verified && <CheckCircle className="w-5 h-5 text-of-blue fill-of-blue" />}
          </div>
          <p className="text-gray-500 text-sm">@{creator.username || 'creator'}</p>
          
          <div className="flex items-center gap-4 mt-3 text-sm">
            <div className="flex items-center gap-1">
              <ImageIcon className="w-4 h-4 text-gray-400" />
              <span className="font-semibold">{mockCreatorData.postsCount}</span>
            </div>
            <div className="flex items-center gap-1">
              <Heart className="w-4 h-4 text-gray-400" />
              <span className="font-semibold">{formatNumber(mockCreatorData.likesCount)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-semibold">{formatNumber(mockCreatorData.subscribersCount)}</span>
              <span className="text-gray-400">fans</span>
            </div>
          </div>

          <p className="mt-3 text-sm text-gray-700">{mockCreatorData.bio}</p>

          <div className="mt-4 p-4 bg-gray-50 rounded-xl">
            <div className="text-xs text-gray-500 uppercase font-semibold mb-2">Subscription</div>
            <div className="flex items-center justify-between">
              <motion.button className="btn-subscribe flex-1 mr-3" whileTap={{ scale: 0.98 }} onClick={() => setIsSubscribed(!isSubscribed)}>
                {isSubscribed ? 'SUBSCRIBED' : 'SUBSCRIBE'}
              </motion.button>
              <div className="text-right">
                <div className="text-lg font-bold text-of-blue">FREE</div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex border-b border-gray-200 mt-4">
          <button className={'flex-1 py-3 text-center text-sm font-semibold ' + (activeTab === 'posts' ? 'tab-active' : 'text-gray-500')} onClick={() => setActiveTab('posts')}>
            {mockCreatorData.postsCount} POSTS
          </button>
          <button className={'flex-1 py-3 text-center text-sm font-semibold ' + (activeTab === 'media' ? 'tab-active' : 'text-gray-500')} onClick={() => setActiveTab('media')}>
            {mockCreatorData.mediaCount} MEDIA
          </button>
        </div>

        <div className="grid grid-cols-3 gap-0.5 p-0.5">
          {mockCreatorData.posts.map((post) => (
            <motion.div key={post.id} className="relative aspect-square" whileTap={{ scale: 0.98 }}>
              <img src={post.image} alt="" className="w-full h-full object-cover" />
              {post.locked && !isSubscribed && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <Lock className="w-8 h-8 text-white" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

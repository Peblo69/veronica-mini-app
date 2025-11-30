import { useState } from 'react'
import { motion } from 'framer-motion'
import { Settings, Edit, Grid, Bookmark, Lock, Share2 } from 'lucide-react'

interface ProfilePageProps {
  user: any
  
}

const myPosts = [
  { id: 1, image: 'https://picsum.photos/200/200?random=20', likes: 123, locked: false },
  { id: 2, image: 'https://picsum.photos/200/250?random=21', likes: 456, locked: true },
  { id: 3, image: 'https://picsum.photos/200/200?random=22', likes: 789, locked: false },
]

export default function ProfilePage({ user }: ProfilePageProps) {
  const [activeTab, setActiveTab] = useState('posts')

  return (
    <div className="bg-white min-h-screen">
      <div className="h-28 bg-gradient-to-r from-of-blue to-blue-400" />
      
      <div className="px-4 -mt-12">
        <div className="flex justify-between items-end">
          <div className="relative">
            <img src={user.avatar || 'https://i.pravatar.cc/150?img=33'} alt={user.name} className="w-24 h-24 rounded-full border-4 border-white object-cover shadow-lg" />
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
        <h1 className="text-xl font-bold">{user.name}</h1>
        <p className="text-gray-500 text-sm">@{user.username}</p>

        <div className="flex items-center gap-6 mt-3 text-sm">
          <div className="text-center">
            <div className="font-bold">{myPosts.length}</div>
            <div className="text-gray-500">Posts</div>
          </div>
          <div className="text-center">
            <div className="font-bold">1.2K</div>
            <div className="text-gray-500">Likes</div>
          </div>
          <div className="text-center">
            <div className="font-bold">89</div>
            <div className="text-gray-500">Fans</div>
          </div>
        </div>

        <p className="mt-3 text-sm text-gray-700">Your bio goes here. Tell the world about yourself!</p>

        <motion.button className="btn-subscribe w-full mt-4" whileTap={{ scale: 0.98 }}>
          BECOME A CREATOR
        </motion.button>
      </div>

      <div className="flex border-b border-gray-200 mt-4">
        <button className={'flex-1 py-3 flex items-center justify-center gap-2 text-sm font-semibold ' + (activeTab === 'posts' ? 'tab-active' : 'text-gray-500')} onClick={() => setActiveTab('posts')}>
          <Grid className="w-4 h-4" /> Posts
        </button>
        <button className={'flex-1 py-3 flex items-center justify-center gap-2 text-sm font-semibold ' + (activeTab === 'saved' ? 'tab-active' : 'text-gray-500')} onClick={() => setActiveTab('saved')}>
          <Bookmark className="w-4 h-4" /> Saved
        </button>
      </div>

      <div className="grid grid-cols-3 gap-0.5 p-0.5">
        {myPosts.map((post) => (
          <motion.div key={post.id} className="relative aspect-square" whileTap={{ scale: 0.98 }}>
            <img src={post.image} alt="" className="w-full h-full object-cover" />
            {post.locked && (
              <div className="absolute top-2 right-2">
                <Lock className="w-4 h-4 text-white drop-shadow" />
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}

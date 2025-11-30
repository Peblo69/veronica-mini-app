import { motion } from 'framer-motion'
import { Settings, Edit, Grid, Bookmark, Share2, Clock, CheckCircle } from 'lucide-react'
import { type User } from '../lib/api'

interface ProfilePageProps {
  user: User & { application_status?: string }
  setUser: (user: User) => void
  onBecomeCreator: () => void
}

export default function ProfilePage({ user, setUser: _setUser, onBecomeCreator }: ProfilePageProps) {
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
        <button className="flex-1 py-3 flex items-center justify-center gap-2 text-sm font-semibold tab-active">
          <Grid className="w-4 h-4" /> Posts
        </button>
        <button className="flex-1 py-3 flex items-center justify-center gap-2 text-sm font-semibold text-gray-500">
          <Bookmark className="w-4 h-4" /> Saved
        </button>
      </div>

      <div className="p-4 text-center text-gray-500">
        {user.is_creator ? 'Your posts will appear here' : 'Become a creator to post content'}
      </div>
    </div>
  )
}

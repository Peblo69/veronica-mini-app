import { useState } from 'react'
import { motion } from 'framer-motion'
import { Image, Video, Lock, Globe, Send, Loader2 } from 'lucide-react'
import { createPost, type User } from '../lib/api'

interface CreatePageProps {
  user: User
}

export default function CreatePage({ user }: CreatePageProps) {
  const [content, setContent] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [posting, setPosting] = useState(false)
  const [success, setSuccess] = useState(false)

  const handlePost = async () => {
    if (!content.trim() || posting) return
    
    setPosting(true)
    const { error } = await createPost(user.telegram_id, content, undefined, isPrivate)
    setPosting(false)
    
    if (!error) {
      setSuccess(true)
      setContent('')
      setTimeout(() => setSuccess(false), 2000)
    }
  }

  if (!user.is_creator) {
    return (
      <div className="p-4">
        <div className="card p-8 text-center">
          <h2 className="text-xl font-bold mb-2">Become a Creator</h2>
          <p className="text-gray-500 mb-4">Start sharing content and earning with your fans!</p>
          <motion.button className="btn-subscribe" whileTap={{ scale: 0.95 }}>
            Apply Now
          </motion.button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">Create Post</h2>
      
      {success && (
        <motion.div 
          className="mb-4 p-3 bg-green-100 text-green-700 rounded-xl text-center"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Post created successfully!
        </motion.div>
      )}
      
      <div className="card p-4">
        <div className="flex gap-3 mb-4">
          <img src={user.avatar_url || 'https://i.pravatar.cc/150?u=' + user.telegram_id} alt="" className="w-10 h-10 rounded-full object-cover" />
          <textarea
            placeholder="What's on your mind?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 resize-none text-sm focus:outline-none min-h-[100px]"
          />
        </div>

        <div className="flex items-center gap-3 py-3 border-t border-b border-gray-100">
          <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-of-blue">
            <Image className="w-5 h-5" />
            <span>Photo</span>
          </button>
          <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-of-blue">
            <Video className="w-5 h-5" />
            <span>Video</span>
          </button>
        </div>

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setIsPrivate(!isPrivate)}
            className={'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ' + (isPrivate ? 'bg-of-blue text-white' : 'bg-gray-100 text-gray-600')}
          >
            {isPrivate ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
            <span>{isPrivate ? 'Subscribers' : 'Public'}</span>
          </button>
          
          <motion.button
            className="btn-subscribe flex items-center gap-2"
            whileTap={{ scale: 0.95 }}
            disabled={!content.trim() || posting}
            onClick={handlePost}
          >
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span>{posting ? 'Posting...' : 'Post'}</span>
          </motion.button>
        </div>
      </div>
    </div>
  )
}

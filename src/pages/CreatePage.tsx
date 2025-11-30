import { useState } from 'react'
import { motion } from 'framer-motion'
import { Image, Video, Type, Lock, Globe, Send } from 'lucide-react'

interface CreatePageProps {
  user: any
}

export default function CreatePage({ user }: CreatePageProps) {
  const [content, setContent] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">Create Post</h2>
      
      <div className="card p-4">
        <div className="flex gap-3 mb-4">
          <img src={user.avatar || 'https://i.pravatar.cc/150?img=33'} alt="You" className="w-10 h-10 rounded-full object-cover" />
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
          <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-of-blue">
            <Type className="w-5 h-5" />
            <span>Text</span>
          </button>
        </div>

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setIsPrivate(!isPrivate)}
            className={'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ' + (isPrivate ? 'bg-of-blue text-white' : 'bg-gray-100 text-gray-600')}
          >
            {isPrivate ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
            <span>{isPrivate ? 'Subscribers only' : 'Public'}</span>
          </button>
          
          <motion.button
            className="btn-subscribe flex items-center gap-2"
            whileTap={{ scale: 0.95 }}
            disabled={!content.trim()}
          >
            <Send className="w-4 h-4" />
            <span>Post</span>
          </motion.button>
        </div>
      </div>
    </div>
  )
}

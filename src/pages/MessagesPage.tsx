import { motion } from 'framer-motion'
import { CheckCircle, Search } from 'lucide-react'

const conversations = [
  { id: 1, name: 'Elena Rose', avatar: 'https://i.pravatar.cc/150?img=1', lastMessage: 'Thanks for subscribing!', time: '2m', unread: 2, verified: true, online: true },
  { id: 2, name: 'Sophie Chen', avatar: 'https://i.pravatar.cc/150?img=5', lastMessage: 'Check out my new post', time: '1h', unread: 0, verified: true, online: false },
  { id: 3, name: 'Mia Williams', avatar: 'https://i.pravatar.cc/150?img=9', lastMessage: 'Hey there!', time: '3h', unread: 1, verified: false, online: true },
]

export default function MessagesPage() {
  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">Messages</h2>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input type="text" placeholder="Search messages..." className="w-full pl-10 pr-4 py-2.5 rounded-full bg-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-of-blue" />
      </div>
      <div className="space-y-2">
        {conversations.map((conv, index) => (
          <motion.button key={conv.id} className="card p-3 flex items-center gap-3 w-full text-left" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
            <div className="relative">
              <img src={conv.avatar} alt={conv.name} className="w-14 h-14 rounded-full object-cover" />
              {conv.online && <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-semibold">{conv.name}</span>
                {conv.verified && <CheckCircle className="w-4 h-4 text-of-blue fill-of-blue" />}
              </div>
              <p className="text-sm text-gray-500 truncate">{conv.lastMessage}</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-400">{conv.time}</span>
              {conv.unread > 0 && <div className="w-5 h-5 rounded-full bg-of-blue text-white text-xs flex items-center justify-center mt-1 ml-auto">{conv.unread}</div>}
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  )
}

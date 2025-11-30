import { motion } from 'framer-motion'
import { Heart, UserPlus, MessageCircle, Star, CheckCircle } from 'lucide-react'

const notifications = [
  { id: 1, type: 'like', user: 'Elena Rose', avatar: 'https://i.pravatar.cc/150?img=1', text: 'liked your post', time: '2m', verified: true },
  { id: 2, type: 'follow', user: 'Sophie Chen', avatar: 'https://i.pravatar.cc/150?img=5', text: 'started following you', time: '15m', verified: true },
  { id: 3, type: 'comment', user: 'Mia Williams', avatar: 'https://i.pravatar.cc/150?img=9', text: 'commented on your post', time: '1h', verified: false },
  { id: 4, type: 'subscribe', user: 'Anna K.', avatar: 'https://i.pravatar.cc/150?img=10', text: 'subscribed to you', time: '3h', verified: true },
  { id: 5, type: 'like', user: 'Lisa M.', avatar: 'https://i.pravatar.cc/150?img=16', text: 'liked your post', time: '5h', verified: false },
]

const iconMap = {
  like: Heart,
  follow: UserPlus,
  comment: MessageCircle,
  subscribe: Star,
}

export default function NotificationsPage() {
  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">Notifications</h2>
      <div className="space-y-2">
        {notifications.map((notif, index) => {
          const Icon = iconMap[notif.type as keyof typeof iconMap]
          return (
            <motion.div key={notif.id} className="card p-3 flex items-center gap-3" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}>
              <div className="relative">
                <img src={notif.avatar} alt={notif.user} className="w-12 h-12 rounded-full object-cover" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-of-blue flex items-center justify-center border-2 border-white">
                  <Icon className="w-3 h-3 text-white" />
                </div>
              </div>
              <div className="flex-1">
                <p className="text-sm">
                  <span className="font-semibold">{notif.user}</span>
                  {notif.verified && <CheckCircle className="w-3 h-3 text-of-blue fill-of-blue inline ml-1" />}
                  <span className="text-gray-600"> {notif.text}</span>
                </p>
                <span className="text-xs text-gray-400">{notif.time}</span>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

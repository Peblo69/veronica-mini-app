import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Heart, UserPlus, MessageCircle, Star, CheckCircle } from 'lucide-react'
import { getNotifications, type User, type Notification } from '../lib/api'

interface NotificationsPageProps {
  user: User
}

const iconMap: any = {
  like: Heart,
  follow: UserPlus,
  comment: MessageCircle,
  subscribe: Star,
}

export default function NotificationsPage({ user }: NotificationsPageProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadNotifications()
  }, [])

  const loadNotifications = async () => {
    const data = await getNotifications(user.telegram_id)
    setNotifications(data)
    setLoading(false)
  }

  const formatTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return mins + 'm'
    const hours = Math.floor(mins / 60)
    if (hours < 24) return hours + 'h'
    return Math.floor(hours / 24) + 'd'
  }

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {[1,2,3].map(i => (
          <div key={i} className="card p-3 flex gap-3 animate-pulse">
            <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/4"></div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">Notifications</h2>
      {notifications.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-500">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notif, index) => {
            const Icon = iconMap[notif.type] || Heart
            return (
              <motion.div 
                key={notif.id} 
                className="card p-3 flex items-center gap-3" 
                initial={{ opacity: 0, x: -20 }} 
                animate={{ opacity: 1, x: 0 }} 
                transition={{ delay: index * 0.05 }}
              >
                <div className="relative">
                  <img 
                    src={notif.from_user?.avatar_url || 'https://i.pravatar.cc/150?u=' + notif.from_user_id} 
                    alt="" 
                    className="w-12 h-12 rounded-full object-cover" 
                  />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-of-blue flex items-center justify-center border-2 border-white">
                    <Icon className="w-3 h-3 text-white" />
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm">
                    <span className="font-semibold">{notif.from_user?.first_name || 'Someone'}</span>
                    {notif.from_user?.is_verified && <CheckCircle className="w-3 h-3 text-of-blue fill-of-blue inline ml-1" />}
                    <span className="text-gray-600"> {notif.content || notif.type}</span>
                  </p>
                  <span className="text-xs text-gray-400">{formatTime(notif.created_at)}</span>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

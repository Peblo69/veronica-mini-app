import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, UserPlus, MessageCircle, Star, CheckCircle, Gift, DollarSign, Video, Bell, Check, Trash2, Loader2 } from 'lucide-react'
import { type User } from '../lib/api'
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  deleteNotification,
  subscribeToNotifications,
  getNotificationContent,
  type Notification
} from '../lib/notificationApi'

interface NotificationsPageProps {
  user: User
}

const iconMap: Record<string, typeof Heart> = {
  like: Heart,
  follow: UserPlus,
  comment: MessageCircle,
  subscription: Star,
  message: MessageCircle,
  tip: DollarSign,
  gift: Gift,
  livestream: Video,
  system: Bell,
}

const colorMap: Record<string, string> = {
  like: 'bg-red-500',
  follow: 'bg-blue-500',
  comment: 'bg-green-500',
  subscription: 'bg-purple-500',
  message: 'bg-of-blue',
  tip: 'bg-yellow-500',
  gift: 'bg-pink-500',
  livestream: 'bg-red-600',
  system: 'bg-gray-500',
}

export default function NotificationsPage({ user }: NotificationsPageProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAllRead, setMarkingAllRead] = useState(false)

  useEffect(() => {
    loadNotifications()

    // Subscribe to real-time notifications
    const unsubscribe = subscribeToNotifications(user.telegram_id, (newNotification) => {
      setNotifications(prev => [newNotification, ...prev])
    })

    return () => unsubscribe()
  }, [user.telegram_id])

  const loadNotifications = async () => {
    setLoading(true)
    const data = await getNotifications(user.telegram_id)
    setNotifications(data)
    setLoading(false)
  }

  const handleMarkAllRead = async () => {
    setMarkingAllRead(true)
    await markAllNotificationsRead(user.telegram_id)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setMarkingAllRead(false)
  }

  const handleMarkRead = async (notification: Notification) => {
    if (notification.is_read) return
    await markNotificationRead(notification.id)
    setNotifications(prev =>
      prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
    )
  }

  const handleDelete = async (notificationId: string) => {
    await deleteNotification(notificationId)
    setNotifications(prev => prev.filter(n => n.id !== notificationId))
  }

  const formatTime = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'now'
    if (mins < 60) return mins + 'm'
    const hours = Math.floor(mins / 60)
    if (hours < 24) return hours + 'h'
    const days = Math.floor(hours / 24)
    if (days < 7) return days + 'd'
    return new Date(date).toLocaleDateString()
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">Notifications</h2>
        </div>
        {[1, 2, 3].map(i => (
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
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold">Notifications</h2>
          {unreadCount > 0 && (
            <span className="bg-of-blue text-white text-xs px-2 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={markingAllRead}
            className="text-sm text-of-blue flex items-center gap-1"
          >
            {markingAllRead ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Mark all read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="card p-8 text-center">
          <Bell className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No notifications yet</p>
          <p className="text-sm text-gray-400 mt-1">You'll see likes, follows, and more here</p>
        </div>
      ) : (
        <AnimatePresence>
          <div className="space-y-2">
            {notifications.map((notif, index) => {
              const Icon = iconMap[notif.type] || Bell
              const bgColor = colorMap[notif.type] || 'bg-gray-500'

              return (
                <motion.div
                  key={notif.id}
                  className={`card p-3 flex items-center gap-3 cursor-pointer transition-colors ${!notif.is_read ? 'bg-blue-50 border-blue-100' : ''}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.03 }}
                  onClick={() => handleMarkRead(notif)}
                >
                  <div className="relative flex-shrink-0">
                    <img
                      src={notif.from_user?.avatar_url || `https://i.pravatar.cc/150?u=${notif.from_user_id || 'system'}`}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover"
                    />
                    <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full ${bgColor} flex items-center justify-center border-2 border-white`}>
                      <Icon className="w-3 h-3 text-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-semibold">
                        {notif.from_user?.first_name || 'System'}
                      </span>
                      {notif.from_user?.is_verified && (
                        <CheckCircle className="w-3 h-3 text-of-blue fill-of-blue inline ml-1" />
                      )}
                      <span className="text-gray-600">
                        {' '}{getNotificationContent(notif)}
                      </span>
                    </p>
                    <span className="text-xs text-gray-400">{formatTime(notif.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!notif.is_read && (
                      <div className="w-2 h-2 rounded-full bg-of-blue"></div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(notif.id)
                      }}
                      className="p-1 hover:bg-gray-100 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </AnimatePresence>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle } from 'lucide-react'
import { type User, getFollowers, getFollowing, followUser, unfollowUser, isFollowing as checkIsFollowing } from '../lib/api'

interface FollowersSheetProps {
  isOpen: boolean
  onClose: () => void
  userId: number
  currentUserId: number
  type: 'followers' | 'following'
  onUserClick?: (user: User) => void
}

interface UserWithFollowStatus extends User {
  isFollowedByMe?: boolean
  followLoading?: boolean
}

export default function FollowersSheet({ isOpen, onClose, userId, currentUserId, type, onUserClick }: FollowersSheetProps) {
  const [users, setUsers] = useState<UserWithFollowStatus[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (isOpen) {
      loadUsers()
    }
  }, [isOpen, userId, type])

  const loadUsers = async () => {
    setLoading(true)
    const result = type === 'followers'
      ? await getFollowers(userId, 200)
      : await getFollowing(userId, 200)

    // Check follow status for each user (except current user)
    const usersWithStatus: UserWithFollowStatus[] = await Promise.all(
      result.map(async (user) => {
        if (user.telegram_id === currentUserId) {
          return { ...user, isFollowedByMe: false }
        }
        const isFollowed = await checkIsFollowing(currentUserId, user.telegram_id)
        return { ...user, isFollowedByMe: isFollowed }
      })
    )

    setUsers(usersWithStatus)
    setLoading(false)
  }

  const handleFollow = async (targetUser: UserWithFollowStatus, e: React.MouseEvent) => {
    e.stopPropagation() // Don't trigger profile click

    // Update loading state for this user
    setUsers(prev => prev.map(u =>
      u.telegram_id === targetUser.telegram_id ? { ...u, followLoading: true } : u
    ))

    try {
      if (targetUser.isFollowedByMe) {
        await unfollowUser(currentUserId, targetUser.telegram_id)
        setUsers(prev => prev.map(u =>
          u.telegram_id === targetUser.telegram_id
            ? { ...u, isFollowedByMe: false, followLoading: false }
            : u
        ))
      } else {
        await followUser(currentUserId, targetUser.telegram_id)
        setUsers(prev => prev.map(u =>
          u.telegram_id === targetUser.telegram_id
            ? { ...u, isFollowedByMe: true, followLoading: false }
            : u
        ))
      }
    } catch (err) {
      console.error('Follow/unfollow error:', err)
      setUsers(prev => prev.map(u =>
        u.telegram_id === targetUser.telegram_id ? { ...u, followLoading: false } : u
      ))
    }
  }

  const handleUserClick = (user: User) => {
    if (onUserClick) {
      onUserClick(user)
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100]"
            onClick={onClose}
          />

          {/* Centered Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-4"
            onClick={onClose}
          >
            <div
              className="bg-[#1a1a1f] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                <span className="text-lg font-semibold text-white capitalize">{type}</span>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/15 transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </motion.button>
              </div>

              {/* User List */}
              <div className="overflow-y-auto max-h-[70vh] min-h-[200px]">
                {loading ? (
                  <div className="p-4 space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex items-center gap-3 animate-pulse">
                        <div className="w-12 h-12 bg-white/10 rounded-full shrink-0" />
                        <div className="flex-1">
                          <div className="h-4 bg-white/10 rounded w-28 mb-1.5" />
                          <div className="h-3 bg-white/10 rounded w-20" />
                        </div>
                        <div className="w-20 h-8 bg-white/10 rounded-lg" />
                      </div>
                    ))}
                  </div>
                ) : users.length === 0 ? (
                  <div className="py-20 text-center">
                    <p className="text-white/40 text-sm">
                      {type === 'followers' ? 'No followers yet' : 'Not following anyone'}
                    </p>
                  </div>
                ) : (
                  <div className="p-3 space-y-1">
                    {users.map((user) => (
                      <div
                        key={user.telegram_id}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer"
                        onClick={() => handleUserClick(user)}
                      >
                        <img
                          src={user.avatar_url || `https://i.pravatar.cc/150?u=${user.telegram_id}`}
                          alt={user.first_name || 'User'}
                          className="w-12 h-12 rounded-full object-cover border border-white/10 shrink-0"
                        />
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-white text-[15px] truncate">
                              {user.first_name} {user.last_name}
                            </span>
                            {user.is_verified && (
                              <CheckCircle className="w-4 h-4 text-blue-400 fill-blue-400 shrink-0" />
                            )}
                          </div>
                          <div className="text-sm text-white/50 truncate">
                            {user.username ? `@${user.username}` : user.is_creator ? 'Creator' : 'User'}
                          </div>
                        </div>
                        {/* Follow Button - don't show for current user */}
                        {user.telegram_id !== currentUserId && (
                          <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={(e) => handleFollow(user, e)}
                            disabled={user.followLoading}
                            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors shrink-0 min-w-[90px] ${
                              user.followLoading
                                ? 'bg-white/10 text-white/50'
                                : user.isFollowedByMe
                                  ? 'bg-white/10 text-white hover:bg-white/15'
                                  : 'bg-blue-500 text-white hover:bg-blue-600'
                            }`}
                          >
                            {user.followLoading ? (
                              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white/70 rounded-full animate-spin" />
                            ) : user.isFollowedByMe ? (
                              'Following'
                            ) : (
                              'Follow'
                            )}
                          </motion.button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

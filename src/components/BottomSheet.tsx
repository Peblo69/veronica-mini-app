import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle } from 'lucide-react'
import { type User } from '../lib/api'

interface BottomSheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  users: User[]
  loading?: boolean
  onUserClick?: (user: User) => void
}

export default function BottomSheet({ isOpen, onClose, title, users, loading, onUserClick }: BottomSheetProps) {
  return (
    <AnimatePresence mode="sync">
      {isOpen && (
        <>
          {/* Backdrop - solid dark, no blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 bg-black/70 z-[9998]"
            onClick={onClose}
          />

          {/* Sheet - dark theme to prevent white flashes */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{
              type: 'tween',
              duration: 0.3,
              ease: [0.32, 0.72, 0, 1]
            }}
            className="fixed bottom-0 left-0 right-0 z-[9999] will-change-transform"
            style={{ height: '55%' }}
          >
            <div className="h-full bg-[#262626] rounded-t-[12px] overflow-hidden flex flex-col">
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-9 h-1 bg-[#555] rounded-full" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-[#363636]">
                <h3 className="text-base font-semibold text-white">{title}</h3>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full bg-[#363636] active:bg-[#444]"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto bg-[#262626]">
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="w-6 h-6 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
                  </div>
                ) : users.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-gray-500">
                    <p className="text-sm">No one yet</p>
                  </div>
                ) : (
                  <div className="py-1">
                    {users.map((user) => (
                      <button
                        key={user.telegram_id}
                        onClick={() => onUserClick?.(user)}
                        className="w-full flex items-center gap-3 px-4 py-3 active:bg-white/5"
                      >
                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                          <img
                            src={user.avatar_url || `https://i.pravatar.cc/150?u=${user.telegram_id}`}
                            alt=""
                            className="w-11 h-11 rounded-full object-cover bg-[#333]"
                          />
                          {user.is_verified && (
                            <div className="absolute -bottom-0.5 -right-0.5 bg-[#262626] rounded-full p-0.5">
                              <CheckCircle className="w-3.5 h-3.5 text-[#0095f6] fill-[#0095f6]" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 text-left min-w-0">
                          <span className="font-semibold text-[15px] text-white truncate block">
                            {user.username || user.first_name || 'User'}
                          </span>
                          {user.first_name && user.username && (
                            <p className="text-[13px] text-gray-500 truncate">
                              {user.first_name} {user.last_name || ''}
                            </p>
                          )}
                        </div>

                        {/* Creator badge */}
                        {user.is_creator && (
                          <span className="text-[11px] font-semibold text-[#0095f6] bg-[#0095f6]/10 px-2.5 py-1 rounded-full">
                            Creator
                          </span>
                        )}
                      </button>
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

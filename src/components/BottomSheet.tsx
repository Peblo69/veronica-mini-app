import { useState, useEffect } from 'react'
import { motion, AnimatePresence, type PanInfo } from 'framer-motion'
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
  const [sheetHeight, setSheetHeight] = useState(50) // percentage

  // Handle drag end to snap to positions
  const handleDragEnd = (_: any, info: PanInfo) => {
    const velocity = info.velocity.y
    const offset = info.offset.y

    if (velocity > 500 || offset > 100) {
      // Dragged down fast or far - close
      onClose()
    } else if (velocity < -500 || offset < -100) {
      // Dragged up fast or far - expand to full
      setSheetHeight(90)
    } else {
      // Snap to middle
      setSheetHeight(50)
    }
  }

  // Reset height when opened
  useEffect(() => {
    if (isOpen) {
      setSheetHeight(50)
    }
  }, [isOpen])

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
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: `${100 - sheetHeight}%` }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            className="fixed bottom-0 left-0 right-0 z-50 touch-none"
            style={{ height: '90vh' }}
          >
            <div className="h-full bg-white/80 backdrop-blur-xl rounded-t-3xl shadow-2xl border-t border-white/50 overflow-hidden flex flex-col">
              {/* Drag Handle */}
              <div className="flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing">
                <div className="w-10 h-1 bg-gray-300 rounded-full" />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-5 pb-3 border-b border-gray-100/80">
                <h3 className="text-lg font-bold text-gray-900">{title}</h3>
                <button
                  onClick={onClose}
                  className="p-2 -mr-2 rounded-full hover:bg-gray-100/80 transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto overscroll-contain">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
                  </div>
                ) : users.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <p className="text-sm">No one yet</p>
                  </div>
                ) : (
                  <div className="py-2">
                    {users.map((user) => (
                      <button
                        key={user.telegram_id}
                        onClick={() => onUserClick?.(user)}
                        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50/80 transition-colors"
                      >
                        {/* Avatar */}
                        <div className="relative flex-shrink-0">
                          <img
                            src={user.avatar_url || `https://i.pravatar.cc/150?u=${user.telegram_id}`}
                            alt=""
                            className="w-12 h-12 rounded-full object-cover bg-gray-100"
                          />
                          {user.is_verified && (
                            <div className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5">
                              <CheckCircle className="w-4 h-4 text-blue-500 fill-blue-500" />
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-[15px] text-gray-900 truncate">
                              {user.username || user.first_name || 'User'}
                            </span>
                          </div>
                          {user.first_name && user.username && (
                            <p className="text-[13px] text-gray-500 truncate">
                              {user.first_name} {user.last_name || ''}
                            </p>
                          )}
                        </div>

                        {/* Follow button placeholder */}
                        {user.is_creator && (
                          <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
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

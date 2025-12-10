import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import type { User } from '../lib/api'

export interface StoryItem {
  id: string
  user_id: number
  media_url: string
  media_type: 'image' | 'video'
  user?: User
}

interface StoryViewerProps {
  stories: StoryItem[]
  startIndex: number
  onClose: () => void
}

export default function StoryViewer({ stories, startIndex, onClose }: StoryViewerProps) {
  const [index, setIndex] = useState(startIndex)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    setIndex(startIndex)
  }, [startIndex])

  const current = stories[index]

  useEffect(() => {
    if (!current) return
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
    // Auto-advance images after 5s; videos on end or 12s fallback
    if (current.media_type === 'image') {
      timerRef.current = setTimeout(() => handleNext(), 5000)
    } else {
      timerRef.current = setTimeout(() => handleNext(), 12000)
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [current?.id])

  const handleNext = () => {
    if (index < stories.length - 1) {
      setIndex(index + 1)
    } else {
      onClose()
    }
  }

  const handlePrev = () => {
    if (index > 0) {
      setIndex(index - 1)
    } else {
      onClose()
    }
  }

  if (!current) return null

  const username = current.user?.first_name || current.user?.username || `@user${current.user_id}`

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[90] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-white/10 rounded-full text-white z-[95]"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Nav zones */}
        <button
          onClick={handlePrev}
          className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={handleNext}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <div className="w-full max-w-md aspect-[9/16] bg-black rounded-3xl overflow-hidden border border-white/10 relative">
          <div className="absolute top-0 left-0 right-0 h-1 bg-white/20">
            <div
              className="h-full bg-white transition-all"
              style={{ width: `${((index + 1) / stories.length) * 100}%` }}
            />
          </div>

          <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20">
            <div className="flex items-center gap-2">
              <img
                src={current.user?.avatar_url || `https://i.pravatar.cc/120?u=${current.user_id}`}
                className="w-9 h-9 rounded-full border border-white/30"
                alt=""
              />
              <div>
                <p className="text-white font-semibold text-sm leading-tight">{username}</p>
                <p className="text-white/70 text-[11px]">Story</p>
              </div>
            </div>
            <span className="text-white/60 text-xs">
              {index + 1}/{stories.length}
            </span>
          </div>

          <div className="w-full h-full relative flex items-center justify-center bg-black">
            {current.media_type === 'video' ? (
              <video
                ref={videoRef}
                key={current.id}
                src={current.media_url}
                className="w-full h-full object-contain"
                autoPlay
                playsInline
                muted
                onEnded={handleNext}
              />
            ) : (
              <img
                key={current.id}
                src={current.media_url}
                alt=""
                className="w-full h-full object-contain"
              />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

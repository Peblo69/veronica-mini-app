import { useSyncExternalStore, useCallback } from 'react'

let activeVideoId: string | null = null
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getSnapshot = () => activeVideoId

const setActiveVideo = (id: string | null) => {
  if (activeVideoId === id) return
  activeVideoId = id
  listeners.forEach((l) => l())
}

/**
 * Shared video playback controller to keep only one video playing at a time.
 * Returns helpers to mark a video as active and react when another video starts.
 */
export function useSharedVideoPlayback(videoId?: string) {
  const activeId = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const isActive = videoId ? activeId === videoId : false

  const requestPlay = useCallback(
    (id?: string | null) => {
      if (!id) return
      setActiveVideo(id)
    },
    []
  )

  const clearActive = useCallback(() => {
    if (activeVideoId === videoId) {
      setActiveVideo(null)
    }
  }, [videoId])

  return {
    activeId,
    isActive,
    requestPlay,
    clearActive,
  }
}

export default useSharedVideoPlayback

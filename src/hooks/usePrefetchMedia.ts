import { useEffect } from 'react'

export function usePrefetchMedia(url?: string | null) {
  useEffect(() => {
    if (typeof window === 'undefined' || !url) return

    const requestIdle =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback.bind(window)
        : undefined
    const cancelIdle =
      typeof window.cancelIdleCallback === 'function'
        ? window.cancelIdleCallback.bind(window)
        : undefined

    let cancelled = false
    let idleHandle: number | null = null
    let timeoutHandle: number | null = null

    const prefetch = () => {
      if (cancelled) return
      const img = new Image()
      img.src = url
    }

    if (requestIdle) {
      idleHandle = requestIdle(() => prefetch())
    } else {
      timeoutHandle = window.setTimeout(prefetch, 250)
    }

    return () => {
      cancelled = true
      if (idleHandle !== null && cancelIdle) {
        cancelIdle(idleHandle)
      }
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle)
      }
    }
  }, [url])
}

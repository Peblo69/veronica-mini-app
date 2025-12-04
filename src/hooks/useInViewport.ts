import type { RefObject } from 'react'
import { useEffect, useState } from 'react'

interface Options extends IntersectionObserverInit {
  /**
   * Minimum intersection ratio (0-1) required to consider the element visible.
   * Defaults to 0.25 (25%).
   */
  minimumRatio?: number
}

export function useInViewport<T extends Element>(
  ref: RefObject<T | null>,
  { root = null, rootMargin = '0px', threshold = 0, minimumRatio = 0.25 }: Options = {}
) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        const ratio = entry.intersectionRatio ?? 0
        setIsVisible(entry.isIntersecting && ratio >= minimumRatio)
      },
      { root, rootMargin, threshold }
    )

    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [ref, root, rootMargin, threshold, minimumRatio])

  return isVisible
}

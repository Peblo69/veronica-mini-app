import type { RefObject } from 'react'
import { useEffect, useState, useRef } from 'react'

interface Options {
  /**
   * Minimum intersection ratio (0-1) required to consider the element visible.
   * Defaults to 0.25 (25%).
   */
  minimumRatio?: number
  root?: Element | null
  rootMargin?: string
}

export function useInViewport<T extends Element>(
  ref: RefObject<T | null>,
  { root = null, rootMargin = '0px', minimumRatio = 0.25 }: Options = {}
) {
  const [isVisible, setIsVisible] = useState(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') return

    // Use multiple thresholds for smooth ratio tracking
    const thresholds = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry) return

        const ratio = entry.intersectionRatio
        const visible = entry.isIntersecting && ratio >= minimumRatio

        // Debounce state updates
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        rafRef.current = requestAnimationFrame(() => {
          setIsVisible(visible)
        })
      },
      { root, rootMargin, threshold: thresholds }
    )

    observer.observe(node)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      observer.disconnect()
    }
  }, [ref, root, rootMargin, minimumRatio])

  return isVisible
}

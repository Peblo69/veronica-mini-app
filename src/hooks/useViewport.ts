import { useEffect } from 'react'

/**
 * Hook to handle Telegram Mini App viewport changes
 * Sets CSS custom properties for dynamic viewport height
 * Handles keyboard visibility and safe areas
 */
export function useViewport() {
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp

    const setAppHeight = () => {
      // Use Telegram's stable viewport height if available
      const height = tg?.viewportStableHeight || tg?.viewportHeight || window.innerHeight
      document.documentElement.style.setProperty('--app-height', `${height}px`)
    }

    const handleVisualViewport = () => {
      if (window.visualViewport) {
        // Calculate keyboard height
        const keyboardHeight = window.innerHeight - window.visualViewport.height
        document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight > 0 ? keyboardHeight : 0}px`)
      }
      setAppHeight()
    }

    // Initial setup
    setAppHeight()

    // Expand Telegram WebApp to full height
    tg?.expand?.()

    // Listen for resize events
    window.addEventListener('resize', setAppHeight)

    // Listen for Telegram viewport changes
    tg?.onEvent?.('viewportChanged', setAppHeight)

    // Listen for visual viewport changes (keyboard)
    window.visualViewport?.addEventListener('resize', handleVisualViewport)

    return () => {
      window.removeEventListener('resize', setAppHeight)
      tg?.offEvent?.('viewportChanged', setAppHeight)
      window.visualViewport?.removeEventListener('resize', handleVisualViewport)
    }
  }, [])
}

export default useViewport

import { useEffect } from 'react'

interface TelegramViewportEvent {
  isStateStable?: boolean
}

/**
 * Hook to keep layout height in sync with Telegram keyboard animation.
 * Uses Telegram's viewportChanged event for instant updates and falls back to visualViewport.
 */
export function useViewport() {
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp

    const applyViewportMetrics = (opts?: TelegramViewportEvent) => {
      const height = tg
        ? (opts?.isStateStable ? tg.viewportStableHeight : tg.viewportHeight) || tg.viewportHeight
        : window.innerHeight

      document.documentElement.style.setProperty('--app-height', `${height || window.innerHeight}px`)
      document.documentElement.style.setProperty('--safe-top', `${tg?.safeAreaInsetTop || 0}px`)
      document.documentElement.style.setProperty('--safe-bottom', `${tg?.safeAreaInsetBottom || 0}px`)
    }

    const handleVisualViewport = () => {
      if (window.visualViewport) {
        const keyboardHeight = Math.max(0, window.innerHeight - window.visualViewport.height)
        document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`)
      }
      applyViewportMetrics()
    }

    const handleTelegramViewport = (event?: TelegramViewportEvent) => {
      applyViewportMetrics(event)
    }

    const handleWindowResize = () => applyViewportMetrics()

    applyViewportMetrics()
    tg?.expand?.()

    window.addEventListener('resize', handleWindowResize)
    tg?.onEvent?.('viewportChanged', handleTelegramViewport)
    window.visualViewport?.addEventListener('resize', handleVisualViewport)

    return () => {
      window.removeEventListener('resize', handleWindowResize)
      tg?.offEvent?.('viewportChanged', handleTelegramViewport)
      window.visualViewport?.removeEventListener('resize', handleVisualViewport)
    }
  }, [])
}

export default useViewport

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
    const docEl = document.documentElement
    let rafId: number | null = null

    const readMetrics = (opts?: TelegramViewportEvent) => {
      const stableHeight = tg?.viewportStableHeight
      const tgHeight = tg?.viewportHeight
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight
      const height = tg
        ? (opts?.isStateStable && stableHeight ? stableHeight : tgHeight) || viewportHeight
        : viewportHeight
      const keyboardHeight = Math.max(0, window.innerHeight - (window.visualViewport?.height ?? window.innerHeight))

      return { height: Math.round(height || window.innerHeight), keyboardHeight: Math.round(keyboardHeight) }
    }

    const applyViewportMetrics = (opts?: TelegramViewportEvent) => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const { height, keyboardHeight } = readMetrics(opts)
        docEl.style.setProperty('--app-height', `${height}px`)
        docEl.style.setProperty('--keyboard-height', `${keyboardHeight}px`)
        docEl.style.setProperty('--safe-top', `${tg?.safeAreaInsetTop || 0}px`)
        docEl.style.setProperty('--safe-bottom', `${tg?.safeAreaInsetBottom || 0}px`)
        rafId = null
      })
    }

    const handleVisualViewport = () => applyViewportMetrics()
    const handleTelegramViewport = (event?: TelegramViewportEvent) => applyViewportMetrics(event)
    const handleWindowResize = () => applyViewportMetrics()

    applyViewportMetrics()
    tg?.expand?.()

    window.addEventListener('resize', handleWindowResize)
    tg?.onEvent?.('viewportChanged', handleTelegramViewport)
    window.visualViewport?.addEventListener('resize', handleVisualViewport)
    window.visualViewport?.addEventListener('scroll', handleVisualViewport)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('resize', handleWindowResize)
      tg?.offEvent?.('viewportChanged', handleTelegramViewport)
      window.visualViewport?.removeEventListener('resize', handleVisualViewport)
      window.visualViewport?.removeEventListener('scroll', handleVisualViewport)
    }
  }, [])
}

export default useViewport

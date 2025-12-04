import { useState, useEffect, useCallback, useRef } from 'react'

interface KeyboardState {
  visible: boolean
  height: number
}

/**
 * Hook for handling keyboard visibility in Telegram Mini Apps
 * Combines visualViewport API and Telegram WebApp events
 * Based on Instagram clone's useDodgeKeyboard pattern
 */
export default function useKeyboardAware(enabled = true) {
  const [keyboard, setKeyboard] = useState<KeyboardState>({ visible: false, height: 0 })
  const lastHeight = useRef(0)
  const animationFrame = useRef<number | null>(null)

  const updateKeyboard = useCallback(() => {
    if (!enabled) return

    const vv = window.visualViewport
    const tg = (window as any).Telegram?.WebApp

    // Calculate keyboard height from multiple sources
    let kbHeight = 0

    // Method 1: visualViewport (works on iOS Safari, Chrome)
    if (vv) {
      kbHeight = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
    }

    // Method 2: Telegram WebApp viewport (more reliable in Telegram)
    if (tg?.viewportHeight && tg?.viewportStableHeight) {
      const tgKbHeight = Math.max(0, tg.viewportStableHeight - tg.viewportHeight)
      kbHeight = Math.max(kbHeight, tgKbHeight)
    }

    // Only update if there's a significant change (debounce small fluctuations)
    if (Math.abs(kbHeight - lastHeight.current) > 20) {
      lastHeight.current = kbHeight
      setKeyboard({
        visible: kbHeight > 100,
        height: kbHeight
      })
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return

    const handleUpdate = () => {
      // Cancel previous frame to debounce updates
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current)
      }
      animationFrame.current = requestAnimationFrame(updateKeyboard)
    }

    const tg = (window as any).Telegram?.WebApp

    // Listen to visualViewport events
    window.visualViewport?.addEventListener('resize', handleUpdate)
    window.visualViewport?.addEventListener('scroll', handleUpdate)

    // Listen to Telegram WebApp events
    tg?.onEvent?.('viewportChanged', handleUpdate)

    // Initial check
    updateKeyboard()

    return () => {
      window.visualViewport?.removeEventListener('resize', handleUpdate)
      window.visualViewport?.removeEventListener('scroll', handleUpdate)
      tg?.offEvent?.('viewportChanged', handleUpdate)
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current)
      }
    }
  }, [enabled, updateKeyboard])

  return keyboard
}

// Storage polyfill for restricted contexts (Telegram WebApp, etc.)
// Must be at the very top before any imports
(function() {
  try {
    localStorage.getItem('test')
  } catch {
    // Storage is blocked, create a memory-based polyfill
    const memoryStorage: Record<string, string> = {}
    const storagePolyfill = {
      getItem: (key: string) => memoryStorage[key] || null,
      setItem: (key: string, value: string) => { memoryStorage[key] = value },
      removeItem: (key: string) => { delete memoryStorage[key] },
      clear: () => { Object.keys(memoryStorage).forEach(k => delete memoryStorage[k]) },
      get length() { return Object.keys(memoryStorage).length },
      key: (i: number) => Object.keys(memoryStorage)[i] || null,
    }
    Object.defineProperty(window, 'localStorage', { value: storagePolyfill, writable: false })
    Object.defineProperty(window, 'sessionStorage', { value: storagePolyfill, writable: false })
  }
})()

// Virtual keyboard handling - enable overlaysContent for smooth animations
// This makes the keyboard overlay content instead of resizing viewport
;(function setupVirtualKeyboard() {
  if (typeof window === 'undefined') return

  // Enable VirtualKeyboard API if available (modern Chrome/Edge)
  // This allows CSS env(keyboard-inset-height) to work
  if ('virtualKeyboard' in navigator) {
    try {
      (navigator as unknown as { virtualKeyboard: { overlaysContent: boolean } }).virtualKeyboard.overlaysContent = true
    } catch (e) {
      console.warn('VirtualKeyboard API not fully supported')
    }
  }

  // Set CSS variable for viewport height (fallback)
  const setViewportHeight = () => {
    const vh = window.visualViewport?.height ?? window.innerHeight
    document.documentElement.style.setProperty('--app-height', `${vh}px`)
  }

  setViewportHeight()
  window.visualViewport?.addEventListener('resize', setViewportHeight)
  window.addEventListener('resize', setViewportHeight)
})()

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

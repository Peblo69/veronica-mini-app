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

// Virtual keyboard handling for smooth animations (Instagram-like behavior)
// This handles the keyboard open/close smoothly on mobile devices
;(function setupViewportHandler() {
  if (typeof window === 'undefined') return

  const setViewportHeight = () => {
    // Use visualViewport height if available, otherwise window.innerHeight
    const vh = window.visualViewport?.height ?? window.innerHeight
    document.documentElement.style.setProperty('--app-height', `${vh}px`)
    document.body.style.height = `${vh}px`
  }

  // Set initial height
  setViewportHeight()

  // Listen to visualViewport changes (keyboard open/close)
  if (window.visualViewport) {
    // Use both resize and scroll events for better coverage
    window.visualViewport.addEventListener('resize', setViewportHeight)
    window.visualViewport.addEventListener('scroll', setViewportHeight)
  }

  // Fallback for browsers without visualViewport
  window.addEventListener('resize', setViewportHeight)

  // Handle orientation changes
  window.addEventListener('orientationchange', () => {
    setTimeout(setViewportHeight, 100)
  })
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

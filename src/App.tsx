import { useState, useEffect, Suspense, lazy, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, Search, PlusSquare, MessageCircle, User, Plus } from 'lucide-react'
import { Routes, Route, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import './index.css'

import { useViewport } from './hooks/useViewport'
import { getOrCreateUser, getUser, subscribeToUserUpdates, type User as UserType } from './lib/api'
import { getTotalUnreadCount, subscribeToConversations } from './lib/chatApi'
import { registerSession } from './lib/settingsApi'
import ToastContainer from './components/Toast'

const HomePage = lazy(() => import('./pages/HomePage'))
const ExplorePage = lazy(() => import('./pages/ExplorePage'))
const CreatePage = lazy(() => import('./pages/CreatePage'))
const MessagesPage = lazy(() => import('./pages/MessagesPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const CreatorProfilePage = lazy(() => import('./pages/CreatorProfilePage'))
const CreatorApplicationPage = lazy(() => import('./pages/CreatorApplicationPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const LivestreamPage = lazy(() => import('./pages/LivestreamPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

const navItems = [
  { id: 'home', icon: Home, path: '/' },
  { id: 'explore', icon: Search, path: '/explore' },
  { id: 'create', icon: PlusSquare, path: '/create' },
  { id: 'messages', icon: MessageCircle, path: '/messages' },
  { id: 'profile', icon: User, path: '/profile' },
]

// Hook to detect keyboard visibility - Instagram pattern: hide nav when keyboard shows
function useKeyboardVisible() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      const vv = window.visualViewport
      if (!vv) return

      // Keyboard is visible if viewport height decreased significantly
      const keyboardHeight = window.innerHeight - vv.height
      const isKeyboardOpen = keyboardHeight > 150

      if (isKeyboardOpen !== visible) {
        setVisible(isKeyboardOpen)
      }
    }

    window.visualViewport?.addEventListener('resize', handleResize)
    window.visualViewport?.addEventListener('scroll', handleResize)

    // Telegram WebApp keyboard events
    const tg = (window as any).Telegram?.WebApp
    const handleTgViewport = () => {
      if (tg?.viewportHeight && tg?.viewportStableHeight) {
        const diff = tg.viewportStableHeight - tg.viewportHeight
        setVisible(diff > 150)
      }
    }
    tg?.onEvent?.('viewportChanged', handleTgViewport)

    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize)
      window.visualViewport?.removeEventListener('scroll', handleResize)
      tg?.offEvent?.('viewportChanged', handleTgViewport)
    }
  }, [visible])

  return visible
}

// Hook to detect scroll idle state - smooth show/hide for FAB
function useScrollIdle(delay = 150) {
  const [isIdle, setIsIdle] = useState(true)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef = useRef<number | null>(null)
  const lastScrollY = useRef(0)

  useEffect(() => {
    let ticking = false

    const handleScroll = () => {
      const currentScrollY = window.scrollY

      // Only react if we actually moved
      if (Math.abs(currentScrollY - lastScrollY.current) < 2) return
      lastScrollY.current = currentScrollY

      if (!ticking) {
        rafRef.current = requestAnimationFrame(() => {
          // Immediately hide when scrolling starts
          setIsIdle(false)

          // Clear any existing timeout
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
          }

          // Set new timeout to show after idle
          timeoutRef.current = setTimeout(() => {
            setIsIdle(true)
          }, delay)

          ticking = false
        })
        ticking = true
      }
    }

    // Use passive listener for performance
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [delay])

  return isIdle
}

const LoadingOverlay = ({ message }: { message?: string }) => (
  <div className="fixed inset-0 bg-black flex items-center justify-center z-[200]">
    <div className="flex flex-col items-center gap-3">
      <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      <p className="text-sm text-white/70">{message || 'Loading...'}</p>
    </div>
  </div>
)

// Wrapper to pass mode from URL to CreatePage
function CreatePageWrapper({ user, onBecomeCreator }: { user: UserType; onBecomeCreator: () => void }) {
  const [searchParams] = useSearchParams()
  const mode = searchParams.get('mode') as 'text' | 'media' | null
  return <CreatePage user={user} onBecomeCreator={onBecomeCreator} mode={mode || 'media'} />
}

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const keyboardVisible = useKeyboardVisible()
  const scrollIdle = useScrollIdle(200) // Show FAB after 200ms of no scrolling
  const [viewingCreator, setViewingCreator] = useState<any>(null)
  const [user, setUserInternal] = useState<UserType | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingError, setLoadingError] = useState<string | null>(null)
  const [showApplication, setShowApplication] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [secretBuffer, setSecretBuffer] = useState('')
  const [showLivestream, setShowLivestream] = useState<{ isCreator: boolean; livestreamId?: string } | null>(null)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  void secretBuffer

  // CRITICAL: Lock the telegram_id once set - it can NEVER change during a session
  // This prevents profile corruption bugs from realtime events or race conditions
  const lockedTelegramIdRef = useRef<number | null>(null)

  // Safe user setter that validates telegram_id matches locked value
  const setUser = useCallback((newUser: UserType | null | ((prev: UserType | null) => UserType | null)) => {
    setUserInternal((prev) => {
      const resolved = typeof newUser === 'function' ? newUser(prev) : newUser

      // If setting to null, that's fine
      if (resolved === null) {
        return null
      }

      // First time setting user - lock the telegram_id
      if (lockedTelegramIdRef.current === null) {
        lockedTelegramIdRef.current = resolved.telegram_id
        console.log('[USER SECURITY] Locked telegram_id:', resolved.telegram_id)
        return resolved
      }

      // CRITICAL: Validate telegram_id matches locked value
      if (resolved.telegram_id !== lockedTelegramIdRef.current) {
        console.error('[USER SECURITY] BLOCKED attempt to change user!', {
          locked: lockedTelegramIdRef.current,
          attempted: resolved.telegram_id,
        })
        // Return previous user unchanged - DO NOT allow the change
        return prev
      }

      return resolved
    })
  }, [])

  useViewport()

  const ADMIN_SECRET_KEY = 'kjkszpj69'
  const ADMIN_TELEGRAM_ID = 7881088777

  useEffect(() => {
    initUser()
  }, [])

  useEffect(() => {
    if (!user) return
    let interval: ReturnType<typeof setInterval> | null = null

    const touchSession = async () => {
      try {
        await registerSession(user.telegram_id)
      } catch (err) {
        console.warn('Failed to refresh session', err)
      }
    }

    void touchSession()
    interval = window.setInterval(() => {
      void touchSession()
    }, 60 * 1000)

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [user?.telegram_id])

  // Subscribe to realtime user profile updates
  useEffect(() => {
    if (!user) return

    const unsubscribe = subscribeToUserUpdates(user.telegram_id, (updatedUser) => {
      setUser(prev => prev ? { ...prev, ...updatedUser } : null)
    })

    return () => unsubscribe()
  }, [user?.telegram_id])

  // Fetch unread message count and subscribe to conversation updates
  useEffect(() => {
    if (!user) return

    // Initial fetch
    const fetchUnread = async () => {
      const count = await getTotalUnreadCount(user.telegram_id)
      setUnreadCount(count)
    }
    void fetchUnread()

    // Subscribe to conversation updates to keep unread count in sync
    const unsubscribe = subscribeToConversations(user.telegram_id, async () => {
      // Re-fetch total unread when any conversation changes
      const count = await getTotalUnreadCount(user.telegram_id)
      setUnreadCount(count)
    })

    return () => unsubscribe()
  }, [user?.telegram_id])

  useEffect(() => {
    if (!user || user.telegram_id !== ADMIN_TELEGRAM_ID) return

    try {
      const hash = window.location.hash
      if (hash.startsWith('#/admin/')) {
        const providedKey = hash.replace('#/admin/', '')
        if (providedKey === ADMIN_SECRET_KEY) {
          setShowAdmin(true)
          window.history.replaceState(null, '', window.location.pathname)
        }
      }
    } catch (e) {
      // Ignore URL errors
    }
  }, [user])

  useEffect(() => {
    if (!user || user.telegram_id !== ADMIN_TELEGRAM_ID) return

    const handleKeyPress = (e: KeyboardEvent) => {
      setSecretBuffer(prev => {
        const newInput = (prev + e.key).slice(-20)
        if (newInput.includes(ADMIN_SECRET_KEY)) {
          setShowAdmin(true)
          return ''
        }
        return newInput
      })
    }

    window.addEventListener('keypress', handleKeyPress)
    return () => window.removeEventListener('keypress', handleKeyPress)
  }, [user])

  const initUser = async () => {
    setLoading(true)
    setLoadingError(null)

    // Wait briefly for Telegram to populate initDataUnsafe; never seed a fake user in production
    const waitForTelegramUser = async (timeoutMs = 4000, intervalMs = 120) => {
      const tgApp = (window as any).Telegram?.WebApp
      if (!tgApp) return null

      const start = Date.now()
      let userData = tgApp.initDataUnsafe?.user

      while (!userData && Date.now() - start < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, intervalMs))
        userData = tgApp.initDataUnsafe?.user
      }
      return userData ?? null
    }

    try {
      const tg = (window as any).Telegram?.WebApp

      if (!tg) {
        setLoadingError('Telegram session not detected. Please open the bot inside Telegram to continue.')
        setLoading(false)
        return
      }

      const telegramUserData = await waitForTelegramUser()

      if (telegramUserData?.id) {
        tg.ready()
        tg.expand()

        // Try to go fullscreen (Bot API 8.0+) - makes header transparent
        if (tg.requestFullscreen) {
          try {
            tg.requestFullscreen()
          } catch (e) {
            console.log('Fullscreen not available')
          }
        }

        // Set header color to black to blend with our app
        if (tg.setHeaderColor) {
          tg.setHeaderColor('#000000')
        }
        if (tg.setBackgroundColor) {
          tg.setBackgroundColor('#000000')
        }

        // CRITICAL: Get telegram_id from the source of truth - Telegram WebApp
        const telegramUserId = telegramUserData.id
        console.log('[USER INIT] Telegram user ID:', telegramUserId)
        console.log('[USER INIT] Telegram username:', telegramUserData.username)

        const dbUser = await getOrCreateUser({
          id: telegramUserId,
          username: telegramUserData.username,
          first_name: telegramUserData.first_name,
          last_name: telegramUserData.last_name,
          photo_url: telegramUserData.photo_url,
        })

        if (dbUser) {
          // CRITICAL: Verify database returned correct user
          if (dbUser.telegram_id !== telegramUserId) {
            console.error('[USER SECURITY] Database returned WRONG user!', {
              expected: telegramUserId,
              received: dbUser.telegram_id,
            })
            // Force correct telegram_id
            dbUser.telegram_id = telegramUserId
          }
          console.log('[USER INIT] Setting user from DB:', dbUser.telegram_id, dbUser.username)
          setUser(dbUser)
        } else {
          // Use @username as display name if available
          const displayName = telegramUserData.username
            ? `@${telegramUserData.username}`
            : telegramUserData.first_name || 'New User'
          console.log('[USER INIT] Creating fallback user:', telegramUserId)
          setUser({
            telegram_id: telegramUserId, // Use the variable, not re-read
            username: telegramUserData.username || 'user',
            first_name: displayName,
            balance: 0,
            is_creator: false,
            is_verified: false,
            subscription_price: 0,
            followers_count: 0,
            following_count: 0,
            posts_count: 0,
            likes_received: 0,
            subscribers_count: 0,
          })
        }
      } else {
        setLoadingError('Telegram user data was not available. Close Telegram and reopen the mini app.')
        setLoading(false)
        return
      }
    } catch (error) {
      console.error('Failed to init user:', error)
      setLoadingError('Could not load your profile. Please try again or reopen Telegram.')
      setLoading(false)
      return
    }
    setLoading(false)
  }

  const openCreatorProfile = (creator: any) => {
    if (user && Number(creator.telegram_id) === Number(user.telegram_id)) {
      navigate('/profile')
      return
    }
    setViewingCreator(creator)
  }

  const closeCreatorProfile = () => {
    setViewingCreator(null)
  }

  const openApplication = () => {
    setShowApplication(true)
  }

  const handleApplicationSuccess = async () => {
    setShowApplication(false)
    if (user) {
      const updatedUser = await getUser(user.telegram_id)
      if (updatedUser) {
        // CRITICAL: Verify telegram_id matches before setting
        if (updatedUser.telegram_id !== user.telegram_id) {
          console.error('[USER SECURITY] getUser returned wrong user in handleApplicationSuccess!', {
            expected: user.telegram_id,
            received: updatedUser.telegram_id,
          })
          return // Don't update with wrong user
        }
        console.log('[USER UPDATE] handleApplicationSuccess:', updatedUser.telegram_id)
        setUser(updatedUser)
      }
    }
  }

  // Livestream feature disabled
  // const openLivestream = (isCreator: boolean, livestreamId?: string) => {
  //   setShowLivestream({ isCreator, livestreamId })
  // }

  const handleMessageCreator = (conversationId: string) => {
    setViewingCreator(null)
    setSelectedConversationId(conversationId)
    navigate('/messages')
  }

  const normalizedPath = location.pathname === '/' ? '/' : location.pathname.replace(/\/+$/, '')
  const activeNav = navItems.find(item => normalizedPath === item.path || normalizedPath.startsWith(item.path + '/'))?.id || 'home'

  // Should we show the bottom nav? Instagram pattern - hide during overlays, chat, keyboard, sheets
  const showBottomNav = !viewingCreator && !showApplication && !showAdmin && !isChatOpen && !showLivestream && !keyboardVisible && !isSheetOpen

  const routeContent = user ? (
    <Suspense fallback={<LoadingOverlay message="Loading..." />}>
      <Routes>
        <Route
          path="/"
          element={(
            <HomePage
              user={user}
              onCreatorClick={openCreatorProfile}
              onSheetStateChange={setIsSheetOpen}
            />
          )}
        />
        <Route path="/explore" element={<ExplorePage user={user} onCreatorClick={openCreatorProfile} />} />
        <Route path="/create" element={<CreatePageWrapper user={user} onBecomeCreator={openApplication} />} />
        <Route
          path="/messages/*"
          element={(
            <MessagesPage
              user={user}
              selectedConversationId={selectedConversationId}
              onConversationOpened={() => setSelectedConversationId(null)}
              onChatStateChange={setIsChatOpen}
              onProfileClick={openCreatorProfile}
            />
          )}
        />
        <Route
          path="/profile"
          element={(
            <ProfilePage
              user={user}
              setUser={setUser}
              onBecomeCreator={openApplication}
              onSettingsClick={() => setShowSettings(true)}
              onViewProfile={openCreatorProfile}
            />
          )}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  ) : null

  const renderPage = () => {
    if (!user) return null

    if (showLivestream && user) {
      return (
        <Suspense fallback={<LoadingOverlay message="Loading livestream..." />}>
          <LivestreamPage
            user={user}
            isCreator={showLivestream.isCreator}
            livestreamId={showLivestream.livestreamId}
            onExit={() => setShowLivestream(null)}
          />
        </Suspense>
      )
    }

    if (showAdmin) {
      return (
        <Suspense fallback={<LoadingOverlay message="Loading admin..." />}>
          <AdminPage telegramId={user.telegram_id} onExit={() => setShowAdmin(false)} />
        </Suspense>
      )
    }

    if (showApplication) {
      return (
        <Suspense fallback={<LoadingOverlay message="Loading application..." />}>
          <CreatorApplicationPage user={user} onBack={() => setShowApplication(false)} onSuccess={handleApplicationSuccess} />
        </Suspense>
      )
    }

    if (viewingCreator) {
      return (
        <Suspense fallback={<LoadingOverlay message="Loading profile..." />}>
          <CreatorProfilePage
            creator={viewingCreator}
            currentUser={user}
            onBack={closeCreatorProfile}
            onMessage={handleMessageCreator}
            onUserUpdate={(updates) => setUser(prev => prev ? { ...prev, ...updates } : null)}
            onViewProfile={openCreatorProfile}
          />
        </Suspense>
      )
    }

    return routeContent
  }

  if (loadingError && (!user || loading)) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-white text-lg font-semibold">Couldn&apos;t load your profile</div>
          <p className="text-gray-400 text-sm leading-relaxed">{loadingError}</p>
          <button
            onClick={() => { void initUser() }}
            className="px-4 py-2 rounded-full bg-white text-black font-semibold active:scale-95 transition"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">{loading ? 'Loading...' : 'Initializing...'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-black relative overflow-hidden flex flex-col">
      {/* Global toast notifications */}
      <ToastContainer />

      {/* Main content area - top padding for Telegram header buttons (iOS needs ~70px to clear buttons) */}
      <main
        className="flex-1 overflow-y-auto overflow-x-hidden overscroll-none"
        style={{ paddingTop: 'max(70px, calc(env(safe-area-inset-top, 0px) + 50px))' }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={showAdmin ? 'admin' : showApplication ? 'application' : viewingCreator ? 'creator' : showLivestream ? 'livestream' : location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="min-h-full"
          >
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Settings overlay */}
      <AnimatePresence>
        {showSettings && user && (
          <Suspense fallback={<LoadingOverlay message="Loading settings..." />}>
            <SettingsPage user={user} setUser={setUser} onClose={() => setShowSettings(false)} />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Floating Action Button - Quick thoughts (text only) - hides on scroll, shows when idle */}
      <AnimatePresence>
        {showBottomNav && location.pathname !== '/create' && scrollIdle && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{
              duration: 0.25,
              ease: [0.4, 0, 0.2, 1], // smooth easing
            }}
            onClick={() => navigate('/create?mode=text')}
            className="fixed right-4 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg active:scale-95"
            style={{
              bottom: 'calc(80px + max(12px, env(safe-area-inset-bottom, 0px)))',
              background: 'rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
            }}
          >
            <Plus className="w-7 h-7 text-white" strokeWidth={2} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Bottom Navigation - Instagram style */}
      <AnimatePresence>
        {showBottomNav && (
          <motion.nav
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex-shrink-0 bg-black relative z-50"
            style={{
              paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
              paddingTop: '0px'
            }}
          >
            {/* Divider line */}
            <div className="h-[1px] bg-white/10 w-full" />
            <div className="flex items-center justify-around h-12 mt-1">
              {navItems.map((item) => {
                const isActive = activeNav === item.id
                return (
                  <button
                    key={item.id}
                    className="flex-1 flex items-center justify-center h-full relative outline-none select-none touch-manipulation active:opacity-60"
                    onClick={() => navigate(item.path)}
                  >
                    {item.id === 'create' ? (
                      // Create button - special styling
                      <div className="w-6 h-6 flex items-center justify-center">
                        <PlusSquare
                          className="w-6 h-6 text-white"
                          strokeWidth={1.5}
                        />
                      </div>
                    ) : item.id === 'messages' ? (
                      // Messages icon with unread badge
                      <div className="relative">
                        <item.icon
                          className="w-6 h-6 text-white transition-transform duration-150"
                          strokeWidth={isActive ? 2.5 : 1.5}
                          style={{
                            transform: isActive ? 'scale(1.05)' : 'scale(1)'
                          }}
                        />
                        {unreadCount > 0 && (
                          <div className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] bg-red-500 rounded-full flex items-center justify-center px-1">
                            <span className="text-[10px] font-bold text-white">
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      // Regular nav items
                      <item.icon
                        className="w-6 h-6 text-white transition-transform duration-150"
                        strokeWidth={isActive ? 2.5 : 1.5}
                        fill={isActive && (item.id === 'home') ? 'currentColor' : 'none'}
                        style={{
                          transform: isActive ? 'scale(1.05)' : 'scale(1)'
                        }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App

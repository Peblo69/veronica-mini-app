import { useState, useEffect, Suspense, lazy } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, Search, PlusSquare, MessageCircle, User } from 'lucide-react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import './index.css'

import { useViewport } from './hooks/useViewport'
import { getOrCreateUser, getUser, type User as UserType } from './lib/api'
import { registerSession } from './lib/settingsApi'

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

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const keyboardVisible = useKeyboardVisible()
  const [viewingCreator, setViewingCreator] = useState<any>(null)
  const [user, setUser] = useState<UserType | null>(null)
  const [loading, setLoading] = useState(true)
  const [showApplication, setShowApplication] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [secretBuffer, setSecretBuffer] = useState('')
  const [showLivestream, setShowLivestream] = useState<{ isCreator: boolean; livestreamId?: string } | null>(null)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  void secretBuffer

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
    try {
      const tg = (window as any).Telegram?.WebApp

      if (tg?.initDataUnsafe?.user) {
        tg.ready()
        tg.expand()

        const dbUser = await getOrCreateUser({
          id: tg.initDataUnsafe.user.id,
          username: tg.initDataUnsafe.user.username,
          first_name: tg.initDataUnsafe.user.first_name,
          last_name: tg.initDataUnsafe.user.last_name,
          photo_url: tg.initDataUnsafe.user.photo_url,
        })

        if (dbUser) {
          setUser(dbUser)
        } else {
          setUser({
            telegram_id: tg.initDataUnsafe.user.id,
            username: tg.initDataUnsafe.user.username || 'user',
            first_name: tg.initDataUnsafe.user.first_name || 'User',
            balance: 0,
            is_creator: false,
            is_verified: false,
            subscription_price: 0,
            followers_count: 0,
            following_count: 0,
            posts_count: 0,
            likes_received: 0,
          })
        }
      } else {
        const fallbackTelegramUser = {
          id: 123456789,
          username: 'testuser',
          first_name: 'Test',
          last_name: 'User',
          photo_url: 'https://i.pravatar.cc/150?u=testuser',
        }
        const seededUser = await getOrCreateUser(fallbackTelegramUser)

        setUser(seededUser || {
          telegram_id: fallbackTelegramUser.id,
          username: fallbackTelegramUser.username,
          first_name: fallbackTelegramUser.first_name,
          last_name: fallbackTelegramUser.last_name,
          balance: 100,
          is_creator: false,
          is_verified: false,
          subscription_price: 0,
          followers_count: 0,
          following_count: 0,
          posts_count: 0,
          likes_received: 0,
        })
      }
    } catch (error) {
      console.error('Failed to init user:', error)
      setUser({
        telegram_id: 123456789,
        username: 'guest',
        first_name: 'Guest',
        balance: 0,
        is_creator: false,
        is_verified: false,
        subscription_price: 0,
        followers_count: 0,
        following_count: 0,
        posts_count: 0,
        likes_received: 0,
      })
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
        setUser(updatedUser)
      }
    }
  }

  const openLivestream = (isCreator: boolean, livestreamId?: string) => {
    setShowLivestream({ isCreator, livestreamId })
  }

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
    <Suspense fallback={<div className="p-6 text-center text-gray-500">Loading...</div>}>
      <Routes>
        <Route
          path="/"
          element={(
            <HomePage
              user={user}
              onCreatorClick={openCreatorProfile}
              onLivestreamClick={(livestreamId) => openLivestream(false, livestreamId)}
              onGoLive={() => openLivestream(true)}
              onSheetStateChange={setIsSheetOpen}
            />
          )}
        />
        <Route path="/explore" element={<ExplorePage user={user} onCreatorClick={openCreatorProfile} />} />
        <Route path="/create" element={<CreatePage user={user} onBecomeCreator={openApplication} />} />
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
        <Suspense fallback={<div className="p-6 text-center text-gray-500">Loading livestream...</div>}>
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
        <Suspense fallback={<div className="p-6 text-center text-gray-500">Loading admin...</div>}>
          <AdminPage telegramId={user.telegram_id} onExit={() => setShowAdmin(false)} />
        </Suspense>
      )
    }

    if (showApplication) {
      return (
        <Suspense fallback={<div className="p-6 text-center text-gray-500">Loading application...</div>}>
          <CreatorApplicationPage user={user} onBack={() => setShowApplication(false)} onSuccess={handleApplicationSuccess} />
        </Suspense>
      )
    }

    if (viewingCreator) {
      return (
        <Suspense fallback={<div className="p-6 text-center text-gray-500">Loading profile...</div>}>
          <CreatorProfilePage
            creator={viewingCreator}
            currentUser={user}
            onBack={closeCreatorProfile}
            onMessage={handleMessageCreator}
          />
        </Suspense>
      )
    }

    return routeContent
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
      {/* Main content area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden overscroll-none">
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
          <Suspense fallback={<div className="fixed inset-0 bg-black/80 flex items-center justify-center">Loading...</div>}>
            <SettingsPage user={user} setUser={setUser} onClose={() => setShowSettings(false)} />
          </Suspense>
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
            className="flex-shrink-0 bg-black border-t border-gray-800/50 safe-area-bottom relative z-50"
            style={{
              paddingBottom: 'env(safe-area-inset-bottom, 0px)'
            }}
          >
            <div className="flex items-center justify-around h-12">
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

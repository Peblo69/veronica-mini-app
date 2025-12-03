import { useState, useEffect, useCallback, Suspense, lazy } from 'react'
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

function App() {
  const navigate = useNavigate()
  const location = useLocation()
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
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null)
  void secretBuffer

  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    setScrollElement(node)
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
              scrollElement={scrollElement}
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">{loading ? 'Loading...' : 'Initializing...'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full w-full bg-gray-50/50 relative overflow-hidden flex flex-col">
      <div className="fixed inset-0 bg-gradient-to-br from-blue-50/50 via-purple-50/30 to-pink-50/30 -z-10" />

      <main ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden overscroll-none">
        <AnimatePresence mode="wait">
          <motion.div
            key={showAdmin ? 'admin' : showApplication ? 'application' : viewingCreator ? 'creator' : showLivestream ? 'livestream' : location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {showSettings && user && (
          <Suspense fallback={<div className="fixed inset-0 bg-white/80 flex items-center justify-center">Loading...</div>}>
            <SettingsPage user={user} setUser={setUser} onClose={() => setShowSettings(false)} />
          </Suspense>
        )}
      </AnimatePresence>

      {!viewingCreator && !showApplication && !showAdmin && !isChatOpen && !showLivestream && (
        <nav className="flex-shrink-0 bg-white/80 backdrop-blur-xl border-t border-white/20 safe-area-bottom shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
          <div className="flex items-center justify-around px-4 py-2">
            {navItems.map((item) => {
              const isActive = activeNav === item.id
              return (
                <button
                  key={item.id}
                  className="flex flex-col items-center justify-center p-2 transition-transform active:scale-90 relative group"
                  onClick={() => navigate(item.path)}
                >
                  {isActive && item.id !== 'create' && (
                    <motion.div
                      layoutId="nav-glow"
                      className="absolute inset-0 bg-gradient-to-tr from-blue-500/20 to-purple-500/20 rounded-2xl blur-md"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    />
                  )}
                  
                  {item.id === 'create' ? (
                    <div className="relative group-active:scale-95 transition-transform duration-200">
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl blur-sm opacity-50 group-hover:opacity-75 transition-opacity" />
                      <div className="relative w-11 h-11 bg-gradient-to-br from-gray-900 to-black rounded-2xl flex items-center justify-center shadow-xl border border-white/10">
                        <PlusSquare className="w-5 h-5 text-white" strokeWidth={2.5} />
                      </div>
                    </div>
                  ) : (
                    <div className="relative z-10">
                      <item.icon 
                        className={`w-[26px] h-[26px] transition-all duration-300 ${
                          isActive 
                            ? 'text-gray-900 fill-gray-900 drop-shadow-[0_0_8px_rgba(0,0,0,0.15)]' 
                            : 'text-gray-400 hover:text-gray-600'
                        }`} 
                        strokeWidth={isActive ? 2.5 : 2}
                      />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </nav>
      )}
    </div>
  )
}

export default App

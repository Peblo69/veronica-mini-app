import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, Bell, PlusSquare, MessageCircle, User } from 'lucide-react'
import './index.css'

import { useViewport } from './hooks/useViewport'
import { getOrCreateUser, getUser, type User as UserType } from './lib/api'
import { getUnreadCount, subscribeToNotifications } from './lib/notificationApi'
import HomePage from './pages/HomePage'
import NotificationsPage from './pages/NotificationsPage'
import CreatePage from './pages/CreatePage'
import MessagesPage from './pages/MessagesPage'
import ProfilePage from './pages/ProfilePage'
import CreatorProfilePage from './pages/CreatorProfilePage'
import CreatorApplicationPage from './pages/CreatorApplicationPage'
import AdminPage from './pages/AdminPage'
import LivestreamPage from './pages/LivestreamPage'
import SettingsPage from './pages/SettingsPage'

const navItems = [
  { id: 'home', icon: Home },
  { id: 'notifications', icon: Bell },
  { id: 'create', icon: PlusSquare },
  { id: 'messages', icon: MessageCircle },
  { id: 'profile', icon: User },
]

function App() {
  const [activePage, setActivePage] = useState('home')
  const [viewingCreator, setViewingCreator] = useState<any>(null)
  const [user, setUser] = useState<UserType | null>(null)
  const [loading, setLoading] = useState(true)
  const [showApplication, setShowApplication] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [secretBuffer, setSecretBuffer] = useState('')
  void secretBuffer // Used in keyboard listener
  const [showLivestream, setShowLivestream] = useState<{ isCreator: boolean; livestreamId?: string } | null>(null)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [showSettings, setShowSettings] = useState(false)

  // Handle viewport/keyboard changes for Telegram
  useViewport()

  // SECURE ADMIN ACCESS CONFIG
  const ADMIN_SECRET_KEY = 'kjkszpj69'
  const ADMIN_TELEGRAM_ID = 7881088777

  useEffect(() => {
    initUser()
  }, [])

  // Check URL hash for admin access - only works for admin user
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

  // Keyboard shortcut - only works for admin user
  useEffect(() => {
    if (!user || user.telegram_id !== ADMIN_TELEGRAM_ID) return

    const handleKeyPress = (e: KeyboardEvent) => {
      setSecretBuffer(prev => {
        const newInput = (prev + e.key).slice(-20) // Keep last 20 chars
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

  // Load and subscribe to notifications
  useEffect(() => {
    if (!user) return

    // Load initial count
    getUnreadCount(user.telegram_id).then(setUnreadNotifications)

    // Subscribe to new notifications
    const unsubscribe = subscribeToNotifications(user.telegram_id, () => {
      setUnreadNotifications(prev => prev + 1)
    })

    return () => unsubscribe()
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
          // Fallback if DB fails
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
        // Development/test mode - ensure a Supabase user exists so follow/like/etc. work
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
      // Fallback user on error
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
    // If clicking on own profile, go to profile tab instead
    if (user && Number(creator.telegram_id) === Number(user.telegram_id)) {
      setActivePage("profile")
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
    setActivePage('messages')
  }

  const renderPage = () => {
    if (!user) return null

    // Livestream (full screen)
    if (showLivestream) {
      return (
        <LivestreamPage
          user={user}
          isCreator={showLivestream.isCreator}
          livestreamId={showLivestream.livestreamId}
          onExit={() => setShowLivestream(null)}
        />
      )
    }

    // Admin Panel (full screen, separate from main app)
    if (showAdmin) {
      return (
        <AdminPage
          telegramId={user.telegram_id}
          onExit={() => setShowAdmin(false)}
        />
      )
    }

    if (showApplication) {
      return (
        <CreatorApplicationPage
          user={user}
          onBack={() => setShowApplication(false)}
          onSuccess={handleApplicationSuccess}
        />
      )
    }

    if (viewingCreator) {
      return <CreatorProfilePage creator={viewingCreator} currentUser={user} onBack={closeCreatorProfile} onMessage={handleMessageCreator} />
    }

    switch (activePage) {
      case 'home': return <HomePage user={user} onCreatorClick={openCreatorProfile} onLivestreamClick={(id) => openLivestream(false, id)} onGoLive={() => openLivestream(true)} />
      case 'notifications': return <NotificationsPage user={user} />
      case 'create': return <CreatePage user={user} onBecomeCreator={openApplication} />
      case 'messages': return <MessagesPage user={user} selectedConversationId={selectedConversationId} onConversationOpened={() => setSelectedConversationId(null)} onChatStateChange={setIsChatOpen} onProfileClick={openCreatorProfile} />
      case 'profile': return <ProfilePage user={user} setUser={setUser} onBecomeCreator={openApplication} onSettingsClick={() => setShowSettings(true)} />
      default: return <HomePage user={user} onCreatorClick={openCreatorProfile} />
    }
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
      
      {!showApplication && !showAdmin && !isChatOpen && (
        <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-b border-white/20 shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-tr from-of-blue to-cyan-400 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-of-blue/20">
                V
              </div>
              <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-700">Veronica</h1>
            </div>
            <div className="flex items-center gap-3">
              {user?.telegram_id === ADMIN_TELEGRAM_ID && (
                <button
                  onClick={() => setShowAdmin(true)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors opacity-70 hover:opacity-100"
                >
                  ⚙
                </button>
              )}
              <div className="px-3 py-1.5 bg-gray-100/50 backdrop-blur-md rounded-full border border-white/50 shadow-sm">
                <span className="text-sm font-semibold text-gray-700">{user?.balance || 0} <span className="text-xs text-gray-500">TOKENS</span></span>
              </div>
            </div>
          </div>
        </header>
      )}

      <main className={`flex-1 overflow-y-auto overflow-x-hidden overscroll-none ${showApplication || showAdmin || isChatOpen ? '' : 'pt-16 pb-24'}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={showAdmin ? 'admin' : showApplication ? 'application' : viewingCreator ? 'creator' : activePage}
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

      {/* Settings Page */}
      <AnimatePresence>
        {showSettings && user && (
          <SettingsPage
            user={user}
            setUser={setUser}
            onClose={() => setShowSettings(false)}
          />
        )}
      </AnimatePresence>

      {!viewingCreator && !showApplication && !showAdmin && !isChatOpen && (
        <nav className="fixed bottom-4 left-4 right-4 z-50">
          <div className="glass-panel rounded-[1.2rem] p-1.5 flex items-center justify-around shadow-premium backdrop-blur-2xl bg-white/80">
            {navItems.map((item) => {
              const isActive = activePage === item.id
              return (
                <motion.button
                  key={item.id}
                  className={'nav-item relative ' + (isActive ? 'active' : '')}
                  onClick={() => {
                    setActivePage(item.id)
                    if (item.id === 'notifications') {
                      setUnreadNotifications(0)
                    }
                  }}
                  whileTap={{ scale: 0.9 }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="nav-pill"
                      className="absolute inset-0 bg-blue-50 rounded-xl -z-10 scale-90"
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  )}
                  
                  {item.id === 'create' ? (
                    <div className="w-11 h-11 -mt-5 rounded-full bg-gradient-to-tr from-of-blue to-cyan-400 flex items-center justify-center shadow-lg shadow-of-blue/30 border-[3px] border-white transform translate-y-1">
                      <item.icon className="w-5 h-5 text-white" />
                    </div>
                  ) : item.id === 'notifications' && unreadNotifications > 0 ? (
                    <div className="relative p-2.5">
                      <item.icon className={`w-5 h-5 ${isActive ? 'text-of-blue fill-of-blue/10' : 'text-gray-400'}`} />
                      <span className="absolute top-1.5 right-1.5 min-w-[14px] h-3.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 border border-white">
                        {unreadNotifications > 99 ? '99+' : unreadNotifications}
                      </span>
                    </div>
                  ) : (
                    <div className="p-2.5">
                      <item.icon className={`w-5 h-5 transition-colors ${isActive ? 'text-of-blue fill-of-blue/10' : 'text-gray-400'}`} />
                    </div>
                  )}
                </motion.button>
              )
            })}
          </div>
        </nav>
      )}
    </div>
  )
}

export default App

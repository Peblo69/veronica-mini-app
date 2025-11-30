import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, Bell, PlusSquare, MessageCircle, User } from 'lucide-react'
import './index.css'

import { getOrCreateUser, type User as UserType } from './lib/api'
import HomePage from './pages/HomePage'
import NotificationsPage from './pages/NotificationsPage'
import CreatePage from './pages/CreatePage'
import MessagesPage from './pages/MessagesPage'
import ProfilePage from './pages/ProfilePage'
import CreatorProfilePage from './pages/CreatorProfilePage'

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

  useEffect(() => {
    initUser()
  }, [])

  const initUser = async () => {
    const tg = (window as any).Telegram?.WebApp
    
    if (tg) {
      tg.ready()
      tg.expand()
      
      if (tg.initDataUnsafe?.user) {
        // Get or create user in Supabase
        const dbUser = await getOrCreateUser({
          id: tg.initDataUnsafe.user.id,
          username: tg.initDataUnsafe.user.username,
          first_name: tg.initDataUnsafe.user.first_name,
          last_name: tg.initDataUnsafe.user.last_name,
          photo_url: tg.initDataUnsafe.user.photo_url,
        })
        
        if (dbUser) {
          setUser(dbUser)
        }
      }
    } else {
      // Dev mode - create mock user
      setUser({
        telegram_id: 123456789,
        username: 'testuser',
        first_name: 'Test',
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
    setLoading(false)
  }

  const openCreatorProfile = (creator: any) => {
    setViewingCreator(creator)
  }

  const closeCreatorProfile = () => {
    setViewingCreator(null)
  }

  const renderPage = () => {
    if (!user) return null
    
    if (viewingCreator) {
      return <CreatorProfilePage creator={viewingCreator} onBack={closeCreatorProfile} />
    }
    
    switch (activePage) {
      case 'home': return <HomePage user={user} onCreatorClick={openCreatorProfile} />
      case 'notifications': return <NotificationsPage user={user} />
      case 'create': return <CreatePage user={user} />
      case 'messages': return <MessagesPage user={user} />
      case 'profile': return <ProfilePage user={user} setUser={setUser} />
      default: return <HomePage user={user} onCreatorClick={openCreatorProfile} />
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-of-blue border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="fixed top-0 left-0 right-0 z-50 bg-of-blue text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold">Veronica</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm opacity-90">{user?.balance || 0} tokens</span>
          </div>
        </div>
      </header>

      <main className="pt-14 pb-16">
        <AnimatePresence mode="wait">
          <motion.div
            key={viewingCreator ? 'creator' : activePage}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </main>

      {!viewingCreator && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200">
          <div className="flex items-center justify-around py-1">
            {navItems.map((item) => {
              const isActive = activePage === item.id
              return (
                <motion.button
                  key={item.id}
                  className={'nav-item ' + (isActive ? 'active' : '')}
                  onClick={() => setActivePage(item.id)}
                  whileTap={{ scale: 0.9 }}
                >
                  {item.id === 'create' ? (
                    <div className="w-10 h-10 rounded-full bg-of-blue flex items-center justify-center">
                      <item.icon className="w-5 h-5 text-white" />
                    </div>
                  ) : (
                    <item.icon className="w-6 h-6" />
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

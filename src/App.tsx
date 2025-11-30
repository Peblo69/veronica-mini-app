import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, Bell, PlusSquare, MessageCircle, User } from 'lucide-react'
import './index.css'

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
  const [user, setUser] = useState({
    id: 1,
    name: 'User',
    username: 'user',
    avatar: null as string | null,
    tokens: 100,
    isCreator: false,
  })

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
      if (tg.initDataUnsafe?.user) {
        setUser(prev => ({
          ...prev,
          name: tg.initDataUnsafe.user.first_name || 'User',
          username: tg.initDataUnsafe.user.username || 'user',
          avatar: tg.initDataUnsafe.user.photo_url || null,
        }))
      }
    }
  }, [])

  const openCreatorProfile = (creator: any) => {
    setViewingCreator(creator)
  }

  const closeCreatorProfile = () => {
    setViewingCreator(null)
  }

  const renderPage = () => {
    if (viewingCreator) {
      return <CreatorProfilePage creator={viewingCreator} onBack={closeCreatorProfile} />
    }
    
    switch (activePage) {
      case 'home': return <HomePage onCreatorClick={openCreatorProfile} />
      case 'notifications': return <NotificationsPage />
      case 'create': return <CreatePage user={user} />
      case 'messages': return <MessagesPage />
      case 'profile': return <ProfilePage user={user} />
      default: return <HomePage onCreatorClick={openCreatorProfile} />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-of-blue text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold">Veronica</h1>
          <div className="flex items-center gap-2">
            <span className="text-sm opacity-90">{user.tokens} tokens</span>
          </div>
        </div>
      </header>

      {/* Main content */}
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

      {/* Bottom navigation */}
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

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, Image, Sparkles, Mic, User, Coins, Zap } from 'lucide-react'
import './index.css'

import HomePage from './pages/HomePage'
import GalleryPage from './pages/GalleryPage'
import CreatePage from './pages/CreatePage'
import VoicePage from './pages/VoicePage'
import ProfilePage from './pages/ProfilePage'

const navItems = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'gallery', icon: Image, label: 'Gallery' },
  { id: 'create', icon: Sparkles, label: 'Create' },
  { id: 'voice', icon: Mic, label: 'Voice' },
  { id: 'profile', icon: User, label: 'Profile' },
]

function Particles() {
  const particles = []
  for (let i = 0; i < 20; i++) {
    particles.push(
      <div
        key={i}
        className="particle"
        style={{
          left: (Math.random() * 100) + '%',
          animationDelay: (Math.random() * 15) + 's',
          animationDuration: (15 + Math.random() * 10) + 's',
        }}
      />
    )
  }
  return <div className="particles">{particles}</div>
}

function App() {
  const [activePage, setActivePage] = useState('home')
  const [user, setUser] = useState({
    name: 'User',
    tokens: 100,
    avatar: null as string | null,
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
          avatar: tg.initDataUnsafe.user.photo_url || null,
        }))
      }
      if (tg.themeParams) {
        document.documentElement.style.setProperty('--tg-theme-bg-color', tg.themeParams.bg_color || '#1a1a2e')
        document.documentElement.style.setProperty('--tg-theme-text-color', tg.themeParams.text_color || '#ffffff')
      }
    }
  }, [])

  const renderPage = () => {
    switch (activePage) {
      case 'home': return <HomePage user={user} setActivePage={setActivePage} />
      case 'gallery': return <GalleryPage />
      case 'create': return <CreatePage user={user} setUser={setUser} />
      case 'voice': return <VoicePage />
      case 'profile': return <ProfilePage user={user} />
      default: return <HomePage user={user} setActivePage={setActivePage} />
    }
  }

  return (
    <div className="min-h-screen bg-gradient-dark relative">
      <Particles />
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-purple/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-brand-pink/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <header className="fixed top-0 left-0 right-0 z-50 glass-strong">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-brand flex items-center justify-center glow-purple">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold gradient-text">Veronica AI</h1>
              <p className="text-xs text-white/50">Your AI Assistant</p>
            </div>
          </div>
          <motion.div className="flex items-center gap-1 px-3 py-1.5 rounded-full glass" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Coins className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-semibold">{user.tokens}</span>
          </motion.div>
        </div>
      </header>

      <main className="pt-20 pb-24 px-4 relative z-10">
        <AnimatePresence mode="wait">
          <motion.div key={activePage} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.3 }}>
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 glass-strong">
        <div className="flex items-center justify-around px-2 py-2">
          {navItems.map((item) => {
            const isActive = activePage === item.id
            return (
              <motion.button
                key={item.id}
                className={'nav-item flex-1' + (isActive ? ' active' : '')}
                onClick={() => setActivePage(item.id)}
                whileTap={{ scale: 0.9 }}
              >
                <item.icon className={'w-5 h-5 ' + (isActive ? 'text-brand-purple' : 'text-white/50')} />
                <span className={'text-xs ' + (isActive ? 'text-white font-semibold' : 'text-white/50')}>{item.label}</span>
              </motion.button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

export default App

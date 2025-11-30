import { motion } from 'framer-motion'
import { Coins, Image, Star, Settings, ChevronRight, Crown, Zap, TrendingUp } from 'lucide-react'

interface ProfilePageProps {
  user: { name: string; tokens: number; avatar: string | null }
}

const stats = [
  { label: 'Images', value: 42, icon: Image },
  { label: 'Tokens Used', value: '1.2K', icon: Zap },
  { label: 'Rank', value: '#156', icon: TrendingUp },
]

const menuItems = [
  { icon: Coins, label: 'Buy Tokens', badge: 'Sale!', color: 'text-yellow-400' },
  { icon: Crown, label: 'Premium', badge: 'New', color: 'text-purple-400' },
  { icon: Star, label: 'Favorites', count: 12, color: 'text-pink-400' },
  { icon: Settings, label: 'Settings', color: 'text-white/70' },
]

export default function ProfilePage({ user }: ProfilePageProps) {
  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <motion.div 
        className="card text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <motion.div 
          className="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-brand flex items-center justify-center glow-purple text-3xl font-bold"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 3, repeat: Infinity }}
        >
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-full h-full rounded-full object-cover" />
          ) : (
            user.name.charAt(0).toUpperCase()
          )}
        </motion.div>
        
        <h2 className="text-xl font-bold mb-1">{user.name}</h2>
        <p className="text-white/50 text-sm mb-4">AI Art Creator</p>
        
        <div className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-brand rounded-full inline-flex">
          <Coins className="w-4 h-4 text-yellow-300" />
          <span className="font-semibold">{user.tokens} tokens</span>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            className="card text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <stat.icon className="w-5 h-5 mx-auto mb-2 text-brand-purple" />
            <div className="text-lg font-bold">{stat.value}</div>
            <div className="text-xs text-white/50">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Menu Items */}
      <div className="space-y-2">
        {menuItems.map((item, index) => (
          <motion.button
            key={item.label}
            className="card w-full flex items-center justify-between"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + index * 0.1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-center gap-3">
              <item.icon className={"w-5 h-5 " + item.color} />
              <span>{item.label}</span>
            </div>
            <div className="flex items-center gap-2">
              {item.badge && (
                <span className="badge badge-pink">{item.badge}</span>
              )}
              {item.count !== undefined && (
                <span className="text-white/50">{item.count}</span>
              )}
              <ChevronRight className="w-4 h-4 text-white/30" />
            </div>
          </motion.button>
        ))}
      </div>

      {/* Promo Banner */}
      <motion.div
        className="relative overflow-hidden rounded-2xl p-6 bg-gradient-brand"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
      >
        <div className="relative z-10">
          <h3 className="text-lg font-bold mb-2">Upgrade to Premium</h3>
          <p className="text-sm text-white/80 mb-4">Unlimited generations, exclusive styles, and more!</p>
          <motion.button 
            className="px-6 py-2 bg-white text-brand-purple font-semibold rounded-xl"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Learn More
          </motion.button>
        </div>
        <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full" />
        <div className="absolute -right-5 -top-10 w-20 h-20 bg-white/10 rounded-full" />
      </motion.div>
    </div>
  )
}

import { motion } from 'framer-motion'
import { Image, Video, Mic, MessageCircle, Sparkles, ArrowRight } from 'lucide-react'

interface HomePageProps {
  user: { name: string; tokens: number; avatar: string | null }
  setActivePage: (page: string) => void
}

const features = [
  { id: 'image', icon: Image, title: 'Generate Images', desc: 'Create stunning AI art', color: 'from-purple-500 to-pink-500', page: 'create' },
  { id: 'video', icon: Video, title: 'Generate Videos', desc: 'Bring images to life', color: 'from-blue-500 to-cyan-500', page: 'create' },
  { id: 'voice', icon: Mic, title: 'Voice Chat', desc: 'Talk with AI', color: 'from-pink-500 to-orange-500', page: 'voice' },
  { id: 'chat', icon: MessageCircle, title: 'AI Chat', desc: 'Intelligent conversations', color: 'from-green-500 to-teal-500', page: 'home' },
]

export default function HomePage({ user, setActivePage }: HomePageProps) {
  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <motion.div 
        className="text-center py-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <motion.div 
          className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-brand flex items-center justify-center glow-purple"
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Sparkles className="w-10 h-10 text-white" />
        </motion.div>
        <h2 className="text-2xl font-bold mb-2">Welcome, {user.name}!</h2>
        <p className="text-white/60">What would you like to create today?</p>
      </motion.div>

      {/* Feature Grid */}
      <div className="grid grid-cols-2 gap-4">
        {features.map((feature, index) => (
          <motion.button
            key={feature.id}
            className="card card-hover text-left"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => setActivePage(feature.page)}
          >
            <div className={"w-12 h-12 rounded-xl bg-gradient-to-br " + feature.color + " flex items-center justify-center mb-3"}>
              <feature.icon className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-semibold mb-1">{feature.title}</h3>
            <p className="text-sm text-white/50">{feature.desc}</p>
          </motion.button>
        ))}
      </div>

      {/* Quick Actions */}
      <motion.div 
        className="card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Explore Gallery</h3>
            <p className="text-sm text-white/50">See what others created</p>
          </div>
          <motion.button 
            className="btn-primary flex items-center gap-2"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setActivePage('gallery')}
          >
            <span>View</span>
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </div>
      </motion.div>
    </div>
  )
}

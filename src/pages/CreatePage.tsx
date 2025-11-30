import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Image, Video, Wand2, Loader2, Download, RefreshCw, Palette, Camera, Zap, Sparkles, Mountain, Circle } from 'lucide-react'

interface CreatePageProps {
  user: { name: string; tokens: number; avatar: string | null }
  setUser: (user: any) => void
}

const stylePresets = [
  { id: 'anime', name: 'Anime', icon: Palette },
  { id: 'realistic', name: 'Realistic', icon: Camera },
  { id: 'cyberpunk', name: 'Cyberpunk', icon: Zap },
  { id: 'fantasy', name: 'Fantasy', icon: Sparkles },
  { id: 'abstract', name: 'Abstract', icon: Mountain },
  { id: 'minimal', name: 'Minimal', icon: Circle },
]

export default function CreatePage({ user, setUser }: CreatePageProps) {
  const [mode, setMode] = useState<'image' | 'video'>('image')
  const [prompt, setPrompt] = useState('')
  const [selectedStyle, setSelectedStyle] = useState('realistic')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedImage, setGeneratedImage] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return
    
    setIsGenerating(true)
    setGeneratedImage(null)
    
    // Simulate generation
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Mock result
    setGeneratedImage('https://picsum.photos/512/512?random=' + Date.now())
    setIsGenerating(false)
    
    // Deduct tokens
    setUser({ ...user, tokens: user.tokens - 10 })
  }

  return (
    <div className="space-y-6">
      {/* Mode Toggle */}
      <div className="flex gap-2 p-1 bg-white/5 rounded-xl">
        <button
          className={"flex-1 flex items-center justify-center gap-2 py-3 rounded-lg transition-all " + (mode === 'image' ? 'bg-gradient-brand text-white' : 'text-white/50')}
          onClick={() => setMode('image')}
        >
          <Image className="w-5 h-5" />
          <span>Image</span>
        </button>
        <button
          className={"flex-1 flex items-center justify-center gap-2 py-3 rounded-lg transition-all " + (mode === 'video' ? 'bg-gradient-brand text-white' : 'text-white/50')}
          onClick={() => setMode('video')}
        >
          <Video className="w-5 h-5" />
          <span>Video</span>
        </button>
      </div>

      {/* Prompt Input */}
      <div className="space-y-2">
        <label className="text-sm text-white/70">Describe your vision</label>
        <textarea
          className="input-field min-h-[100px] resize-none"
          placeholder="A majestic dragon flying over crystal mountains at sunset..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>

      {/* Style Presets */}
      <div className="space-y-2">
        <label className="text-sm text-white/70">Style</label>
        <div className="flex flex-wrap gap-2">
          {stylePresets.map((style) => (
            <motion.button
              key={style.id}
              className={"px-4 py-2 rounded-xl flex items-center gap-2 transition-all " + (selectedStyle === style.id ? 'bg-gradient-brand' : 'bg-white/5 hover:bg-white/10')}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedStyle(style.id)}
            >
              <style.icon className="w-4 h-4" />
              <span className="text-sm">{style.name}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Generate Button */}
      <motion.button
        className="btn-primary w-full flex items-center justify-center gap-2"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleGenerate}
        disabled={isGenerating || !prompt.trim()}
      >
        {isGenerating ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Creating magic...</span>
          </>
        ) : (
          <>
            <Wand2 className="w-5 h-5" />
            <span>Generate ({mode === 'image' ? 10 : 50} tokens)</span>
          </>
        )}
      </motion.button>

      {/* Result */}
      <AnimatePresence>
        {(isGenerating || generatedImage) && (
          <motion.div
            className="card"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
          >
            {isGenerating ? (
              <div className="aspect-square rounded-xl bg-white/5 flex items-center justify-center">
                <div className="text-center">
                  <motion.div
                    className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-brand"
                    animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <p className="text-white/70">Generating your masterpiece...</p>
                </div>
              </div>
            ) : generatedImage && (
              <div className="space-y-4">
                <img 
                  src={generatedImage} 
                  alt="Generated" 
                  className="w-full rounded-xl" 
                />
                <div className="flex gap-2">
                  <motion.button 
                    className="btn-secondary flex-1 flex items-center justify-center gap-2"
                    whileTap={{ scale: 0.95 }}
                    onClick={handleGenerate}
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Regenerate</span>
                  </motion.button>
                  <motion.button 
                    className="btn-primary flex-1 flex items-center justify-center gap-2"
                    whileTap={{ scale: 0.95 }}
                  >
                    <Download className="w-4 h-4" />
                    <span>Save</span>
                  </motion.button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

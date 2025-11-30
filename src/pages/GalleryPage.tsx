import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, Download, Share2, X, Sparkles } from 'lucide-react'

// Mock gallery data
const mockImages = [
  { id: 1, url: 'https://picsum.photos/400/400?random=1', prompt: 'Cyberpunk city at night', likes: 234, liked: false },
  { id: 2, url: 'https://picsum.photos/400/500?random=2', prompt: 'Ethereal forest spirit', likes: 189, liked: true },
  { id: 3, url: 'https://picsum.photos/400/350?random=3', prompt: 'Neon samurai warrior', likes: 456, liked: false },
  { id: 4, url: 'https://picsum.photos/400/450?random=4', prompt: 'Space whale swimming', likes: 321, liked: false },
  { id: 5, url: 'https://picsum.photos/400/380?random=5', prompt: 'Crystal dragon', likes: 567, liked: true },
  { id: 6, url: 'https://picsum.photos/400/420?random=6', prompt: 'Underwater temple', likes: 234, liked: false },
]

export default function GalleryPage() {
  const [images, setImages] = useState(mockImages)
  const [selectedImage, setSelectedImage] = useState<typeof mockImages[0] | null>(null)

  const toggleLike = (id: number) => {
    setImages(images.map(img => 
      img.id === id 
        ? { ...img, liked: !img.liked, likes: img.liked ? img.likes - 1 : img.likes + 1 }
        : img
    ))
    if (selectedImage && selectedImage.id === id) {
      setSelectedImage(prev => prev ? { ...prev, liked: !prev.liked, likes: prev.liked ? prev.likes - 1 : prev.likes + 1 } : null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Community Gallery</h2>
          <p className="text-sm text-white/50">Explore AI creations</p>
        </div>
        <div className="badge badge-purple flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          <span>{images.length} works</span>
        </div>
      </div>

      {/* Masonry Grid */}
      <div className="columns-2 gap-3 space-y-3">
        {images.map((image, index) => (
          <motion.div
            key={image.id}
            className="break-inside-avoid"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <motion.div
              className="relative rounded-2xl overflow-hidden cursor-pointer group"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedImage(image)}
            >
              <img src={image.url} alt={image.prompt} className="w-full" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-sm line-clamp-2">{image.prompt}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleLike(image.id) }}
                      className="flex items-center gap-1"
                    >
                      <Heart className={"w-4 h-4 " + (image.liked ? 'fill-red-500 text-red-500' : '')} />
                      <span className="text-xs">{image.likes}</span>
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ))}
      </div>

      {/* Image Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedImage(null)}
          >
            <motion.div
              className="relative max-w-lg w-full"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="absolute -top-12 right-0 p-2 text-white/70 hover:text-white"
                onClick={() => setSelectedImage(null)}
              >
                <X className="w-6 h-6" />
              </button>
              
              <img 
                src={selectedImage.url} 
                alt={selectedImage.prompt} 
                className="w-full rounded-2xl" 
              />
              
              <div className="mt-4 glass rounded-xl p-4">
                <p className="text-sm mb-4">{selectedImage.prompt}</p>
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => toggleLike(selectedImage.id)}
                    className={"flex items-center gap-2 px-4 py-2 rounded-xl transition-colors " + (selectedImage.liked ? 'bg-red-500/20 text-red-400' : 'bg-white/10')}
                  >
                    <Heart className={"w-5 h-5 " + (selectedImage.liked ? 'fill-current' : '')} />
                    <span>{selectedImage.likes}</span>
                  </button>
                  <div className="flex gap-2">
                    <button className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                      <Download className="w-5 h-5" />
                    </button>
                    <button className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                      <Share2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

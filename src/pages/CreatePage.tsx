import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Image, Video, Lock, Globe, Send, Loader2, DollarSign, X, Play, Star, ArrowRight, ArrowLeft, Plus, Sparkles, Megaphone, Sliders, Wand2 } from 'lucide-react'
import { createPost, type User, type CreatePostData } from '../lib/api'
import { uploadPostMedia, getMediaType, compressImage, generateVideoThumbnailFile, uploadVideoThumbnail } from '../lib/storage'
import { getUserSettings } from '../lib/settingsApi'

interface CreatePageProps {
  user: User
  onBecomeCreator?: () => void
}

type Visibility = 'public' | 'followers' | 'subscribers'
type Step = 'select' | 'edit' | 'details'

interface MediaFile {
  file: File
  preview: string
  type: 'image' | 'video'
  thumbnail?: {
    file: File | null
    preview?: string
  }
  filters?: {
    brightness: number
    contrast: number
    saturation: number
    blur: number
  }
}

const SphereAnimation = ({ onClick }: { onClick: () => void }) => {
  return (
    <div className="relative w-64 h-64 flex items-center justify-center cursor-pointer" onClick={onClick}>
      {/* Animated Orbits */}
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full border border-blue-500/30"
          style={{
            borderWidth: '1px',
            rotateX: 60 + i * 10,
            rotateY: i * 30,
          }}
          animate={{
            rotateZ: [0, 360],
            scale: [1, 1.1, 1],
          }}
          transition={{
            rotateZ: { duration: 8 + i * 2, repeat: Infinity, ease: "linear" },
            scale: { duration: 4, repeat: Infinity, ease: "easeInOut" }
          }}
        />
      ))}
      
      {/* Core Sphere */}
      <motion.div
        className="absolute w-32 h-32 rounded-full bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 blur-md"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.6, 0.8, 0.6],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      />
      
      {/* Floating Particles */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={`p-${i}`}
          className="absolute w-2 h-2 bg-white rounded-full blur-[1px]"
          initial={{ x: 0, y: 0 }}
          animate={{
            x: Math.cos(i * 60) * 80,
            y: Math.sin(i * 60) * 80,
            opacity: [0, 1, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            delay: i * 0.5,
            ease: "easeInOut"
          }}
        />
      ))}

      {/* Plus Button */}
      <motion.div
        className="relative z-10 w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.5)]"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <Plus className="w-8 h-8 text-black" strokeWidth={3} />
      </motion.div>
    </div>
  )
}

export default function CreatePage({ user }: CreatePageProps) {
  const [step, setStep] = useState<Step>('select')
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [defaultVisibility, setDefaultVisibility] = useState<Visibility>('public')
  const [isNsfw, setIsNsfw] = useState(false)
  const [unlockPrice, setUnlockPrice] = useState('')
  const [isLocked, setIsLocked] = useState(false)
  const [isAdvertisement, setIsAdvertisement] = useState(false)
  const [posting, setPosting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0)

  const [filters, setFilters] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    blur: 0
  })

  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const isCreator = user.is_creator

  useEffect(() => {
    let mounted = true
    if (!isCreator) {
      setDefaultVisibility('public')
      setVisibility('public')
      return
    }
    getUserSettings(user.telegram_id)
      .then((userSettings) => {
        if (!mounted || !userSettings) return
        const pref = (userSettings.default_post_visibility as Visibility) || 'public'
        setDefaultVisibility(pref)
        setVisibility(pref)
      })
      .catch(() => {
        if (!mounted) return
        setDefaultVisibility('public')
        setVisibility('public')
      })
    return () => { mounted = false }
  }, [user.telegram_id, isCreator])

  useEffect(() => {
    if (mediaFiles[currentMediaIndex]?.filters) {
      setFilters(mediaFiles[currentMediaIndex].filters!)
    } else {
      setFilters({ brightness: 100, contrast: 100, saturation: 100, blur: 0 })
    }
  }, [currentMediaIndex, mediaFiles])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, _type: 'image' | 'video') => {
    const files = e.target.files
    if (!files) return

    const newFiles: MediaFile[] = []
    for (const file of Array.from(files)) {
      const mediaType = getMediaType(file)
      if (mediaType === 'unknown') continue

      const preview = URL.createObjectURL(file)
      let thumbnail: MediaFile['thumbnail']

      if (mediaType === 'video') {
        const thumbFile = await generateVideoThumbnailFile(file)
        if (thumbFile) {
          thumbnail = { file: thumbFile, preview: URL.createObjectURL(thumbFile) }
        }
      }

      newFiles.push({
        file,
        preview,
        type: mediaType as 'image' | 'video',
        thumbnail,
        filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0 }
      })
    }

    setMediaFiles(prev => [...prev, ...newFiles].slice(0, 10))
    setStep('edit')
    e.target.value = ''
  }

  const applyFiltersToMedia = () => {
    setMediaFiles(prev => {
      const updated = [...prev]
      if (updated[currentMediaIndex]) {
        updated[currentMediaIndex].filters = { ...filters }
      }
      return updated
    })
  }

  const handleNext = () => {
    applyFiltersToMedia()
    setStep('details')
  }

  const processImageWithFilters = async (mediaFile: MediaFile): Promise<File> => {
    if (mediaFile.type !== 'image' || !mediaFile.filters) return mediaFile.file
    const { brightness, contrast, saturation, blur } = mediaFile.filters
    
    if (brightness === 100 && contrast === 100 && saturation === 100 && blur === 0) return mediaFile.file

    return new Promise((resolve) => {
      const img = document.createElement('img')
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(mediaFile.file)
          return
        }
        
        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${blur}px)`
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        
        canvas.toBlob((blob) => {
          if (blob) {
            const processedFile = new File([blob], mediaFile.file.name, { type: mediaFile.file.type })
            resolve(processedFile)
          } else {
            resolve(mediaFile.file)
          }
        }, mediaFile.file.type, 0.95)
      }
      img.onerror = () => resolve(mediaFile.file)
      img.src = mediaFile.preview
    })
  }

  const handlePost = async () => {
    if ((!content.trim() && mediaFiles.length === 0) || posting) return

    setPosting(true)
    setUploadProgress('Preparing...')

    try {
      const mediaUrls: string[] = []
      const thumbnailUrls: (string | null)[] = []

      if (mediaFiles.length > 0) {
        for (let i = 0; i < mediaFiles.length; i++) {
          const mediaFile = mediaFiles[i]
          setUploadProgress(`Processing ${i + 1}/${mediaFiles.length}...`)

          let fileToUpload = mediaFile.file
          
          if (mediaFile.type === 'image') {
             fileToUpload = await processImageWithFilters(mediaFile)
             setUploadProgress(`Compressing ${i + 1}/${mediaFiles.length}...`)
             fileToUpload = await compressImage(fileToUpload)
          }

          setUploadProgress(`Uploading ${i + 1}/${mediaFiles.length}...`)
          const result = await uploadPostMedia(fileToUpload, user.telegram_id)

          if (result.error) {
            alert('Upload failed: ' + result.error)
            setPosting(false)
            setUploadProgress('')
            return
          }

          if (result.url) mediaUrls.push(result.url)

          if (mediaFile.type === 'video') {
            let thumbnailFile = mediaFile.thumbnail?.file
            if (!thumbnailFile) thumbnailFile = await generateVideoThumbnailFile(mediaFile.file)
            
            let thumbnailUrl: string | null = null
            if (thumbnailFile) {
              const thumbUpload = await uploadVideoThumbnail(thumbnailFile, user.telegram_id)
              if (!thumbUpload.error) thumbnailUrl = thumbUpload.url
            }
            thumbnailUrls.push(thumbnailUrl)
          } else {
            thumbnailUrls.push(null)
          }
        }
      }

      setUploadProgress('Creating post...')
      const finalVisibility = isCreator ? visibility : 'public'
      const finalNsfw = isCreator ? isNsfw : false
      const finalPrice = isCreator && isLocked ? parseFloat(unlockPrice) || 0 : 0

      const hasMedia = mediaUrls.length > 0
      const hasVideo = mediaFiles.some(file => file.type === 'video')
      const primaryMediaType = hasMedia ? (hasVideo ? 'video' : 'image') : 'text'
      
      const postPayload: CreatePostData = {
        content: content.trim(),
        media_url: hasMedia ? mediaUrls[0] : undefined,
        media_urls: hasMedia ? mediaUrls : undefined,
        media_type: primaryMediaType,
        visibility: finalVisibility,
        is_nsfw: finalNsfw,
        unlock_price: finalPrice,
      }

      const normalizedThumbnailUrls = thumbnailUrls.map(url => url || null)
      const firstVideoThumbnail = normalizedThumbnailUrls.find(url => !!url)
      if (firstVideoThumbnail) {
        postPayload.media_thumbnail_url = firstVideoThumbnail
        postPayload.media_thumbnail_urls = normalizedThumbnailUrls
      }

      const { error } = await createPost(user.telegram_id, postPayload)

      if (error) {
        alert(`Failed to create post: ${error.message || 'Please try again.'}`)
      } else {
        setSuccess(true)
        setContent('')
        setVisibility(defaultVisibility)
        setIsNsfw(false)
        setUnlockPrice('')
        setIsLocked(false)
        setIsAdvertisement(false)
        setStep('select')
        mediaFiles.forEach(m => {
          URL.revokeObjectURL(m.preview)
          if (m.thumbnail?.preview) URL.revokeObjectURL(m.thumbnail.preview)
        })
        setMediaFiles([])
        setTimeout(() => setSuccess(false), 2000)
      }
    } catch (err) {
      console.error('Post error:', err)
      alert('Something went wrong')
    }

    setPosting(false)
    setUploadProgress('')
  }

  const removeMedia = (index: number) => {
    setMediaFiles(prev => {
      const newFiles = [...prev]
      URL.revokeObjectURL(newFiles[index].preview)
      if (newFiles[index].thumbnail?.preview) URL.revokeObjectURL(newFiles[index].thumbnail.preview)
      newFiles.splice(index, 1)
      return newFiles
    })
    if (mediaFiles.length <= 1) setStep('select')
    else if (currentMediaIndex >= index && currentMediaIndex > 0) setCurrentMediaIndex(c => c - 1)
  }

  const FilterSlider = ({ label, value, onChange, min = 0, max = 200 }: { label: string, value: number, onChange: (val: number) => void, min?: number, max?: number }) => (
    <div className="space-y-2">
      <div className="flex justify-between text-xs font-medium text-gray-400 uppercase tracking-wider">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="relative h-8 flex items-center">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white hover:accent-blue-400 transition-all"
        />
      </div>
    </div>
  )

  return (
    <div className="relative min-h-screen bg-black text-white overflow-hidden flex flex-col font-sans">
      {/* Space Background */}
      <div className="fixed inset-0 pointer-events-none">
         <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#121212] via-[#000] to-[#000]" />
         <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 mix-blend-overlay" />
      </div>

      {/* Header */}
      <div className="relative z-20 flex items-center justify-between px-6 pt-6 pb-4">
        {step !== 'select' ? (
          <button 
             onClick={() => {
               if (step === 'details') setStep('edit')
               else if (step === 'edit') setStep('select')
             }}
             className="p-2.5 bg-white/5 rounded-full hover:bg-white/10 transition-colors backdrop-blur-md border border-white/5"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        ) : <div className="w-10" />}
        
        <AnimatePresence mode="wait">
          <motion.h2 
            key={step}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="text-lg font-bold tracking-widest uppercase text-white/90"
          >
            {step === 'select' ? 'Create' : step === 'edit' ? 'Enhance' : 'Publish'}
          </motion.h2>
        </AnimatePresence>

        <div className="w-10" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative z-10 flex flex-col overflow-y-auto">
        <AnimatePresence mode="wait">
          {step === 'select' && (
            <motion.div 
              key="select"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center p-6 gap-12 relative"
            >
               {/* 3D Sphere Animation Trigger */}
               <SphereAnimation onClick={() => imageInputRef.current?.click()} />

               <div className="flex gap-6 mt-8">
                 <button 
                   onClick={() => imageInputRef.current?.click()}
                   className="group flex flex-col items-center gap-3 px-6 py-4 bg-white/5 border border-white/5 rounded-3xl hover:bg-white/10 transition-all active:scale-95 w-32 backdrop-blur-sm"
                 >
                   <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center group-hover:from-blue-500/30 group-hover:to-cyan-500/30 transition-colors">
                     <Image className="w-6 h-6 text-blue-400" />
                   </div>
                   <span className="text-sm font-medium text-white/70 group-hover:text-white">Photo</span>
                 </button>

                 <button 
                   onClick={() => videoInputRef.current?.click()}
                   className="group flex flex-col items-center gap-3 px-6 py-4 bg-white/5 border border-white/5 rounded-3xl hover:bg-white/10 transition-all active:scale-95 w-32 backdrop-blur-sm"
                 >
                   <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center group-hover:from-purple-500/30 group-hover:to-pink-500/30 transition-colors">
                     <Video className="w-6 h-6 text-purple-400" />
                   </div>
                   <span className="text-sm font-medium text-white/70 group-hover:text-white">Video</span>
                 </button>
               </div>
            </motion.div>
          )}

          {step === 'edit' && mediaFiles.length > 0 && (
            <motion.div
              key="edit"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="flex-1 flex flex-col p-5 gap-6"
            >
              {/* Media Preview - Cinematic */}
              <div className="relative flex-1 rounded-[2rem] overflow-hidden bg-[#0a0a0a] shadow-2xl border border-white/5">
                 {mediaFiles[currentMediaIndex].type === 'image' ? (
                   <img 
                     src={mediaFiles[currentMediaIndex].preview} 
                     className="w-full h-full object-contain transition-all duration-200" 
                     style={{ 
                       filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%) blur(${filters.blur}px)` 
                     }}
                     alt="preview" 
                   />
                 ) : (
                   <div className="relative w-full h-full flex items-center justify-center bg-black/40">
                     <img 
                       src={mediaFiles[currentMediaIndex].thumbnail?.preview || mediaFiles[currentMediaIndex].preview} 
                       className="w-full h-full object-contain opacity-60" 
                       alt="video preview"
                     />
                     <div className="absolute w-20 h-20 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-md border border-white/20">
                        <Play className="w-8 h-8 text-white fill-white" />
                     </div>
                   </div>
                 )}
                 
                 {/* Indicators */}
                 {mediaFiles.length > 1 && (
                   <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2 z-20">
                     {mediaFiles.map((_, idx) => (
                       <motion.div 
                         key={idx}
                         animate={{ 
                           width: idx === currentMediaIndex ? 24 : 8,
                           backgroundColor: idx === currentMediaIndex ? '#fff' : 'rgba(255,255,255,0.3)'
                         }}
                         className="h-2 rounded-full"
                       />
                     ))}
                   </div>
                 )}
              </div>

              {/* Advanced Controls */}
              <div className="bg-[#111] rounded-[2rem] p-6 border border-white/5 shadow-lg">
                 {mediaFiles[currentMediaIndex].type === 'image' ? (
                   <div className="space-y-6">
                     <div className="flex items-center gap-2 text-white/50 text-sm mb-4">
                       <Sliders className="w-4 h-4" />
                       <span className="uppercase tracking-wider font-bold">Adjustments</span>
                     </div>
                     
                     <FilterSlider 
                       label="Brightness" 
                       value={filters.brightness} 
                       onChange={(v) => setFilters(p => ({ ...p, brightness: v }))} 
                     />
                     <FilterSlider 
                       label="Contrast" 
                       value={filters.contrast} 
                       onChange={(v) => setFilters(p => ({ ...p, contrast: v }))} 
                     />
                     <FilterSlider 
                       label="Saturation" 
                       value={filters.saturation} 
                       onChange={(v) => setFilters(p => ({ ...p, saturation: v }))} 
                     />
                     <FilterSlider 
                       label="Blur" 
                       value={filters.blur} 
                       max={20}
                       onChange={(v) => setFilters(p => ({ ...p, blur: v }))} 
                     />
                   </div>
                 ) : (
                   <div className="text-center text-gray-500 py-12 flex flex-col items-center gap-3">
                     <Wand2 className="w-8 h-8 opacity-50" />
                     <p>Video enhancements coming soon.</p>
                   </div>
                 )}

                 <div className="flex items-center gap-4 mt-8 pt-6 border-t border-white/5">
                   <button 
                     onClick={() => removeMedia(currentMediaIndex)} 
                     className="p-4 rounded-2xl bg-white/5 text-white/60 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                   >
                     <X className="w-6 h-6" />
                   </button>
                   <button 
                     onClick={handleNext} 
                     className="flex-1 py-4 bg-white text-black rounded-2xl font-bold text-lg shadow-[0_0_20px_rgba(255,255,255,0.3)] hover:shadow-[0_0_30px_rgba(255,255,255,0.5)] transition-all active:scale-95 flex items-center justify-center gap-2"
                   >
                     Next Step <ArrowRight className="w-5 h-5" />
                   </button>
                 </div>
              </div>
            </motion.div>
          )}

          {step === 'details' && (
            <motion.div
              key="details"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="flex-1 flex flex-col p-6 gap-6"
            >
               {/* Caption Input */}
               <div className="bg-[#111] border border-white/5 rounded-[2rem] p-1 focus-within:border-white/20 transition-colors">
                 <textarea 
                   value={content}
                   onChange={(e) => setContent(e.target.value)}
                   placeholder="Write a stellar caption..."
                   className="w-full bg-transparent border-none text-white p-5 min-h-[140px] focus:ring-0 resize-none placeholder:text-white/30 text-lg leading-relaxed"
                 />
               </div>

               {/* Audience Selection */}
               <div className="space-y-3">
                 <p className="text-xs font-bold text-white/40 uppercase tracking-widest ml-2">Audience</p>
                 <div className="grid grid-cols-2 gap-3">
                   <button 
                     onClick={() => setVisibility('public')}
                     className={`p-4 rounded-2xl border flex flex-col items-center gap-3 transition-all duration-300 ${visibility === 'public' ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.3)]' : 'bg-[#111] border-white/5 text-white/40 hover:bg-white/5'}`}
                   >
                     <Globe className="w-6 h-6" />
                     <span className="font-medium">Everyone</span>
                   </button>
                   <button 
                     onClick={() => setVisibility('subscribers')}
                     className={`p-4 rounded-2xl border flex flex-col items-center gap-3 transition-all duration-300 ${visibility === 'subscribers' ? 'bg-purple-600 border-purple-500 text-white shadow-[0_0_20px_rgba(147,51,234,0.3)]' : 'bg-[#111] border-white/5 text-white/40 hover:bg-white/5'}`}
                   >
                     <Star className="w-6 h-6" />
                     <span className="font-medium">Fans Only</span>
                   </button>
                 </div>
               </div>

               {/* Toggles Section */}
               <div className="bg-[#111] border border-white/5 rounded-[2rem] p-6 space-y-8">
                  {/* Locked Content Toggle */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                          <Lock className="w-6 h-6 text-emerald-400" />
                        </div>
                        <div>
                          <p className="font-bold text-white text-lg">Locked Content</p>
                          <p className="text-xs text-white/40">Blur feed preview</p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={isLocked} onChange={(e) => setIsLocked(e.target.checked)} className="sr-only peer" />
                        <div className="w-14 h-8 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-emerald-500 transition-colors duration-300"></div>
                      </label>
                    </div>

                    <AnimatePresence>
                      {isLocked && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }} 
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="relative">
                            <DollarSign className="absolute left-5 top-1/2 -translate-y-1/2 text-white/70 w-5 h-5" />
                            <input 
                              type="number" 
                              value={unlockPrice}
                              onChange={(e) => setUnlockPrice(e.target.value)}
                              placeholder="Unlock price"
                              className="w-full bg-black/30 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white focus:border-emerald-500 focus:outline-none text-lg font-medium placeholder:text-white/20 transition-all"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="h-px bg-white/5 w-full" />

                  {/* Advertisement Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-pink-500/10 flex items-center justify-center border border-pink-500/20">
                        <Megaphone className="w-6 h-6 text-pink-400" />
                      </div>
                      <div>
                        <p className="font-bold text-white text-lg">Advertisement</p>
                        <p className="text-xs text-white/40">Promote post</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={isAdvertisement} onChange={(e) => setIsAdvertisement(e.target.checked)} className="sr-only peer" />
                      <div className="w-14 h-8 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-pink-500 transition-colors duration-300"></div>
                    </label>
                  </div>
               </div>

               <div className="mt-auto pt-4 pb-6">
                 <button 
                   onClick={handlePost}
                   disabled={posting}
                   className="relative w-full py-5 rounded-3xl bg-white text-black font-bold text-xl shadow-[0_0_40px_rgba(255,255,255,0.3)] disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group"
                 >
                   <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full group-hover:animate-shimmer" />
                   <span className="relative flex items-center justify-center gap-3">
                     {posting ? (
                       <>
                         <Loader2 className="w-6 h-6 animate-spin" />
                         <span>{uploadProgress || 'Publishing...'}</span>
                       </>
                     ) : (
                       <>
                         <Send className="w-6 h-6" />
                         <span>Post Now</span>
                       </>
                     )}
                   </span>
                 </button>
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Hidden Inputs */}
      <input type="file" ref={imageInputRef} accept="image/*" multiple className="hidden" onChange={(e) => handleFileSelect(e, 'image')} />
      <input type="file" ref={videoInputRef} accept="video/*" className="hidden" onChange={(e) => handleFileSelect(e, 'video')} />
      
      {/* Success Notification */}
      <AnimatePresence>
        {success && (
          <motion.div 
            initial={{ opacity: 0, y: 100 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: 100 }}
            className="fixed bottom-12 left-6 right-6 bg-white text-black p-4 rounded-3xl flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.3)] z-50 border-4 border-black/10"
          >
            <Sparkles className="w-6 h-6 mr-3 text-yellow-500 fill-yellow-500" />
            <span className="font-bold text-lg">Posted Successfully!</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

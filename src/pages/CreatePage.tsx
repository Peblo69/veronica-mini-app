import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Image, Video, Lock, Globe, Send, Loader2, DollarSign, X, Play, Star, ArrowLeft, Plus, Megaphone, Sliders } from 'lucide-react'
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

// Premium Monochrome Sphere
const MercurySphere = ({ onClick }: { onClick: () => void }) => {
  return (
    <div className="relative w-72 h-72 flex items-center justify-center cursor-pointer group" onClick={onClick}>
      {/* Outer Rings */}
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute inset-0 rounded-full border border-white/10"
          style={{
            borderWidth: '1px',
            rotateX: 60 + i * 10,
            rotateY: i * 30,
          }}
          animate={{
            rotateZ: [0, 360],
            scale: [1, 1.05, 1],
            opacity: [0.3, 0.6, 0.3]
          }}
          transition={{
            rotateZ: { duration: 15 + i * 5, repeat: Infinity, ease: "linear" },
            scale: { duration: 8, repeat: Infinity, ease: "easeInOut" },
            opacity: { duration: 4, repeat: Infinity, ease: "easeInOut" }
          }}
        />
      ))}
      
      {/* Core Liquid Metal Sphere */}
      <motion.div
        className="absolute w-32 h-32 rounded-full bg-gradient-to-b from-white/20 via-white/5 to-black backdrop-blur-md border border-white/10 shadow-[inset_0_0_20px_rgba(255,255,255,0.1)]"
        animate={{
          y: [0, -10, 0],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      >
        {/* Inner Glow */}
        <div className="absolute inset-0 rounded-full bg-white/5 blur-xl" />
      </motion.div>
      
      {/* Floating Particles - White/Grey */}
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={`p-${i}`}
          className="absolute w-1 h-1 bg-white/40 rounded-full"
          initial={{ x: 0, y: 0, opacity: 0 }}
          animate={{
            x: Math.cos(i * 45) * 100,
            y: Math.sin(i * 45) * 100,
            opacity: [0, 0.8, 0],
            scale: [0, 1, 0]
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            delay: i * 0.3,
            ease: "easeOut"
          }}
        />
      ))}

      {/* Center Plus */}
      <motion.div
        className="relative z-10 w-16 h-16 bg-white text-black rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.2)] group-hover:scale-110 transition-transform duration-500"
      >
        <Plus className="w-6 h-6" strokeWidth={2} />
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
  const [_uploadProgress, setUploadProgress] = useState('')
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

      setUploadProgress('Publishing...')
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
    <div className="space-y-3">
      <div className="flex justify-between text-[11px] font-bold text-white/40 uppercase tracking-widest">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="relative h-6 flex items-center group">
        <div className="absolute inset-0 bg-white/5 rounded-full h-1" />
        <div 
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-white/40 rounded-full transition-all duration-150" 
          style={{ width: `${((value - min) / (max - min)) * 100}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="relative w-full h-6 opacity-0 cursor-pointer z-10"
        />
        <div 
          className="absolute h-4 w-4 bg-white rounded-full shadow-lg top-1/2 -translate-y-1/2 pointer-events-none transition-all duration-150 group-hover:scale-110"
          style={{ left: `calc(${((value - min) / (max - min)) * 100}% - 8px)` }}
        />
      </div>
    </div>
  )

  return (
    <div className="relative min-h-screen bg-black text-white overflow-hidden flex flex-col font-sans selection:bg-white/20">
      {/* Premium Noise Texture */}
      <div className="fixed inset-0 pointer-events-none z-0">
         <div className="absolute inset-0 bg-[#050505]" />
         <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />
      </div>

      {/* Header */}
      <div className="relative z-20 flex items-center justify-between px-6 pt-6 pb-4">
        {step !== 'select' ? (
          <button 
             onClick={() => {
               if (step === 'details') setStep('edit')
               else if (step === 'edit') setStep('select')
             }}
             className="group p-3 rounded-full hover:bg-white/10 transition-all duration-300 border border-transparent hover:border-white/10"
          >
            <ArrowLeft className="w-5 h-5 text-white/70 group-hover:text-white transition-colors" />
          </button>
        ) : <div className="w-11" />}
        
        <AnimatePresence mode="wait">
          <motion.h2 
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="text-xs font-bold tracking-[0.3em] uppercase text-white/60"
          >
            {step === 'select' ? 'Create Post' : step === 'edit' ? 'Studio' : 'Publish'}
          </motion.h2>
        </AnimatePresence>

        <div className="w-11" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative z-10 flex flex-col overflow-y-auto scrollbar-none">
        <AnimatePresence mode="wait">
          {step === 'select' && (
            <motion.div 
              key="select"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
              className="flex-1 flex flex-col items-center justify-center p-6 gap-16"
            >
               {/* Mercury Sphere Trigger */}
               <div className="relative">
                 <MercurySphere onClick={() => imageInputRef.current?.click()} />
                 <p className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-white/30 text-xs tracking-[0.2em] uppercase font-medium whitespace-nowrap">
                   Tap to Upload
                 </p>
               </div>

               <div className="flex gap-4 w-full max-w-xs">
                 <button 
                   onClick={() => imageInputRef.current?.click()}
                   className="flex-1 group relative overflow-hidden bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition-all duration-500"
                 >
                   <div className="flex flex-col items-center gap-3 relative z-10">
                     <Image className="w-6 h-6 text-white/60 group-hover:text-white transition-colors" strokeWidth={1.5} />
                     <span className="text-xs font-bold text-white/40 group-hover:text-white tracking-widest uppercase transition-colors">Photo</span>
                   </div>
                 </button>

                 <button 
                   onClick={() => videoInputRef.current?.click()}
                   className="flex-1 group relative overflow-hidden bg-white/5 border border-white/10 rounded-2xl p-4 hover:bg-white/10 transition-all duration-500"
                 >
                   <div className="flex flex-col items-center gap-3 relative z-10">
                     <Video className="w-6 h-6 text-white/60 group-hover:text-white transition-colors" strokeWidth={1.5} />
                     <span className="text-xs font-bold text-white/40 group-hover:text-white tracking-widest uppercase transition-colors">Video</span>
                   </div>
                 </button>
               </div>
            </motion.div>
          )}

          {step === 'edit' && mediaFiles.length > 0 && (
            <motion.div
              key="edit"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 flex flex-col h-full"
            >
              {/* Media Preview Area */}
              <div className="flex-1 relative w-full bg-[#080808] flex items-center justify-center overflow-hidden group">
                 <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-black/40 via-transparent to-black/40 z-10" />
                 
                 {mediaFiles[currentMediaIndex].type === 'image' ? (
                   <img 
                     src={mediaFiles[currentMediaIndex].preview} 
                     className="max-w-full max-h-full object-contain transition-all duration-300" 
                     style={{ 
                       filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%) blur(${filters.blur}px)` 
                     }}
                     alt="preview" 
                   />
                 ) : (
                   <div className="relative w-full h-full flex items-center justify-center">
                     <img 
                       src={mediaFiles[currentMediaIndex].thumbnail?.preview || mediaFiles[currentMediaIndex].preview} 
                       className="max-w-full max-h-full object-contain opacity-50" 
                       alt="video preview"
                     />
                     <div className="absolute w-16 h-16 rounded-full border border-white/20 flex items-center justify-center backdrop-blur-sm">
                        <Play className="w-6 h-6 text-white ml-1" fill="white" />
                     </div>
                   </div>
                 )}
                 
                 {/* Pagination */}
                 {mediaFiles.length > 1 && (
                   <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-2 z-20">
                     {mediaFiles.map((_, idx) => (
                       <div 
                         key={idx}
                         className={`h-1 transition-all duration-300 rounded-full ${idx === currentMediaIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/20'}`}
                       />
                     ))}
                   </div>
                 )}
              </div>

              {/* Editor Panel - Slide Up */}
              <div className="bg-black border-t border-white/10 px-6 py-8 pb-10 space-y-8">
                 {mediaFiles[currentMediaIndex].type === 'image' ? (
                   <div className="space-y-6">
                     <div className="flex items-center gap-2 mb-2">
                       <Sliders className="w-4 h-4 text-white" />
                       <span className="text-xs font-bold uppercase tracking-widest text-white">Adjustments</span>
                     </div>
                     
                     <div className="grid grid-cols-1 gap-6">
                        <FilterSlider label="Brightness" value={filters.brightness} onChange={(v) => setFilters(p => ({ ...p, brightness: v }))} />
                        <FilterSlider label="Contrast" value={filters.contrast} onChange={(v) => setFilters(p => ({ ...p, contrast: v }))} />
                        <FilterSlider label="Saturation" value={filters.saturation} onChange={(v) => setFilters(p => ({ ...p, saturation: v }))} />
                     </div>
                   </div>
                 ) : (
                   <div className="py-8 text-center">
                     <p className="text-white/30 text-sm font-medium uppercase tracking-widest">Video editing unavailable</p>
                   </div>
                 )}

                 <div className="flex items-center gap-4 pt-2">
                   <button 
                     onClick={() => removeMedia(currentMediaIndex)} 
                     className="w-14 h-14 flex items-center justify-center rounded-full border border-white/10 text-white/40 hover:text-white hover:border-white/30 transition-all"
                   >
                     <X className="w-6 h-6" />
                   </button>
                   <button 
                     onClick={handleNext} 
                     className="flex-1 h-14 bg-white text-black rounded-full font-bold text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)]"
                   >
                     Continue
                   </button>
                 </div>
              </div>
            </motion.div>
          )}

          {step === 'details' && (
            <motion.div
              key="details"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col px-6 pt-4 pb-8"
            >
               {/* Clean Input */}
               <div className="mb-8">
                 <textarea 
                   value={content}
                   onChange={(e) => setContent(e.target.value)}
                   placeholder="Write a caption..."
                   className="w-full bg-transparent border-none text-white text-lg font-medium placeholder:text-white/20 focus:ring-0 resize-none min-h-[100px] p-0 leading-relaxed"
                 />
               </div>

               {/* Options Grid */}
               <div className="space-y-8">
                 {/* Visibility */}
                 <div className="space-y-4">
                   <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Audience</p>
                   <div className="grid grid-cols-2 gap-3">
                     <button 
                       onClick={() => setVisibility('public')}
                       className={`group p-4 rounded-2xl border transition-all duration-300 text-left ${
                         visibility === 'public' 
                           ? 'bg-white text-black border-white' 
                           : 'bg-white/5 border-white/5 text-white/40 hover:border-white/20 hover:text-white/60'
                       }`}
                     >
                       <Globe className={`w-5 h-5 mb-3 ${visibility === 'public' ? 'text-black' : 'text-white/40'}`} />
                       <p className="text-sm font-bold">Everyone</p>
                     </button>
                     <button 
                       onClick={() => setVisibility('subscribers')}
                       className={`group p-4 rounded-2xl border transition-all duration-300 text-left ${
                         visibility === 'subscribers' 
                           ? 'bg-white text-black border-white' 
                           : 'bg-white/5 border-white/5 text-white/40 hover:border-white/20 hover:text-white/60'
                       }`}
                     >
                       <Star className={`w-5 h-5 mb-3 ${visibility === 'subscribers' ? 'text-black' : 'text-white/40'}`} />
                       <p className="text-sm font-bold">Subscribers</p>
                     </button>
                   </div>
                 </div>

                 {/* Toggles */}
                 <div className="space-y-6">
                    {/* Locked Content */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between group cursor-pointer" onClick={() => setIsLocked(!isLocked)}>
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isLocked ? 'bg-white text-black' : 'bg-white/5 text-white/40'}`}>
                            <Lock className="w-4 h-4" />
                          </div>
                          <div>
                            <p className={`text-sm font-bold transition-colors ${isLocked ? 'text-white' : 'text-white/60'}`}>Locked Post</p>
                            <p className="text-xs text-white/30">Blur content in feed</p>
                          </div>
                        </div>
                        <div className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 ${isLocked ? 'bg-white' : 'bg-white/10'}`}>
                          <div className={`w-5 h-5 rounded-full bg-black shadow-sm transition-transform duration-300 ${isLocked ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
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
                              <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-white w-4 h-4" />
                              <input 
                                type="number" 
                                value={unlockPrice}
                                onChange={(e) => setUnlockPrice(e.target.value)}
                                placeholder="Price (e.g. 5.00)"
                                className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 pl-10 pr-4 text-white focus:border-white/40 focus:outline-none text-sm font-medium placeholder:text-white/20 transition-all"
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Advertisement */}
                    <div className="flex items-center justify-between group cursor-pointer" onClick={() => setIsAdvertisement(!isAdvertisement)}>
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${isAdvertisement ? 'bg-white text-black' : 'bg-white/5 text-white/40'}`}>
                          <Megaphone className="w-4 h-4" />
                        </div>
                        <div>
                          <p className={`text-sm font-bold transition-colors ${isAdvertisement ? 'text-white' : 'text-white/60'}`}>Advertisement</p>
                          <p className="text-xs text-white/30">Promote this post</p>
                        </div>
                      </div>
                      <div className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 ${isAdvertisement ? 'bg-white' : 'bg-white/10'}`}>
                        <div className={`w-5 h-5 rounded-full bg-black shadow-sm transition-transform duration-300 ${isAdvertisement ? 'translate-x-5' : 'translate-x-0'}`} />
                      </div>
                    </div>
                 </div>
               </div>

               <div className="mt-auto pt-8">
                 <button 
                   onClick={handlePost}
                   disabled={posting}
                   className="w-full py-4 rounded-full bg-white text-black font-bold text-sm uppercase tracking-widest shadow-[0_0_40px_rgba(255,255,255,0.15)] hover:shadow-[0_0_60px_rgba(255,255,255,0.25)] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                 >
                   {posting ? (
                     <div className="flex items-center justify-center gap-2">
                       <Loader2 className="w-4 h-4 animate-spin" />
                       <span>Publishing...</span>
                     </div>
                   ) : (
                     <div className="flex items-center justify-center gap-2">
                       <Send className="w-4 h-4" />
                       <span>Post Now</span>
                     </div>
                   )}
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
            className="fixed bottom-12 left-6 right-6 bg-white text-black p-4 rounded-2xl flex items-center justify-center shadow-2xl z-50"
          >
            <div className="w-6 h-6 border-2 border-black rounded-full flex items-center justify-center mr-3">
               <div className="w-3 h-3 bg-black rounded-full" />
            </div>
            <span className="font-bold text-sm uppercase tracking-wider">Posted Successfully</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

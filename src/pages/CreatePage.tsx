import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Image, Video, Lock, Globe, Users, Send, Loader2, DollarSign, X, Play, Star, ArrowRight, ArrowLeft, Plus, Wand2, Sparkles, Megaphone } from 'lucide-react'
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
  }
}

export default function CreatePage({ user, onBecomeCreator }: CreatePageProps) {
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

  // Filter states (per image, but for simplicity we'll apply to current view and save on next)
  const [filters, setFilters] = useState({
    brightness: 100,
    contrast: 100,
    saturation: 100,
  })

  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

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

  // Reset filters when switching media
  useEffect(() => {
    if (mediaFiles[currentMediaIndex]?.filters) {
      setFilters(mediaFiles[currentMediaIndex].filters!)
    } else {
      setFilters({ brightness: 100, contrast: 100, saturation: 100 })
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
        filters: { brightness: 100, contrast: 100, saturation: 100 }
      })
    }

    setMediaFiles(prev => [...prev, ...newFiles].slice(0, 10))
    setStep('edit')
    e.target.value = ''
  }

  const applyFiltersToMedia = () => {
    // Save current filters to the current media object
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
    const { brightness, contrast, saturation } = mediaFile.filters
    
    // If filters are default, skip processing
    if (brightness === 100 && contrast === 100 && saturation === 100) return mediaFile.file

    return new Promise((resolve, reject) => {
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
        
        // Apply filters
        ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        
        canvas.toBlob((blob) => {
          if (blob) {
            const processedFile = new File([blob], mediaFile.file.name, { type: mediaFile.file.type })
            resolve(processedFile)
          } else {
            resolve(mediaFile.file)
          }
        }, mediaFile.file.type, 0.9)
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
          
          // Process image filters if applicable
          if (mediaFile.type === 'image') {
             fileToUpload = await processImageWithFilters(mediaFile)
             // Compress after filtering
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
        // Reset everything
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

  return (
    <div className="relative min-h-screen bg-black text-white overflow-hidden flex flex-col">
      {/* Space Background */}
      <div className="fixed inset-0 pointer-events-none">
         <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#1a1a2e] via-[#000] to-[#000]" />
         <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
      </div>

      {/* Header */}
      <div className="relative z-20 flex items-center justify-between px-6 pt-6 pb-2">
        {step !== 'select' ? (
          <button 
             onClick={() => {
               if (step === 'details') setStep('edit')
               else if (step === 'edit') setStep('select')
             }}
             className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
        ) : <div className="w-10" />} {/* Spacer */}
        
        <h2 className="text-xl font-bold tracking-wide uppercase bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
          {step === 'select' ? 'Create' : step === 'edit' ? 'Edit' : 'Finalize'}
        </h2>

        <div className="w-10" /> {/* Spacer */}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 relative z-10 flex flex-col overflow-y-auto">
        <AnimatePresence mode="wait">
          {step === 'select' && (
            <motion.div 
              key="select"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex-1 flex flex-col items-center justify-center p-6 gap-8"
            >
               <div className="relative group cursor-pointer" onClick={() => imageInputRef.current?.click()}>
                 <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt" />
                 <div className="relative w-32 h-32 bg-black rounded-full flex items-center justify-center border border-white/20 shadow-2xl">
                   <Plus className="w-12 h-12 text-white" />
                 </div>
               </div>
               
               <div className="flex gap-4">
                 <button 
                   onClick={() => imageInputRef.current?.click()}
                   className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all active:scale-95"
                 >
                   <Image className="w-5 h-5 text-blue-400" />
                   <span className="font-medium">Add Photo</span>
                 </button>
                 <button 
                   onClick={() => videoInputRef.current?.click()}
                   className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all active:scale-95"
                 >
                   <Video className="w-5 h-5 text-purple-400" />
                   <span className="font-medium">Add Video</span>
                 </button>
               </div>
            </motion.div>
          )}

          {step === 'edit' && mediaFiles.length > 0 && (
            <motion.div
              key="edit"
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              className="flex-1 flex flex-col p-4"
            >
              {/* Media Preview */}
              <div className="relative flex-1 rounded-3xl overflow-hidden bg-black/50 border border-white/10 shadow-2xl mb-6 max-h-[50vh]">
                 {mediaFiles[currentMediaIndex].type === 'image' ? (
                   <img 
                     src={mediaFiles[currentMediaIndex].preview} 
                     className="w-full h-full object-contain" 
                     style={{ 
                       filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)` 
                     }}
                     alt="preview" 
                   />
                 ) : (
                   <div className="relative w-full h-full">
                     <img 
                       src={mediaFiles[currentMediaIndex].thumbnail?.preview || mediaFiles[currentMediaIndex].preview} 
                       className="w-full h-full object-contain opacity-70" 
                       alt="video preview"
                     />
                     <div className="absolute inset-0 flex items-center justify-center">
                        <Play className="w-16 h-16 text-white opacity-80" />
                     </div>
                   </div>
                 )}
                 
                 {/* Pagination dots if multiple */}
                 {mediaFiles.length > 1 && (
                   <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
                     {mediaFiles.map((_, idx) => (
                       <div 
                         key={idx}
                         className={`w-2 h-2 rounded-full transition-colors ${idx === currentMediaIndex ? 'bg-white' : 'bg-white/30'}`}
                       />
                     ))}
                   </div>
                 )}
              </div>

              {/* Controls */}
              <div className="bg-white/5 rounded-3xl p-6 border border-white/10 backdrop-blur-lg space-y-6">
                 {mediaFiles[currentMediaIndex].type === 'image' ? (
                   <>
                     <div className="space-y-4">
                       <div className="flex items-center justify-between text-sm text-gray-400">
                         <span>Brightness</span>
                         <span>{filters.brightness}%</span>
                       </div>
                       <input 
                         type="range" 
                         min="50" max="150" 
                         value={filters.brightness} 
                         onChange={(e) => setFilters(p => ({ ...p, brightness: Number(e.target.value) }))}
                         className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                       />
                     </div>
                     <div className="space-y-4">
                       <div className="flex items-center justify-between text-sm text-gray-400">
                         <span>Contrast</span>
                         <span>{filters.contrast}%</span>
                       </div>
                       <input 
                         type="range" 
                         min="50" max="150" 
                         value={filters.contrast} 
                         onChange={(e) => setFilters(p => ({ ...p, contrast: Number(e.target.value) }))}
                         className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                       />
                     </div>
                   </>
                 ) : (
                   <div className="text-center text-gray-400 py-8">
                     Video editing not available yet.
                   </div>
                 )}

                 <div className="flex justify-between pt-2">
                   <button onClick={() => removeMedia(currentMediaIndex)} className="p-3 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition">
                     <X className="w-6 h-6" />
                   </button>
                   <button onClick={handleNext} className="flex-1 ml-4 py-3 bg-white text-black rounded-xl font-bold text-lg shadow-lg hover:bg-gray-100 transition flex items-center justify-center gap-2">
                     Next <ArrowRight className="w-5 h-5" />
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
               <div className="bg-white/5 border border-white/10 rounded-3xl p-1">
                 <textarea 
                   value={content}
                   onChange={(e) => setContent(e.target.value)}
                   placeholder="Write a stellar caption..."
                   className="w-full bg-transparent border-none text-white p-4 min-h-[120px] focus:ring-0 resize-none placeholder:text-gray-500 text-lg"
                 />
               </div>

               <div className="space-y-3">
                 <p className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-2">Who can see this?</p>
                 <div className="grid grid-cols-2 gap-3">
                   <button 
                     onClick={() => setVisibility('public')}
                     className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${visibility === 'public' ? 'bg-blue-500/20 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}
                   >
                     <Globe className="w-6 h-6" />
                     <span className="font-medium">Everyone</span>
                   </button>
                   <button 
                     onClick={() => setVisibility('subscribers')}
                     className={`p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all ${visibility === 'subscribers' ? 'bg-purple-500/20 border-purple-500 text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}
                   >
                     <Star className="w-6 h-6" />
                     <span className="font-medium">Fans Only</span>
                   </button>
                 </div>
               </div>

               <div className="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <Lock className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <p className="font-bold text-white">Locked Content</p>
                        <p className="text-xs text-gray-400">Blur on feed until paid</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={isLocked} onChange={(e) => setIsLocked(e.target.checked)} className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                  </div>

                  {isLocked && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }} 
                      animate={{ opacity: 1, height: 'auto' }}
                      className="pt-2"
                    >
                      <div className="relative">
                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-white" />
                        <input 
                          type="number" 
                          value={unlockPrice}
                          onChange={(e) => setUnlockPrice(e.target.value)}
                          placeholder="Price (e.g. 5.00)"
                          className="w-full bg-black/50 border border-white/20 rounded-xl py-3 pl-10 pr-4 text-white focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                    </motion.div>
                  )}

                  <div className="h-px bg-white/10" />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center">
                        <Megaphone className="w-5 h-5 text-pink-400" />
                      </div>
                      <div>
                        <p className="font-bold text-white">Advertisement</p>
                        <p className="text-xs text-gray-400">Promote this post</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={isAdvertisement} onChange={(e) => setIsAdvertisement(e.target.checked)} className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-500"></div>
                    </label>
                  </div>
               </div>

               <div className="mt-auto pt-4">
                 <button 
                   onClick={handlePost}
                   disabled={posting}
                   className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 font-bold text-xl text-white shadow-xl shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                 >
                   {posting ? (
                     <>
                       <Loader2 className="w-6 h-6 animate-spin" />
                       <span>{uploadProgress || 'Posting...'}</span>
                     </>
                   ) : (
                     <>
                       <Send className="w-6 h-6" />
                       <span>Post Now</span>
                     </>
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
            initial={{ opacity: 0, y: 50 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-4 right-4 bg-emerald-500 text-white p-4 rounded-2xl flex items-center justify-center shadow-2xl z-50"
          >
            <Sparkles className="w-5 h-5 mr-2" />
            <span className="font-bold">Post created successfully!</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

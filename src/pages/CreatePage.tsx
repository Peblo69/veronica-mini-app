import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Lock, Globe, Loader2, X, Play, Star,
  Plus, Image as ImageIcon, Film, Users, AlertTriangle,
  Sun, Contrast, Droplets, Palette
} from 'lucide-react'
import { createPost, type User, type CreatePostData } from '../lib/api'
import { uploadPostMedia, getMediaType, compressImage, generateVideoThumbnailFile, uploadVideoThumbnail } from '../lib/storage'
import { getUserSettings } from '../lib/settingsApi'
import { moderateText, moderateImage } from '../lib/moderation'

interface CreatePageProps {
  user: User
  onBecomeCreator?: () => void
}

type Visibility = 'public' | 'followers' | 'subscribers'
type Step = 'upload' | 'edit' | 'publish'

interface MediaMetadata {
  width: number
  height: number
  duration?: number
  sizeBytes: number
}

interface MediaFile {
  file: File
  preview: string
  type: 'image' | 'video' | 'other'
  metadata?: MediaMetadata
  thumbnail?: { file: File; preview: string }
  filters?: typeof defaultFilters
}

const defaultFilters = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  sepia: 0,
  grayscale: 0,
  warmth: 0,
  vignette: 0
}

// Helper to extract image dimensions
function getImageMetadata(file: File): Promise<MediaMetadata> {
  return new Promise((resolve) => {
    const img = document.createElement('img')
    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        sizeBytes: file.size
      })
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => {
      resolve({ width: 0, height: 0, sizeBytes: file.size })
    }
    img.src = URL.createObjectURL(file)
  })
}

// Helper to extract video dimensions and duration
function getVideoMetadata(file: File): Promise<MediaMetadata> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Math.round(video.duration),
        sizeBytes: file.size
      })
      URL.revokeObjectURL(video.src)
    }
    video.onerror = () => {
      resolve({ width: 0, height: 0, sizeBytes: file.size })
    }
    video.src = URL.createObjectURL(file)
  })
}

export default function CreatePage({ user }: CreatePageProps) {
  const [step, setStep] = useState<Step>('upload')
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [defaultVisibility, setDefaultVisibility] = useState<Visibility>('public')
  const [unlockPrice, setUnlockPrice] = useState('')
  const [isLocked, setIsLocked] = useState(false)
  const [posting, setPosting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ message: string; percentage: number } | null>(null)
  const [mediaFile, setMediaFile] = useState<MediaFile | null>(null)
  const [filters, setFilters] = useState(defaultFilters)
  const [moderationStatus, setModerationStatus] = useState<'idle' | 'checking' | 'approved' | 'rejected'>('idle')
  const [moderationError, setModerationError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // Process file when selected
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const mediaType = getMediaType(file)
    if (mediaType === 'unknown') {
      alert('Unsupported file type. Please select an image or video.')
      return
    }

    setModerationStatus('checking')
    setModerationError(null)

    const preview = URL.createObjectURL(file)
    let metadata: MediaMetadata | undefined
    let thumbnail: MediaFile['thumbnail']

    if (mediaType === 'image') {
      metadata = await getImageMetadata(file)
    } else if (mediaType === 'video') {
      metadata = await getVideoMetadata(file)
      const thumbFile = await generateVideoThumbnailFile(file)
      if (thumbFile) {
        thumbnail = { file: thumbFile, preview: URL.createObjectURL(thumbFile) }
      }
    }

    const newMediaFile: MediaFile = {
      file,
      preview,
      type: mediaType as 'image' | 'video',
      metadata,
      thumbnail,
      filters: { ...defaultFilters }
    }

    setMediaFile(newMediaFile)
    setFilters({ ...defaultFilters })

    // Run content moderation check
    try {
      if (import.meta.env.VITE_AI_GUARDRAIL_URL) {
        const imageToCheck = mediaType === 'video' && thumbnail ? thumbnail.preview : preview
        const result = await moderateImage(imageToCheck)

        if (result?.flagged) {
          setModerationStatus('rejected')
          setModerationError('This content violates our community guidelines. Please choose a different image/video.')
          return
        }
      }
      setModerationStatus('approved')
    } catch (err) {
      console.error('Moderation check failed:', err)
      // Allow upload if moderation fails (graceful degradation)
      setModerationStatus('approved')
    }
  }, [])

  const processImageWithFilters = async (mf: MediaFile): Promise<File> => {
    if (mf.type !== 'image' || !mf.filters) return mf.file
    const { brightness, contrast, saturation, blur, sepia, grayscale, warmth } = mf.filters

    const hasChanges = brightness !== 100 || contrast !== 100 || saturation !== 100 ||
                       blur !== 0 || sepia !== 0 || grayscale !== 0 || warmth !== 0

    if (!hasChanges) return mf.file

    return new Promise((resolve) => {
      const img = document.createElement('img')
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(mf.file)
          return
        }

        // Apply filters
        let filterStr = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`
        if (blur > 0) filterStr += ` blur(${blur}px)`
        if (sepia > 0) filterStr += ` sepia(${sepia}%)`
        if (grayscale > 0) filterStr += ` grayscale(${grayscale}%)`
        if (warmth !== 0) filterStr += ` hue-rotate(${warmth}deg)`

        ctx.filter = filterStr
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        canvas.toBlob((blob) => {
          if (blob) {
            const processedFile = new File([blob], mf.file.name, { type: mf.file.type })
            resolve(processedFile)
          } else {
            resolve(mf.file)
          }
        }, mf.file.type, 0.95)
      }
      img.onerror = () => resolve(mf.file)
      img.src = mf.preview
    })
  }

  const handlePost = async () => {
    if (!mediaFile || posting) return

    setPosting(true)
    setUploadProgress({ message: 'Preparing...', percentage: 0 })

    try {
      // Text moderation check
      if (content.trim() && import.meta.env.VITE_AI_GUARDRAIL_URL) {
        const mod = await moderateText(content.trim())
        if (mod?.flagged) {
          alert('Post blocked by moderation (unsafe text).')
          setPosting(false)
          setUploadProgress(null)
          return
        }
      }

      let fileToUpload = mediaFile.file

      if (mediaFile.type === 'image') {
        setUploadProgress({ message: 'Processing image...', percentage: 20 })
        fileToUpload = await processImageWithFilters({ ...mediaFile, filters })
        fileToUpload = await compressImage(fileToUpload)
      }

      setUploadProgress({ message: 'Uploading...', percentage: 50 })
      const result = await uploadPostMedia(fileToUpload, user.telegram_id)

      if (result.error) {
        alert('Upload failed: ' + result.error)
        setPosting(false)
        setUploadProgress(null)
        return
      }

      let thumbnailUrl: string | undefined = undefined
      if (mediaFile.type === 'video') {
        let thumbnailFile: File | undefined = mediaFile.thumbnail?.file
        if (!thumbnailFile) thumbnailFile = await generateVideoThumbnailFile(mediaFile.file) ?? undefined

        if (thumbnailFile) {
          const thumbUpload = await uploadVideoThumbnail(thumbnailFile, user.telegram_id)
          if (!thumbUpload.error && thumbUpload.url) thumbnailUrl = thumbUpload.url
        }
      }

      setUploadProgress({ message: 'Publishing...', percentage: 90 })

      const finalVisibility = isCreator ? visibility : 'public'
      const finalPrice = isCreator && isLocked ? parseFloat(unlockPrice) || 0 : 0

      const postPayload: CreatePostData = {
        content: content.trim(),
        media_url: result.url ?? undefined,
        media_urls: result.url ? [result.url] : undefined,
        media_type: mediaFile.type === 'other' ? 'image' : mediaFile.type,
        visibility: finalVisibility,
        is_nsfw: false,
        unlock_price: finalPrice,
        media_width: mediaFile.metadata?.width,
        media_height: mediaFile.metadata?.height,
        media_duration: mediaFile.metadata?.duration,
        media_size_bytes: mediaFile.metadata?.sizeBytes,
      }

      if (thumbnailUrl) {
        postPayload.media_thumbnail_url = thumbnailUrl
      }

      const { error } = await createPost(user.telegram_id, postPayload)

      if (error) {
        alert(`Failed to create post: ${error.message || 'Please try again.'}`)
      } else {
        setUploadProgress({ message: 'Posted!', percentage: 100 })

        // Reset state
        setTimeout(() => {
          setContent('')
          setVisibility(defaultVisibility)
          setUnlockPrice('')
          setIsLocked(false)
          setStep('upload')
          if (mediaFile.preview) URL.revokeObjectURL(mediaFile.preview)
          if (mediaFile.thumbnail?.preview) URL.revokeObjectURL(mediaFile.thumbnail.preview)
          setMediaFile(null)
          setFilters({ ...defaultFilters })
          setModerationStatus('idle')
          setUploadProgress(null)
        }, 1000)
      }
    } catch (err) {
      console.error('Post error:', err)
      alert('Something went wrong')
    } finally {
      setPosting(false)
    }
  }

  const removeMedia = () => {
    if (mediaFile) {
      URL.revokeObjectURL(mediaFile.preview)
      if (mediaFile.thumbnail?.preview) URL.revokeObjectURL(mediaFile.thumbnail.preview)
    }
    setMediaFile(null)
    setModerationStatus('idle')
    setModerationError(null)
    setStep('upload')
  }

  const getFilterStyle = () => {
    let filterStr = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)`
    if (filters.blur > 0) filterStr += ` blur(${filters.blur}px)`
    if (filters.sepia > 0) filterStr += ` sepia(${filters.sepia}%)`
    if (filters.grayscale > 0) filterStr += ` grayscale(${filters.grayscale}%)`
    if (filters.warmth !== 0) filterStr += ` hue-rotate(${filters.warmth}deg)`
    return filterStr
  }

  // Hidden file input
  const triggerFileSelect = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Progress overlay */}
      <AnimatePresence>
        {uploadProgress && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
          >
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 relative">
                <svg className="w-16 h-16 transform -rotate-90">
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="4"
                    fill="none"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r="28"
                    stroke="white"
                    strokeWidth="4"
                    fill="none"
                    strokeDasharray={175.9}
                    strokeDashoffset={175.9 - (175.9 * uploadProgress.percentage) / 100}
                    className="transition-all duration-300"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                  {Math.round(uploadProgress.percentage)}%
                </span>
              </div>
              <p className="text-white/60 text-sm">{uploadProgress.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        <AnimatePresence mode="wait">
          {/* STEP 1: UPLOAD */}
          {step === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -50 }}
              className="flex-1 flex flex-col px-4 pt-2"
            >
              {/* Compact Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="w-16" />
                <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">New Post</span>
                {mediaFile && moderationStatus === 'approved' && (
                  <button
                    onClick={() => setStep('edit')}
                    className="text-blue-400 text-sm font-semibold"
                  >
                    Next
                  </button>
                )}
                {(!mediaFile || moderationStatus !== 'approved') && <div className="w-16" />}
              </div>

              {/* Single Square Container - Shows upload UI OR media */}
              <div className="w-full aspect-square rounded-2xl overflow-hidden bg-[#111] border border-white/10 relative">
                {!mediaFile ? (
                  /* Empty state - Upload UI */
                  <motion.div
                    onClick={triggerFileSelect}
                    whileTap={{ scale: 0.98 }}
                    className="absolute inset-0 cursor-pointer flex flex-col items-center justify-center group"
                  >
                    {/* Subtle gradient background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-white/[0.02]" />

                    {/* Overlapping icons - premium look */}
                    <div className="relative mb-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center backdrop-blur-sm border border-white/10 rotate-[-8deg] absolute -left-4 -top-1">
                        <ImageIcon className="w-6 h-6 text-white/60" />
                      </div>
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center backdrop-blur-sm border border-white/10 rotate-[8deg] relative z-10 ml-4">
                        <Film className="w-6 h-6 text-white/60" />
                      </div>
                    </div>

                    {/* Small + button */}
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="w-10 h-10 rounded-full bg-white flex items-center justify-center mb-3 shadow-lg shadow-white/10"
                    >
                      <Plus className="w-5 h-5 text-black" />
                    </motion.div>

                    {/* Minimal text */}
                    <p className="text-white/40 text-xs font-medium">Tap to upload</p>
                  </motion.div>
                ) : (
                  /* Media preview state */
                  <>
                    {mediaFile.type === 'image' ? (
                      <img src={mediaFile.preview} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="relative w-full h-full">
                        <img
                          src={mediaFile.thumbnail?.preview || mediaFile.preview}
                          alt="preview"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                            <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Moderation overlay - only when checking or rejected */}
                    {moderationStatus !== 'approved' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                        {moderationStatus === 'checking' && (
                          <div className="text-center">
                            <Loader2 className="w-6 h-6 text-white animate-spin mx-auto mb-2" />
                            <p className="text-white/60 text-xs">Checking...</p>
                          </div>
                        )}
                        {moderationStatus === 'rejected' && (
                          <div className="text-center px-8">
                            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                            <p className="text-red-400 text-sm font-medium mb-1">Not Allowed</p>
                            <p className="text-white/40 text-xs mb-3 line-clamp-2">{moderationError}</p>
                            <button
                              onClick={(e) => { e.stopPropagation(); removeMedia(); }}
                              className="px-3 py-1.5 bg-white/10 rounded-lg text-xs font-medium"
                            >
                              Try Again
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Remove button - top right */}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeMedia(); }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center z-10"
                    >
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>

                    {/* Change media - tap anywhere when approved */}
                    {moderationStatus === 'approved' && (
                      <div
                        onClick={triggerFileSelect}
                        className="absolute bottom-2 left-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-sm flex items-center gap-1.5 cursor-pointer"
                      >
                        <ImageIcon className="w-3 h-3 text-white/70" />
                        <span className="text-[10px] text-white/70 font-medium">Change</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Quick actions below - only if approved */}
              {mediaFile && moderationStatus === 'approved' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 flex items-center justify-center gap-2"
                >
                  <button
                    onClick={() => setStep('edit')}
                    className="flex-1 py-2.5 bg-white text-black rounded-xl text-sm font-semibold"
                  >
                    Continue
                  </button>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* STEP 2: EDIT */}
          {step === 'edit' && mediaFile && (
            <motion.div
              key="edit"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="flex-1 flex flex-col px-4 pt-2 overflow-y-auto"
            >
              {/* Compact Header */}
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setStep('upload')}
                  className="text-white/50 text-sm font-medium"
                >
                  Back
                </button>
                <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">Edit</span>
                <button
                  onClick={() => setStep('publish')}
                  className="text-blue-400 text-sm font-semibold"
                >
                  Next
                </button>
              </div>

              {/* Image preview - smaller */}
              <div className="w-full aspect-[4/3] rounded-xl overflow-hidden bg-[#111] border border-white/10 mb-4">
                {mediaFile.type === 'image' ? (
                  <img
                    src={mediaFile.preview}
                    alt="preview"
                    className="w-full h-full object-cover transition-all duration-200"
                    style={{ filter: getFilterStyle() }}
                  />
                ) : (
                  <div className="relative w-full h-full">
                    <img
                      src={mediaFile.thumbnail?.preview || mediaFile.preview}
                      alt="preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                        <Play className="w-5 h-5 text-white ml-0.5" fill="white" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Compact sliders */}
              {mediaFile.type === 'image' ? (
                <div className="space-y-3 pb-4">
                  <FilterSlider icon={<Sun className="w-3.5 h-3.5" />} label="Brightness" value={filters.brightness} onChange={(v) => setFilters(p => ({ ...p, brightness: v }))} min={50} max={150} defaultValue={100} />
                  <FilterSlider icon={<Contrast className="w-3.5 h-3.5" />} label="Contrast" value={filters.contrast} onChange={(v) => setFilters(p => ({ ...p, contrast: v }))} min={50} max={150} defaultValue={100} />
                  <FilterSlider icon={<Droplets className="w-3.5 h-3.5" />} label="Saturation" value={filters.saturation} onChange={(v) => setFilters(p => ({ ...p, saturation: v }))} min={0} max={200} defaultValue={100} />
                  <FilterSlider icon={<Palette className="w-3.5 h-3.5" />} label="Warmth" value={filters.warmth} onChange={(v) => setFilters(p => ({ ...p, warmth: v }))} min={-30} max={30} defaultValue={0} />
                  <button onClick={() => setFilters({ ...defaultFilters })} className="w-full py-1.5 text-white/30 text-xs font-medium">Reset</button>
                </div>
              ) : (
                <div className="py-4 text-center text-white/30 text-xs">No edits for video</div>
              )}
            </motion.div>
          )}

          {/* STEP 3: PUBLISH */}
          {step === 'publish' && mediaFile && (
            <motion.div
              key="publish"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="flex-1 flex flex-col px-4 pt-2 overflow-y-auto"
            >
              {/* Compact Header */}
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => setStep('edit')} className="text-white/50 text-sm font-medium">Back</button>
                <span className="text-xs font-semibold text-white/50 uppercase tracking-widest">Share</span>
                <button
                  onClick={handlePost}
                  disabled={posting}
                  className="text-blue-400 text-sm font-semibold disabled:opacity-50"
                >
                  {posting ? '...' : 'Post'}
                </button>
              </div>

              {/* Horizontal layout: small preview + caption */}
              <div className="flex gap-3 mb-4">
                {/* Small preview thumbnail */}
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-[#111] border border-white/10 flex-shrink-0">
                  {mediaFile.type === 'image' ? (
                    <img src={mediaFile.preview} alt="preview" className="w-full h-full object-cover" style={{ filter: getFilterStyle() }} />
                  ) : (
                    <div className="relative w-full h-full">
                      <img src={mediaFile.thumbnail?.preview || mediaFile.preview} alt="preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Play className="w-4 h-4 text-white" fill="white" />
                      </div>
                    </div>
                  )}
                </div>
                {/* Caption input */}
                <div className="flex-1">
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value.slice(0, 200))}
                    placeholder="Write a caption..."
                    className="w-full h-20 bg-white/5 border border-white/10 rounded-lg p-2 text-sm text-white placeholder-white/30 resize-none focus:outline-none focus:border-white/20"
                  />
                  <span className={`text-[10px] ${content.length > 180 ? 'text-orange-400' : 'text-white/30'}`}>{content.length}/200</span>
                </div>
              </div>

              {/* Compact visibility options */}
              <div className="mb-4">
                <span className="text-[10px] text-white/40 uppercase tracking-wider mb-2 block">Visibility</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setVisibility('public')}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border transition-all ${visibility === 'public' ? 'bg-white text-black border-white' : 'bg-white/5 text-white/50 border-white/10'}`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    Public
                  </button>
                  <button
                    onClick={() => setVisibility('followers')}
                    className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border transition-all ${visibility === 'followers' ? 'bg-white text-black border-white' : 'bg-white/5 text-white/50 border-white/10'}`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    Followers
                  </button>
                  {isCreator && (
                    <button
                      onClick={() => setVisibility('subscribers')}
                      className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border transition-all ${visibility === 'subscribers' ? 'bg-white text-black border-white' : 'bg-white/5 text-white/50 border-white/10'}`}
                    >
                      <Star className="w-3.5 h-3.5" />
                      Subs
                    </button>
                  )}
                </div>
              </div>

              {/* Locked content toggle (creators only) */}
              {isCreator && (
                <div className="mb-4 p-3 bg-white/5 rounded-lg border border-white/10">
                  <div className="flex items-center justify-between" onClick={() => setIsLocked(!isLocked)}>
                    <div className="flex items-center gap-2">
                      <Lock className={`w-4 h-4 ${isLocked ? 'text-white' : 'text-white/40'}`} />
                      <span className={`text-sm ${isLocked ? 'text-white' : 'text-white/50'}`}>Paid unlock</span>
                    </div>
                    <div className={`w-9 h-5 rounded-full p-0.5 transition-colors ${isLocked ? 'bg-blue-500' : 'bg-white/20'}`}>
                      <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isLocked ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                  </div>
                  {isLocked && (
                    <div className="mt-2 relative">
                      <Star className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-yellow-400" />
                      <input
                        type="number"
                        value={unlockPrice}
                        onChange={(e) => setUnlockPrice(e.target.value)}
                        placeholder="Price"
                        className="w-full bg-black/30 border border-white/10 rounded-lg py-2 pl-8 pr-3 text-sm text-white placeholder-white/30"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Share button */}
              <button
                onClick={handlePost}
                disabled={posting}
                className="w-full py-3 bg-white text-black rounded-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 mt-auto"
              >
                {posting ? <><Loader2 className="w-4 h-4 animate-spin" /> Posting...</> : 'Share Post'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// Filter slider component
function FilterSlider({
  icon,
  label,
  value,
  onChange,
  min,
  max,
  defaultValue
}: {
  icon: React.ReactNode
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  defaultValue: number
}) {
  const percentage = ((value - min) / (max - min)) * 100
  const isDefault = value === defaultValue

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white/60">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        <span className={`text-xs font-mono ${isDefault ? 'text-white/30' : 'text-white'}`}>
          {value > 0 && defaultValue === 0 ? '+' : ''}{value}{label === 'Warmth' ? '°' : '%'}
        </span>
      </div>
      <div className="relative h-6 flex items-center">
        <div className="absolute w-full h-1 bg-white/10 rounded-full" />
        <div
          className="absolute h-1 bg-white/40 rounded-full"
          style={{ width: `${percentage}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute w-full h-6 opacity-0 cursor-pointer"
        />
        <div
          className="absolute w-4 h-4 bg-white rounded-full shadow-lg pointer-events-none transition-transform hover:scale-110"
          style={{ left: `calc(${percentage}% - 8px)` }}
        />
      </div>
    </div>
  )
}


import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Loader2, Image as ImageIcon, Play, ChevronDown,
  Globe, Users, Star, MoreHorizontal, Camera, AlertTriangle,
  BarChart3, MessageCircleQuestion, Type, Plus, Minus, Sparkles, Palette
} from 'lucide-react'
import { createPost, type User, type CreatePostData } from '../lib/api'
import { uploadPostMedia, getMediaType, compressImage, generateVideoThumbnailFile, uploadVideoThumbnail } from '../lib/storage'
import { getUserSettings } from '../lib/settingsApi'
import { moderateText, moderateImage } from '../lib/moderation'

interface CreatePageProps {
  user: User
  onBecomeCreator?: () => void
  mode?: 'text' | 'media' // text = quick thoughts only, media = full media posting
}

type Visibility = 'public' | 'followers' | 'subscribers'

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
}

type PostType = 'thought' | 'poll' | 'question'

// Premium gradient backgrounds for text posts
const GRADIENTS = {
  none: { name: 'None', value: '', preview: 'bg-transparent border border-white/10' },
  midnight: { name: 'Midnight', value: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', preview: 'bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460]' },
  ember: { name: 'Ember', value: 'linear-gradient(135deg, #2d1f1f 0%, #4a2020 50%, #6b2020 100%)', preview: 'bg-gradient-to-br from-[#2d1f1f] via-[#4a2020] to-[#6b2020]' },
  aurora: { name: 'Aurora', value: 'linear-gradient(135deg, #1a2f1a 0%, #1a3a2a 50%, #0f4a3a 100%)', preview: 'bg-gradient-to-br from-[#1a2f1a] via-[#1a3a2a] to-[#0f4a3a]' },
  twilight: { name: 'Twilight', value: 'linear-gradient(135deg, #2d1f3d 0%, #3d2050 50%, #4a1f6a 100%)', preview: 'bg-gradient-to-br from-[#2d1f3d] via-[#3d2050] to-[#4a1f6a]' },
  ocean: { name: 'Ocean', value: 'linear-gradient(135deg, #0d1b2a 0%, #1b263b 50%, #274060 100%)', preview: 'bg-gradient-to-br from-[#0d1b2a] via-[#1b263b] to-[#274060]' },
  sunset: { name: 'Sunset', value: 'linear-gradient(135deg, #3d2c29 0%, #5c3d31 50%, #7a4a3a 100%)', preview: 'bg-gradient-to-br from-[#3d2c29] via-[#5c3d31] to-[#7a4a3a]' },
} as const

type GradientKey = keyof typeof GRADIENTS

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

export default function CreatePage({ user, mode = 'media' }: CreatePageProps) {
  const isTextOnly = mode === 'text'
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [defaultVisibility, setDefaultVisibility] = useState<Visibility>('public')
  const [posting, setPosting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ message: string; percentage: number } | null>(null)
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])
  const [_moderationStatus, setModerationStatus] = useState<'idle' | 'checking' | 'approved' | 'rejected'>('idle')
  const [moderationError, setModerationError] = useState<string | null>(null)
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Post type and interactive features (for text-only mode)
  const [postType, setPostType] = useState<PostType>('thought')
  const [pollOptions, setPollOptions] = useState<string[]>(['', ''])
  const [pollDuration, setPollDuration] = useState<24 | 48 | 72>(24)
  const [selectedGradient, setSelectedGradient] = useState<GradientKey>('none')
  const [showGradientPicker, setShowGradientPicker] = useState(false)

  const isCreator = user.is_creator

  // Load default visibility preference
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

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [content])

  // Process file when selected
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // Limit to 4 media files
    const remainingSlots = 4 - mediaFiles.length
    const filesToProcess = files.slice(0, remainingSlots)

    for (const file of filesToProcess) {
      const mediaType = getMediaType(file)
      if (mediaType === 'unknown') continue

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
        thumbnail
      }

      // Run content moderation check - pass actual File for base64 conversion
      try {
        if (import.meta.env.VITE_AI_GUARDRAIL_URL) {
          // Pass the actual file (or thumbnail file for videos) - moderation will convert to base64
          const fileToCheck = mediaType === 'video' && thumbnail ? thumbnail.file : file
          const result = await moderateImage(fileToCheck)

          if (result?.flagged) {
            setModerationStatus('rejected')
            let errorMsg = 'This content violates our community guidelines.'
            if (result.categories?.sexual_minors) {
              errorMsg = 'This content has been flagged for safety concerns and cannot be posted.'
            } else if (result.categories?.sexual) {
              // Use the specific reason from the API if available
              errorMsg = result.reasons?.[0] || 'Explicit nudity is not allowed. Bikini/lingerie is OK, but no exposed genitals or nipples.'
            } else if (result.categories?.violence) {
              errorMsg = 'Graphic violence is not allowed.'
            } else if (result.categories?.self_harm) {
              errorMsg = 'Self-harm content is not allowed.'
            } else if (result.categories?.hate) {
              errorMsg = 'Hate symbols or content is not allowed.'
            } else if (result.reasons?.length > 0) {
              errorMsg = result.reasons[0]
            }
            setModerationError(errorMsg)
            URL.revokeObjectURL(preview)
            continue
          }
        }
        setModerationStatus('approved')
        setMediaFiles(prev => [...prev, newMediaFile])
      } catch (err) {
        console.error('Moderation check failed:', err)
        setModerationStatus('approved')
        setMediaFiles(prev => [...prev, newMediaFile])
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [mediaFiles.length])

  const removeMedia = (index: number) => {
    setMediaFiles(prev => {
      const newFiles = [...prev]
      const removed = newFiles.splice(index, 1)[0]
      if (removed) {
        URL.revokeObjectURL(removed.preview)
        if (removed.thumbnail?.preview) URL.revokeObjectURL(removed.thumbnail.preview)
      }
      return newFiles
    })
    if (mediaFiles.length === 1) {
      setModerationStatus('idle')
      setModerationError(null)
    }
  }

  const handlePost = async () => {
    // Validate based on post type
    if (posting) return
    if (postType === 'poll') {
      const validOptions = pollOptions.filter(o => o.trim().length > 0)
      if (validOptions.length < 2) {
        alert('Please add at least 2 poll options')
        return
      }
      if (!content.trim()) {
        alert('Please add a question for your poll')
        return
      }
    } else if (!content.trim() && mediaFiles.length === 0) {
      return
    }

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

      let mediaUrl: string | undefined
      let mediaUrls: string[] = []
      let mediaType: 'image' | 'video' | undefined
      let thumbnailUrl: string | undefined
      let mediaWidth: number | undefined
      let mediaHeight: number | undefined
      let mediaDuration: number | undefined
      let mediaSizeBytes: number | undefined

      if (mediaFiles.length > 0) {
        const totalFiles = mediaFiles.length

        for (let i = 0; i < mediaFiles.length; i++) {
          const mf = mediaFiles[i]
          const progressBase = (i / totalFiles) * 80

          let fileToUpload = mf.file

          if (mf.type === 'image') {
            setUploadProgress({ message: `Compressing ${i + 1}/${totalFiles}...`, percentage: progressBase + 10 })
            fileToUpload = await compressImage(fileToUpload)
          }

          setUploadProgress({ message: `Uploading ${i + 1}/${totalFiles}...`, percentage: progressBase + 40 })
          const result = await uploadPostMedia(fileToUpload, user.telegram_id)

          if (result.error) {
            alert('Upload failed: ' + result.error)
            setPosting(false)
            setUploadProgress(null)
            return
          }

          if (result.url) {
            mediaUrls.push(result.url)
            if (i === 0) {
              mediaUrl = result.url
              mediaType = mf.type === 'other' ? 'image' : mf.type
              mediaWidth = mf.metadata?.width
              mediaHeight = mf.metadata?.height
              mediaDuration = mf.metadata?.duration
              mediaSizeBytes = mf.metadata?.sizeBytes
            }
          }

          // Upload video thumbnail for first video
          if (i === 0 && mf.type === 'video') {
            let thumbnailFile: File | undefined = mf.thumbnail?.file
            if (!thumbnailFile) thumbnailFile = await generateVideoThumbnailFile(mf.file) ?? undefined

            if (thumbnailFile) {
              const thumbUpload = await uploadVideoThumbnail(thumbnailFile, user.telegram_id)
              if (!thumbUpload.error && thumbUpload.url) thumbnailUrl = thumbUpload.url
            }
          }
        }
      }

      setUploadProgress({ message: 'Publishing...', percentage: 90 })

      const finalVisibility = isCreator ? visibility : 'public'

      const postPayload: CreatePostData = {
        content: content.trim(),
        media_url: mediaUrl,
        media_urls: mediaUrls.length > 0 ? mediaUrls : undefined,
        media_type: mediaType,
        visibility: finalVisibility,
        is_nsfw: false,
        unlock_price: 0,
        media_width: mediaWidth,
        media_height: mediaHeight,
        media_duration: mediaDuration,
        media_size_bytes: mediaSizeBytes,
        // Interactive post type fields
        post_type: postType,
        background_gradient: selectedGradient !== 'none' ? selectedGradient : undefined,
      }

      // Add poll data if it's a poll
      if (postType === 'poll') {
        postPayload.poll_options = pollOptions.filter(o => o.trim().length > 0)
        postPayload.poll_duration_hours = pollDuration
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
          mediaFiles.forEach(mf => {
            URL.revokeObjectURL(mf.preview)
            if (mf.thumbnail?.preview) URL.revokeObjectURL(mf.thumbnail.preview)
          })
          setMediaFiles([])
          setModerationStatus('idle')
          setUploadProgress(null)
          // Reset interactive post fields
          setPostType('thought')
          setPollOptions(['', ''])
          setPollDuration(24)
          setSelectedGradient('none')
          // Navigate back
          window.history.back()
        }, 1000)
      }
    } catch (err) {
      console.error('Post error:', err)
      alert('Something went wrong')
    } finally {
      setPosting(false)
    }
  }

  const getVisibilityIcon = () => {
    if (visibility === 'public') return <Globe className="w-4 h-4" />
    if (visibility === 'followers') return <Users className="w-4 h-4" />
    return <Star className="w-4 h-4" />
  }

  // Determine if we can post based on post type
  const canPost = (() => {
    if (postType === 'poll') {
      const validOptions = pollOptions.filter(o => o.trim().length > 0)
      return content.trim().length > 0 && validOptions.length >= 2
    }
    return content.trim().length > 0 || mediaFiles.length > 0
  })()

  return (
    <div className="h-full bg-black text-white flex flex-col overflow-hidden">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
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

      {/* Moderation error toast */}
      <AnimatePresence>
        {moderationError && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-4 right-4 z-40 bg-red-500/90 backdrop-blur-sm rounded-xl p-4 flex items-start gap-3"
          >
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">{moderationError}</p>
            </div>
            <button onClick={() => setModerationError(null)} className="p-1">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header - with Post button */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button
          onClick={() => {
            // Reset and go back
            setContent('')
            mediaFiles.forEach(mf => {
              URL.revokeObjectURL(mf.preview)
              if (mf.thumbnail?.preview) URL.revokeObjectURL(mf.thumbnail.preview)
            })
            setMediaFiles([])
            setModerationStatus('idle')
            window.history.back()
          }}
          className="text-white/60 text-[15px] font-medium"
        >
          Cancel
        </button>
        <span className="text-white text-[16px] font-semibold">
          {isTextOnly ? (
            postType === 'poll' ? 'Create poll' : postType === 'question' ? 'Ask question' : 'Quick thought'
          ) : 'New post'}
        </span>
        <button
          onClick={handlePost}
          disabled={!canPost || posting}
          className={`px-5 py-1.5 rounded-full text-[14px] font-semibold transition-all ${
            canPost && !posting
              ? 'bg-white text-black'
              : 'bg-white/10 text-white/30'
          }`}
        >
          {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post'}
        </button>
      </div>

      {/* Main composer area - only scroll if content overflows */}
      <div className="flex-1 overflow-y-auto overscroll-none" style={{ overflowY: 'auto', minHeight: 0 }}>
        <div className="px-4 py-4">
          {/* User row with avatar */}
          <div className="flex gap-3">
            {/* Avatar column with vertical line */}
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-white/10 flex-shrink-0">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.first_name || user.username || 'User'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/60 text-base font-semibold">
                    {(user.first_name || user.username || 'U')[0].toUpperCase()}
                  </div>
                )}
              </div>
              {/* Vertical line connecting to Add to thread */}
              {(content.length > 0 || mediaFiles.length > 0) && (
                <div className="w-0.5 bg-white/10 flex-1 mt-2 min-h-[20px]" />
              )}
            </div>

            {/* Content column */}
            <div className="flex-1 min-w-0">
              {/* Username */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-white text-[16px] font-semibold">
                  {user.first_name || user.username || 'User'}
                </span>
              </div>

              {/* Text input */}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value.slice(0, 500))}
                placeholder={
                  postType === 'poll' ? 'Ask your question...' :
                  postType === 'question' ? 'What would you like to ask?' :
                  "What's on your mind?"
                }
                className="w-full bg-transparent text-white text-[17px] placeholder-white/40 resize-none focus:outline-none min-h-[80px] leading-relaxed"
                rows={1}
              />

              {/* Poll options - shown when post type is poll */}
              {isTextOnly && postType === 'poll' && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white/50 text-sm">Poll options</span>
                    <div className="flex items-center gap-2">
                      <select
                        value={pollDuration}
                        onChange={(e) => setPollDuration(Number(e.target.value) as 24 | 48 | 72)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-white/20"
                      >
                        <option value={24}>24 hours</option>
                        <option value={48}>48 hours</option>
                        <option value={72}>72 hours</option>
                      </select>
                    </div>
                  </div>
                  {pollOptions.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={option}
                          onChange={(e) => {
                            const newOptions = [...pollOptions]
                            newOptions[index] = e.target.value.slice(0, 50)
                            setPollOptions(newOptions)
                          }}
                          placeholder={`Option ${index + 1}`}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-white/20 pr-10"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 text-xs">
                          {option.length}/50
                        </span>
                      </div>
                      {pollOptions.length > 2 && (
                        <button
                          onClick={() => {
                            const newOptions = pollOptions.filter((_, i) => i !== index)
                            setPollOptions(newOptions)
                          }}
                          className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-red-400 hover:border-red-400/30 transition-colors"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 4 && (
                    <button
                      onClick={() => setPollOptions([...pollOptions, ''])}
                      className="w-full py-3 rounded-xl border border-dashed border-white/20 text-white/40 text-sm flex items-center justify-center gap-2 hover:border-white/30 hover:text-white/60 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add option
                    </button>
                  )}
                </div>
              )}

              {/* Media previews - Premium grid layout */}
              {mediaFiles.length > 0 && (
                <div className="mt-4">
                  <div className={`grid gap-2 ${
                    mediaFiles.length === 1 ? 'grid-cols-1' :
                    mediaFiles.length === 2 ? 'grid-cols-2' :
                    mediaFiles.length === 3 ? 'grid-cols-2' :
                    'grid-cols-2'
                  }`}>
                    {mediaFiles.map((mf, index) => (
                      <div
                        key={index}
                        className={`relative overflow-hidden rounded-2xl ${
                          mediaFiles.length === 1 ? 'aspect-[4/3]' :
                          mediaFiles.length === 3 && index === 0 ? 'row-span-2 aspect-auto h-full' :
                          'aspect-square'
                        }`}
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                        }}
                      >
                        {mf.type === 'image' ? (
                          <img
                            src={mf.preview}
                            alt="preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="relative w-full h-full">
                            <img
                              src={mf.thumbnail?.preview || mf.preview}
                              alt="preview"
                              className="w-full h-full object-cover"
                            />
                            {/* Video overlay */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div
                                className="w-14 h-14 rounded-full flex items-center justify-center"
                                style={{
                                  background: 'rgba(0, 0, 0, 0.6)',
                                  backdropFilter: 'blur(10px)',
                                  border: '2px solid rgba(255, 255, 255, 0.2)',
                                }}
                              >
                                <Play className="w-6 h-6 text-white ml-1" fill="white" />
                              </div>
                            </div>
                            {/* Duration badge */}
                            {mf.metadata?.duration && (
                              <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-[11px] font-medium text-white"
                                style={{ background: 'rgba(0, 0, 0, 0.7)' }}
                              >
                                {Math.floor(mf.metadata.duration / 60)}:{String(mf.metadata.duration % 60).padStart(2, '0')}
                              </div>
                            )}
                          </div>
                        )}
                        {/* Remove button - premium style */}
                        <button
                          onClick={() => removeMedia(index)}
                          className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center active:scale-95 transition-transform"
                          style={{
                            background: 'rgba(0, 0, 0, 0.6)',
                            backdropFilter: 'blur(10px)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                          }}
                        >
                          <X className="w-4 h-4 text-white" />
                        </button>
                        {/* Image count badge for multiple */}
                        {mediaFiles.length > 1 && index === 0 && (
                          <div className="absolute top-2 left-2 px-2 py-1 rounded-full text-[11px] font-semibold text-white"
                            style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(10px)' }}
                          >
                            1/{mediaFiles.length}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Media buttons row - only show in media mode */}
              {!isTextOnly && (
                <div className="flex items-center gap-5 mt-4">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={mediaFiles.length >= 4}
                    className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white/70 hover:bg-white/10 transition-all disabled:opacity-30 active:scale-95"
                  >
                    <ImageIcon className="w-6 h-6" />
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={mediaFiles.length >= 4}
                    className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white/70 hover:bg-white/10 transition-all disabled:opacity-30 active:scale-95"
                  >
                    <Camera className="w-6 h-6" />
                  </button>
                  <button className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white/70 hover:bg-white/10 transition-all active:scale-95">
                    <MoreHorizontal className="w-6 h-6" />
                  </button>
                </div>
              )}

              {/* Text-only mode: Post type selector and gradient picker - compact single row */}
              {isTextOnly && (
                <div className="mt-4 flex items-center gap-1.5">
                  {/* Post type buttons - very compact */}
                  <button
                    onClick={() => setPostType('thought')}
                    className={`px-2.5 py-1 rounded-full text-[12px] font-medium flex items-center gap-1 transition-all whitespace-nowrap ${
                      postType === 'thought'
                        ? 'bg-white text-black'
                        : 'bg-white/5 border border-white/10 text-white/60'
                    }`}
                  >
                    <Type className="w-3 h-3" />
                    Text
                  </button>
                  <button
                    onClick={() => setPostType('poll')}
                    className={`px-2.5 py-1 rounded-full text-[12px] font-medium flex items-center gap-1 transition-all whitespace-nowrap ${
                      postType === 'poll'
                        ? 'bg-white text-black'
                        : 'bg-white/5 border border-white/10 text-white/60'
                    }`}
                  >
                    <BarChart3 className="w-3 h-3" />
                    Poll
                  </button>
                  <button
                    onClick={() => setPostType('question')}
                    className={`px-2.5 py-1 rounded-full text-[12px] font-medium flex items-center gap-1 transition-all whitespace-nowrap ${
                      postType === 'question'
                        ? 'bg-white text-black'
                        : 'bg-white/5 border border-white/10 text-white/60'
                    }`}
                  >
                    <MessageCircleQuestion className="w-3 h-3" />
                    Q&A
                  </button>

                  {/* Gradient/style button - only show when not poll */}
                  {postType !== 'poll' && (
                    <button
                      onClick={() => setShowGradientPicker(true)}
                      className={`px-2.5 py-1 rounded-full text-[12px] font-medium flex items-center gap-1 transition-all whitespace-nowrap ${
                        selectedGradient !== 'none'
                          ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-white'
                          : 'bg-white/5 border border-white/10 text-white/60'
                      }`}
                    >
                      <Palette className="w-3 h-3" />
                      Style
                    </button>
                  )}
                </div>
              )}

              {/* Character count */}
              {content.length > 400 && (
                <div className="mt-3">
                  <span className={`text-xs ${content.length > 480 ? 'text-orange-400' : 'text-white/30'}`}>
                    {content.length}/500
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Post Options - shown when there's content/media */}
          {(content.length > 0 || mediaFiles.length > 0 || postType === 'poll') && (
            <div className="mt-6 pt-4 border-t border-white/10">
              {/* Visibility selector */}
              <button
                onClick={() => setShowVisibilityPicker(!showVisibilityPicker)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/8 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
                    {getVisibilityIcon()}
                  </div>
                  <div className="text-left">
                    <p className="text-white text-[14px] font-medium">
                      {visibility === 'public' ? 'Everyone' : visibility === 'followers' ? 'Followers only' : 'Subscribers only'}
                    </p>
                    <p className="text-white/40 text-[12px]">Who can see this post</p>
                  </div>
                </div>
                <ChevronDown className="w-5 h-5 text-white/40" />
              </button>

              {/* Future: Creator options will go here */}
              {/* Example placeholder for tips option (will implement later):
              {isCreator && (
                <button className="w-full flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10 mt-2">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
                      <DollarSign className="w-4 h-4 text-white/60" />
                    </div>
                    <div className="text-left">
                      <p className="text-white text-[14px] font-medium">Enable tips</p>
                      <p className="text-white/40 text-[12px]">Let viewers send tips on this post</p>
                    </div>
                  </div>
                  <Switch checked={false} />
                </button>
              )}
              */}
            </div>
          )}
        </div>
      </div>

      {/* Spacer at bottom for safe area */}
      <div className="h-4" />

      {/* Visibility picker modal */}
      <AnimatePresence>
        {showVisibilityPicker && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40"
              onClick={() => setShowVisibilityPicker(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="fixed bottom-0 left-0 right-0 bg-[#1c1c1e] rounded-t-2xl z-50 overflow-hidden"
            >
              <div className="p-4">
                <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
                <h3 className="text-white text-lg font-semibold text-center mb-4">Who can reply?</h3>

                <div className="space-y-2">
                  <button
                    onClick={() => { setVisibility('public'); setShowVisibilityPicker(false); }}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl transition-colors ${
                      visibility === 'public' ? 'bg-white/10' : 'bg-transparent'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                      <Globe className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white font-medium">Anyone</p>
                      <p className="text-white/50 text-sm">Anyone can reply to your post</p>
                    </div>
                    {visibility === 'public' && (
                      <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-black" />
                      </div>
                    )}
                  </button>

                  <button
                    onClick={() => { setVisibility('followers'); setShowVisibilityPicker(false); }}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl transition-colors ${
                      visibility === 'followers' ? 'bg-white/10' : 'bg-transparent'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white font-medium">Followers</p>
                      <p className="text-white/50 text-sm">Only people who follow you</p>
                    </div>
                    {visibility === 'followers' && (
                      <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-black" />
                      </div>
                    )}
                  </button>

                  {isCreator && (
                    <button
                      onClick={() => { setVisibility('subscribers'); setShowVisibilityPicker(false); }}
                      className={`w-full flex items-center gap-3 p-4 rounded-xl transition-colors ${
                        visibility === 'subscribers' ? 'bg-white/10' : 'bg-transparent'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                        <Star className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-white font-medium">Subscribers</p>
                        <p className="text-white/50 text-sm">Only your paid subscribers</p>
                      </div>
                      {visibility === 'subscribers' && (
                        <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
                          <div className="w-2 h-2 rounded-full bg-black" />
                        </div>
                      )}
                    </button>
                  )}
                </div>
              </div>
              <div className="h-8" /> {/* Safe area spacer */}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Gradient picker modal */}
      <AnimatePresence>
        {showGradientPicker && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40"
              onClick={() => setShowGradientPicker(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="fixed bottom-0 left-0 right-0 z-50 overflow-hidden rounded-t-3xl"
              style={{
                background: 'rgba(20, 20, 20, 0.95)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
            >
              <div className="p-4">
                <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
                <h3 className="text-white text-lg font-semibold text-center mb-1">Post Style</h3>
                <p className="text-white/50 text-sm text-center mb-6">Choose a background for your post</p>

                <div className="grid grid-cols-3 gap-3">
                  {(Object.entries(GRADIENTS) as [GradientKey, typeof GRADIENTS[GradientKey]][]).map(([key, gradient]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setSelectedGradient(key)
                        setShowGradientPicker(false)
                      }}
                      className={`relative aspect-[4/3] rounded-xl overflow-hidden transition-all ${
                        selectedGradient === key
                          ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-95'
                          : 'hover:scale-95'
                      }`}
                    >
                      <div
                        className={`absolute inset-0 ${gradient.preview}`}
                        style={gradient.value ? { background: gradient.value } : {}}
                      />
                      <div className="absolute inset-0 flex items-end p-2">
                        <span className="text-[11px] font-medium text-white/80">{gradient.name}</span>
                      </div>
                      {selectedGradient === key && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white flex items-center justify-center">
                          <Sparkles className="w-3 h-3 text-black" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-8" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Image, Video, Lock, Globe, Users, Send, Loader2, DollarSign, X, Play, Star } from 'lucide-react'
import { createPost, type User, type CreatePostData } from '../lib/api'
import { uploadPostMedia, getMediaType, compressImage, generateVideoThumbnailFile, uploadVideoThumbnail } from '../lib/storage'
import { getUserSettings } from '../lib/settingsApi'

interface CreatePageProps {
  user: User
  onBecomeCreator?: () => void
}

type Visibility = 'public' | 'followers' | 'subscribers'

interface MediaFile {
  file: File
  preview: string
  type: 'image' | 'video'
  thumbnail?: {
    file: File | null
    preview?: string
  }
}

export default function CreatePage({ user, onBecomeCreator }: CreatePageProps) {
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [defaultVisibility, setDefaultVisibility] = useState<Visibility>('public')
  const [isNsfw, setIsNsfw] = useState(false)
  const [unlockPrice, setUnlockPrice] = useState('')
  const [showPriceInput, setShowPriceInput] = useState(false)
  const [posting, setPosting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([])

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

    return () => {
      mounted = false
    }
  }, [user.telegram_id, isCreator])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, _type: 'image' | 'video') => {
    const files = e.target.files
    if (!files) return

    const newFiles: MediaFile[] = []

    for (const file of Array.from(files)) {
      const mediaType = getMediaType(file)
      if (mediaType === 'unknown') continue

      // Create preview
      const preview = URL.createObjectURL(file)
      let thumbnail: MediaFile['thumbnail']

      if (mediaType === 'video') {
        const thumbFile = await generateVideoThumbnailFile(file)
        if (thumbFile) {
          thumbnail = {
            file: thumbFile,
            preview: URL.createObjectURL(thumbFile)
          }
        }
      }

      newFiles.push({
        file,
        preview,
        type: mediaType as 'image' | 'video',
        thumbnail
      })
    }

    setMediaFiles(prev => [...prev, ...newFiles].slice(0, 10)) // Max 10 files
    e.target.value = '' // Reset input
  }

  const removeMedia = (index: number) => {
    setMediaFiles(prev => {
      const newFiles = [...prev]
      URL.revokeObjectURL(newFiles[index].preview)
      if (newFiles[index].thumbnail?.preview) {
        URL.revokeObjectURL(newFiles[index].thumbnail.preview)
      }
      newFiles.splice(index, 1)
      return newFiles
    })
  }

  const handlePost = async () => {
    if ((!content.trim() && mediaFiles.length === 0) || posting) return

    setPosting(true)
    setUploadProgress('Preparing...')

    try {
      const mediaUrls: string[] = []
      const thumbnailUrls: (string | null)[] = []

      // Upload all media files
      if (mediaFiles.length > 0) {
        for (let i = 0; i < mediaFiles.length; i++) {
          const mediaFile = mediaFiles[i]
          setUploadProgress(`Uploading ${i + 1}/${mediaFiles.length}...`)

          let fileToUpload = mediaFile.file

          // Compress if image
          if (mediaFile.type === 'image') {
            setUploadProgress(`Compressing ${i + 1}/${mediaFiles.length}...`)
            fileToUpload = await compressImage(mediaFile.file)
          }

          setUploadProgress(`Uploading ${i + 1}/${mediaFiles.length}...`)
          const result = await uploadPostMedia(fileToUpload, user.telegram_id)

          if (result.error) {
            alert('Upload failed: ' + result.error)
            setPosting(false)
            setUploadProgress('')
            return
          }

          if (result.url) {
            mediaUrls.push(result.url)
          }

          if (mediaFile.type === 'video') {
            let thumbnailFile = mediaFile.thumbnail?.file
            if (!thumbnailFile) {
              thumbnailFile = await generateVideoThumbnailFile(mediaFile.file)
            }

            let thumbnailUrl: string | null = null
            if (thumbnailFile) {
              const thumbUpload = await uploadVideoThumbnail(thumbnailFile, user.telegram_id)
              if (thumbUpload.error) {
                console.warn('Thumbnail upload failed:', thumbUpload.error)
              } else {
                thumbnailUrl = thumbUpload.url
              }
            }
            thumbnailUrls.push(thumbnailUrl)
          } else {
            thumbnailUrls.push(null)
          }
        }
      }

      setUploadProgress('Creating post...')

      // Non-creators can only post public content
      const finalVisibility = isCreator ? visibility : 'public'
      const finalNsfw = isCreator ? isNsfw : false
      const finalPrice = isCreator && showPriceInput ? parseFloat(unlockPrice) || 0 : 0

      const hasMedia = mediaUrls.length > 0
      const hasVideo = mediaFiles.some(file => file.type === 'video')
      const primaryMediaType = hasMedia ? (hasVideo ? 'video' : 'image') : 'text'
      const postPayload: CreatePostData = {
        content: content.trim(),
        media_url: hasMedia ? mediaUrls[0] : undefined, // First media as main
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
        console.error('Create post failed:', error)
        alert(`Failed to create post: ${error.message || 'Please try again.'}`)
      } else {
        setSuccess(true)
        setContent('')
        setVisibility('public')
        setIsNsfw(false)
        setUnlockPrice('')
        setShowPriceInput(false)
        setVisibility(defaultVisibility)
        // Clean up previews
        mediaFiles.forEach(m => {
          URL.revokeObjectURL(m.preview)
          if (m.thumbnail?.preview) {
            URL.revokeObjectURL(m.thumbnail.preview)
          }
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

  return (
    <div className="relative min-h-screen bg-[#040509] text-white overflow-hidden pb-24">
      {/* Spacey background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(1px 1px at 10% 20%, rgba(255,255,255,0.35), rgba(255,255,255,0)), radial-gradient(1px 1px at 70% 40%, rgba(255,255,255,0.3), rgba(255,255,255,0)), radial-gradient(1px 1px at 40% 70%, rgba(255,255,255,0.25), rgba(255,255,255,0))' }} />
        <div className="absolute -top-24 -left-16 w-80 h-80 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute -bottom-10 right-0 w-72 h-72 rounded-full bg-purple-500/15 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto px-4">
        <div className="pt-6 pb-3 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">Create</p>
            <h2 className="text-2xl font-bold">New Post</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 border border-white/10 flex items-center justify-center">
              <Star className="w-5 h-5 text-blue-200" />
            </div>
          </div>
        </div>

        {/* Hidden file inputs */}
        <input
          type="file"
          ref={imageInputRef}
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e, 'image')}
        />
        <input
          type="file"
          ref={videoInputRef}
          accept="video/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e, 'video')}
        />

        {success && (
          <motion.div
            className="mb-4 p-3 bg-emerald-500/15 text-emerald-100 rounded-xl text-center border border-emerald-500/30"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            Post created successfully!
          </motion.div>
        )}

        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-lg shadow-[0_15px_45px_rgba(0,0,0,0.35)] p-4">
            <div className="flex gap-3 mb-4">
              <img
                src={user.avatar_url || 'https://i.pravatar.cc/150?u=' + user.telegram_id}
                alt=""
                className="w-11 h-11 rounded-full object-cover border border-white/10"
              />
              <textarea
                placeholder="Share something stellar... ✨"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="flex-1 resize-none text-sm bg-white/5 border border-white/10 focus:border-white/30 rounded-xl px-4 py-3 min-h-[120px] text-white placeholder:text-white/40 focus:outline-none transition"
              />
            </div>

            {/* Media Preview */}
            {mediaFiles.length > 0 && (
              <div className="mb-4">
                <div className={`grid gap-2 ${mediaFiles.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  {mediaFiles.map((media, index) => (
                    <div key={index} className="relative rounded-xl overflow-hidden bg-white/5 border border-white/10">
                      {media.type === 'image' ? (
                        <img
                          src={media.preview}
                          alt=""
                          className="w-full h-48 object-cover"
                        />
                      ) : (
                        <div className="relative">
                          <img
                            src={media.thumbnail?.preview || media.preview}
                            alt=""
                            className="w-full h-48 object-cover"
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                            <Play className="w-12 h-12 text-white" fill="white" />
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => removeMedia(index)}
                        className="absolute top-2 right-2 w-8 h-8 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 py-3 border-t border-white/5">
              <button
                onClick={() => imageInputRef.current?.click()}
                className="flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors"
              >
                <div className="p-2 rounded-full bg-white/10 border border-white/10">
                  <Image className="w-4 h-4" />
                </div>
                <span>Photo</span>
              </button>
              <button
                onClick={() => videoInputRef.current?.click()}
                className="flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors"
              >
                <div className="p-2 rounded-full bg-white/10 border border-white/10">
                  <Video className="w-4 h-4" />
                </div>
                <span>Video</span>
              </button>
              {mediaFiles.length > 0 && (
                <span className="text-xs text-white/50 ml-auto">
                  {mediaFiles.length}/10 files
                </span>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-lg shadow-[0_15px_45px_rgba(0,0,0,0.35)] p-4 space-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/50 mb-2">Visibility</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setVisibility('public')}
                  className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-all border ${visibility === 'public' ? 'border-blue-400 bg-blue-500/20 text-white shadow-[0_0_25px_rgba(59,130,246,0.25)]' : 'border-white/10 bg-white/5 text-white/70'}`}
                >
                  <Globe className="w-4 h-4" />
                  Public
                </button>
                <button
                  onClick={() => setVisibility('followers')}
                  className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-all border ${visibility === 'followers' ? 'border-blue-400 bg-blue-500/20 text-white shadow-[0_0_25px_rgba(59,130,246,0.25)]' : 'border-white/10 bg-white/5 text-white/70'}`}
                >
                  <Users className="w-4 h-4" />
                  Followers
                </button>
                {isCreator && (
                  <button
                    onClick={() => setVisibility('subscribers')}
                    className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-all border ${visibility === 'subscribers' ? 'border-blue-400 bg-blue-500/20 text-white shadow-[0_0_25px_rgba(59,130,246,0.25)]' : 'border-white/10 bg-white/5 text-white/70'}`}
                  >
                    <Lock className="w-4 h-4" />
                    Subs
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm font-medium">
                <span className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-400/40 flex items-center justify-center">
                  <DollarSign className="w-3.5 h-3.5 text-purple-200" />
                </span>
                Pay to unlock
              </label>
              <div
                onClick={() => setShowPriceInput(!showPriceInput)}
                className={`w-12 h-6 rounded-full transition-colors cursor-pointer border ${showPriceInput ? 'bg-emerald-500 border-emerald-400' : 'bg-white/10 border-white/20'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform mt-0.5 ${showPriceInput ? 'translate-x-6' : 'translate-x-1'}`} />
              </div>
            </div>

            {showPriceInput && (
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">$</span>
                <input
                  type="number"
                  value={unlockPrice}
                  onChange={(e) => setUnlockPrice(e.target.value)}
                  placeholder="5.00"
                  className="w-full pl-7 pr-4 py-3 rounded-xl border border-white/15 bg-white/5 text-sm text-white placeholder:text-white/40 focus:border-blue-400 focus:outline-none"
                  min="0"
                  step="0.50"
                />
                <p className="text-xs text-white/60 mt-1">Viewers pay this to unlock the post.</p>
              </div>
            )}

            {isCreator && (
              <label className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-red-500/20 border border-red-400/40 flex items-center justify-center">
                    <Lock className="w-3.5 h-3.5 text-red-200" />
                  </span>
                  Mark as NSFW
                </div>
                <input
                  type="checkbox"
                  checked={isNsfw}
                  onChange={(e) => setIsNsfw(e.target.checked)}
                  className="w-5 h-5 accent-red-400 cursor-pointer"
                />
              </label>
            )}

            <motion.button
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 shadow-[0_12px_30px_rgba(59,130,246,0.35)] hover:shadow-[0_16px_40px_rgba(99,102,241,0.45)] transition disabled:opacity-50 disabled:cursor-not-allowed"
              whileTap={{ scale: 0.98 }}
              disabled={(!content.trim() && mediaFiles.length === 0) || posting}
              onClick={handlePost}
            >
              {posting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{uploadProgress || 'Posting...'}</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Post</span>
                </>
              )}
            </motion.button>
          </div>

          {!isCreator && (
            <motion.div
              className="rounded-2xl border border-white/10 bg-gradient-to-r from-purple-600/40 via-blue-600/35 to-indigo-600/40 backdrop-blur-lg shadow-[0_20px_60px_rgba(0,0,0,0.45)] p-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-white/15 border border-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <Star className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-white mb-1">Unlock Creator Features</h3>
                  <p className="text-xs text-white/70 mb-3">
                    Post exclusive content, receive gifts & tips, set subscription prices, and earn money!
                  </p>
                  <motion.button
                    className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-lg shadow-md"
                    whileTap={{ scale: 0.95 }}
                    onClick={onBecomeCreator}
                  >
                    Become a Creator
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}

          {isCreator && (
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-lg p-4">
              <h3 className="font-semibold text-sm text-white mb-2">Visibility Guide</h3>
              <ul className="text-xs text-white/70 space-y-1">
                <li><strong className="text-white">Public:</strong> Everyone can see</li>
                <li><strong className="text-white">Followers:</strong> Only people who follow you</li>
                <li><strong className="text-white">Subscribers:</strong> Only paid subscribers</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

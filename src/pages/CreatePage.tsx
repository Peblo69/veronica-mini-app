import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Image, Video, Lock, Globe, Users, Send, Loader2, DollarSign, AlertTriangle, X, Play, Star } from 'lucide-react'
import { createPost, type User } from '../lib/api'
import { uploadPostMedia, getMediaType, compressImage } from '../lib/storage'

interface CreatePageProps {
  user: User
  onBecomeCreator?: () => void
}

type Visibility = 'public' | 'followers' | 'subscribers'

interface MediaFile {
  file: File
  preview: string
  type: 'image' | 'video'
}

export default function CreatePage({ user, onBecomeCreator }: CreatePageProps) {
  const [content, setContent] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('public')
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, _type: 'image' | 'video') => {
    const files = e.target.files
    if (!files) return

    const newFiles: MediaFile[] = []

    for (const file of Array.from(files)) {
      const mediaType = getMediaType(file)
      if (mediaType === 'unknown') continue

      // Create preview
      const preview = URL.createObjectURL(file)
      newFiles.push({
        file,
        preview,
        type: mediaType as 'image' | 'video'
      })
    }

    setMediaFiles(prev => [...prev, ...newFiles].slice(0, 10)) // Max 10 files
    e.target.value = '' // Reset input
  }

  const removeMedia = (index: number) => {
    setMediaFiles(prev => {
      const newFiles = [...prev]
      URL.revokeObjectURL(newFiles[index].preview)
      newFiles.splice(index, 1)
      return newFiles
    })
  }

  const handlePost = async () => {
    if ((!content.trim() && mediaFiles.length === 0) || posting) return

    setPosting(true)
    setUploadProgress('Preparing...')

    try {
      let mediaUrl = ''

      // Upload media files
      if (mediaFiles.length > 0) {
        setUploadProgress(`Uploading media...`)

        // For now, upload first file (we can extend to multiple later)
        const firstFile = mediaFiles[0]
        let fileToUpload = firstFile.file

        // Compress if image
        if (firstFile.type === 'image') {
          setUploadProgress('Compressing image...')
          fileToUpload = await compressImage(firstFile.file)
        }

        setUploadProgress('Uploading...')
        const result = await uploadPostMedia(fileToUpload, user.telegram_id)

        if (result.error) {
          alert('Upload failed: ' + result.error)
          setPosting(false)
          setUploadProgress('')
          return
        }

        mediaUrl = result.url || ''
      }

      setUploadProgress('Creating post...')

      // Non-creators can only post public content
      const finalVisibility = isCreator ? visibility : 'public'
      const finalNsfw = isCreator ? isNsfw : false
      const finalPrice = isCreator && showPriceInput ? parseFloat(unlockPrice) || 0 : 0

      const { error } = await createPost(user.telegram_id, {
        content,
        media_url: mediaUrl,
        visibility: finalVisibility,
        is_nsfw: finalNsfw,
        unlock_price: finalPrice,
      })

      if (error) {
        alert('Failed to create post')
      } else {
        setSuccess(true)
        setContent('')
        setVisibility('public')
        setIsNsfw(false)
        setUnlockPrice('')
        setShowPriceInput(false)
        // Clean up previews
        mediaFiles.forEach(m => URL.revokeObjectURL(m.preview))
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
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">Create Post</h2>

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
          className="mb-4 p-3 bg-green-100 text-green-700 rounded-xl text-center"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          Post created successfully!
        </motion.div>
      )}

      <div className="card p-4">
        <div className="flex gap-3 mb-4">
          <img
            src={user.avatar_url || 'https://i.pravatar.cc/150?u=' + user.telegram_id}
            alt=""
            className="w-10 h-10 rounded-full object-cover"
          />
          <textarea
            placeholder="What's on your mind?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1 resize-none text-sm focus:outline-none min-h-[100px]"
          />
        </div>

        {/* Media Preview */}
        {mediaFiles.length > 0 && (
          <div className="mb-4">
            <div className={`grid gap-2 ${mediaFiles.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {mediaFiles.map((media, index) => (
                <div key={index} className="relative rounded-xl overflow-hidden bg-gray-100">
                  {media.type === 'image' ? (
                    <img
                      src={media.preview}
                      alt=""
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="relative">
                      <video
                        src={media.preview}
                        className="w-full h-48 object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <Play className="w-12 h-12 text-white" fill="white" />
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => removeMedia(index)}
                    className="absolute top-2 right-2 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 py-3 border-t border-gray-100">
          <button
            onClick={() => imageInputRef.current?.click()}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-of-blue transition-colors"
          >
            <Image className="w-5 h-5" />
            <span>Photo</span>
          </button>
          <button
            onClick={() => videoInputRef.current?.click()}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-of-blue transition-colors"
          >
            <Video className="w-5 h-5" />
            <span>Video</span>
          </button>
          {mediaFiles.length > 0 && (
            <span className="text-xs text-gray-400 ml-auto">
              {mediaFiles.length}/10 files
            </span>
          )}
        </div>

        {isCreator ? (
          <div className="py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-2 font-medium">WHO CAN SEE THIS?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setVisibility('public')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                  visibility === 'public' ? 'bg-of-blue text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                <Globe className="w-4 h-4" />
                Public
              </button>
              <button
                onClick={() => setVisibility('followers')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                  visibility === 'followers' ? 'bg-of-blue text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                <Users className="w-4 h-4" />
                Followers
              </button>
              <button
                onClick={() => setVisibility('subscribers')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all ${
                  visibility === 'subscribers' ? 'bg-of-blue text-white' : 'bg-gray-100 text-gray-600'
                }`}
              >
                <Lock className="w-4 h-4" />
                Subs
              </button>
            </div>
          </div>
        ) : (
          <div className="py-3 border-t border-gray-100">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Globe className="w-4 h-4 text-of-blue" />
              <span>Your post will be visible to everyone</span>
            </div>
          </div>
        )}

        {isCreator && (
          <div className="py-3 border-t border-gray-100 space-y-3">
          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-medium">NSFW Content</span>
            </div>
            <div
              onClick={() => setIsNsfw(!isNsfw)}
              className={`w-11 h-6 rounded-full transition-colors cursor-pointer ${isNsfw ? 'bg-orange-500' : 'bg-gray-300'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform mt-0.5 ${isNsfw ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
            </div>
          </label>
          {isNsfw && (
            <p className="text-xs text-orange-600 bg-orange-50 p-2 rounded-lg">
              NSFW content is only visible to subscribers
            </p>
          )}

          <label className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium">Pay to Unlock</span>
            </div>
            <div
              onClick={() => setShowPriceInput(!showPriceInput)}
              className={`w-11 h-6 rounded-full transition-colors cursor-pointer ${showPriceInput ? 'bg-green-500' : 'bg-gray-300'}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform mt-0.5 ${showPriceInput ? 'translate-x-5 ml-0.5' : 'translate-x-0.5'}`} />
            </div>
          </label>
          {showPriceInput && (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                type="number"
                value={unlockPrice}
                onChange={(e) => setUnlockPrice(e.target.value)}
                placeholder="5.00"
                className="w-full pl-7 pr-4 py-2 rounded-lg border border-gray-200 focus:border-of-blue focus:outline-none text-sm"
                min="0"
                step="0.50"
              />
              <p className="text-xs text-gray-500 mt-1">Users pay this to unlock</p>
            </div>
          )}
          </div>
        )}

        <div className="pt-3 border-t border-gray-100">
          <motion.button
            className="btn-subscribe w-full flex items-center justify-center gap-2"
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
      </div>

      {!isCreator && (
        <motion.div
          className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-100"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center flex-shrink-0">
              <Star className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 mb-1">Unlock Creator Features</h3>
              <p className="text-xs text-gray-600 mb-3">
                Post exclusive content, receive gifts & tips, set subscription prices, and earn money!
              </p>
              <motion.button
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-semibold rounded-lg shadow-md"
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
        <div className="mt-4 p-4 bg-blue-50 rounded-xl">
          <h3 className="font-semibold text-sm text-blue-800 mb-2">Visibility Guide</h3>
          <ul className="text-xs text-blue-700 space-y-1">
            <li><strong>Public:</strong> Everyone can see</li>
            <li><strong>Followers:</strong> Only people who follow you</li>
            <li><strong>Subscribers:</strong> Only paid subscribers</li>
            <li><strong>NSFW:</strong> Always requires subscription</li>
          </ul>
        </div>
      )}
    </div>
  )
}

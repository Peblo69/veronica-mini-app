import { supabase } from './supabase'

// ============================================
// SUPABASE STORAGE API
// ============================================

export type BucketName = 'avatars' | 'posts' | 'messages' | 'stories' | 'livestreams'

export interface MediaMetadata {
  width?: number
  height?: number
  duration?: number  // For videos, in seconds
  sizeBytes: number
  mimeType: string
}

export interface UploadResult {
  url: string | null
  error: string | null
  path: string | null
  metadata?: MediaMetadata
}

// Generate unique filename
function generateFilename(file: File, userId: number): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const ext = file.name.split('.').pop() || 'jpg'
  return `${userId}/${timestamp}-${random}.${ext}`
}

// Extract metadata from image
async function getImageMetadata(file: File): Promise<Partial<MediaMetadata>> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve({ sizeBytes: file.size, mimeType: file.type })
      return
    }

    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(img.src)
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        sizeBytes: file.size,
        mimeType: file.type,
      })
    }
    img.onerror = () => {
      resolve({ sizeBytes: file.size, mimeType: file.type })
    }
    img.src = URL.createObjectURL(file)
  })
}

// Extract metadata from video
async function getVideoMetadata(file: File): Promise<Partial<MediaMetadata>> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve({ sizeBytes: file.size, mimeType: file.type })
      return
    }

    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true

    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src)
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Math.round(video.duration),
        sizeBytes: file.size,
        mimeType: file.type,
      })
    }
    video.onerror = () => {
      resolve({ sizeBytes: file.size, mimeType: file.type })
    }
    video.src = URL.createObjectURL(file)
  })
}

// Get media metadata based on file type
async function extractMediaMetadata(file: File): Promise<MediaMetadata> {
  const baseMetadata: MediaMetadata = {
    sizeBytes: file.size,
    mimeType: file.type,
  }

  if (file.type.startsWith('image/')) {
    const imgMeta = await getImageMetadata(file)
    return { ...baseMetadata, ...imgMeta }
  }

  if (file.type.startsWith('video/')) {
    const vidMeta = await getVideoMetadata(file)
    return { ...baseMetadata, ...vidMeta }
  }

  return baseMetadata
}

// Upload file to bucket
export async function uploadFile(
  bucket: BucketName,
  file: File,
  userId: number,
  extractMetadata = true
): Promise<UploadResult> {
  try {
    const filename = generateFilename(file, userId)
    console.log(`[Storage] Uploading to ${bucket}:`, { filename, size: file.size, type: file.type })

    // Extract metadata before upload
    const metadata = extractMetadata ? await extractMediaMetadata(file) : undefined

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filename, file, {
        cacheControl: '3600',
        upsert: true // Allow overwriting if file exists
      })

    if (error) {
      console.error(`[Storage] Upload error to ${bucket}:`, error)
      return { url: null, error: error.message, path: null }
    }

    console.log(`[Storage] Upload success:`, data)

    // Messages bucket is private, use signed URL
    // Other buckets are public
    let url: string

    if (bucket === 'messages') {
      // Create signed URL that expires in 1 year (31536000 seconds)
      const { data: signedData, error: signedError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(filename, 31536000)

      if (signedError || !signedData?.signedUrl) {
        console.error(`[Storage] Signed URL error:`, signedError)
        // Fallback to public URL
        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filename)
        url = urlData.publicUrl
      } else {
        url = signedData.signedUrl
        console.log(`[Storage] Signed URL created:`, url)
      }
    } else {
      // Get public URL for public buckets
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filename)
      url = urlData.publicUrl
    }

    console.log(`[Storage] Final URL:`, url)
    if (metadata) {
      console.log(`[Storage] Media metadata:`, metadata)
    }

    return {
      url,
      error: null,
      path: filename,
      metadata,
    }
  } catch (err: any) {
    console.error(`[Storage] Exception:`, err)
    return { url: null, error: err.message, path: null }
  }
}

// Upload multiple files
export async function uploadMultipleFiles(
  bucket: BucketName,
  files: File[],
  userId: number
): Promise<UploadResult[]> {
  const results = await Promise.all(
    files.map(file => uploadFile(bucket, file, userId))
  )
  return results
}

// Delete file from bucket
export async function deleteFile(bucket: BucketName, path: string): Promise<boolean> {
  console.log(`[Storage] Deleting file from ${bucket}:`, path)

  const { data, error } = await supabase.storage
    .from(bucket)
    .remove([path])

  if (error) {
    console.error(`[Storage] Delete error from ${bucket}:`, error)
    return false
  }

  console.log(`[Storage] Delete success:`, data)
  return true
}

// Upload avatar
export async function uploadAvatar(file: File, userId: number): Promise<UploadResult> {
  return uploadFile('avatars', file, userId)
}

// Upload post media (images/videos)
export async function uploadPostMedia(file: File, userId: number): Promise<UploadResult> {
  return uploadFile('posts', file, userId)
}

// Upload message media
export async function uploadMessageMedia(file: File, userId: number): Promise<UploadResult> {
  return uploadFile('messages', file, userId)
}

// Upload story media
export async function uploadStoryMedia(file: File, userId: number): Promise<UploadResult> {
  return uploadFile('stories', file, userId)
}

// Get file type from file
export function getMediaType(file: File): 'image' | 'video' | 'audio' | 'unknown' {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return 'unknown'
}

// Compress image before upload (optional, for better performance)
export async function compressImage(file: File, maxWidth = 1920, quality = 0.8): Promise<File> {
  return new Promise((resolve) => {
    // If not an image or already small, return as-is
    if (!file.type.startsWith('image/') || file.size < 500000) {
      resolve(file)
      return
    }

    const img = new Image()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!

    img.onload = () => {
      let { width, height } = img

      if (width > maxWidth) {
        height = (height * maxWidth) / width
        width = maxWidth
      }

      canvas.width = width
      canvas.height = height
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }))
          } else {
            resolve(file)
          }
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = () => resolve(file)
    img.src = URL.createObjectURL(file)
  })
}

// Upload voice message (from Blob)
export async function uploadVoiceMessage(
  blob: Blob,
  userId: number,
  duration: number
): Promise<UploadResult & { duration: number }> {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const filename = `${userId}/${timestamp}-${random}.webm`

  try {
    console.log('[Storage] Uploading voice message:', { filename, size: blob.size })

    const { error } = await supabase.storage
      .from('messages')
      .upload(filename, blob, {
        cacheControl: '3600',
        contentType: 'audio/webm',
        upsert: true
      })

    if (error) {
      console.error('[Storage] Voice upload error:', error)
      return { url: null, error: error.message, path: null, duration: 0 }
    }

    // Messages bucket is private, use signed URL
    const { data: signedData, error: signedError } = await supabase.storage
      .from('messages')
      .createSignedUrl(filename, 31536000) // 1 year

    let url: string
    if (signedError || !signedData?.signedUrl) {
      console.error('[Storage] Voice signed URL error:', signedError)
      const { data: urlData } = supabase.storage.from('messages').getPublicUrl(filename)
      url = urlData.publicUrl
    } else {
      url = signedData.signedUrl
    }

    console.log('[Storage] Voice message URL:', url)

    return {
      url,
      error: null,
      path: filename,
      duration
    }
  } catch (err: any) {
    console.error('[Storage] Voice exception:', err)
    return { url: null, error: err.message, path: null, duration: 0 }
  }
}

// Generate video thumbnail
export async function generateVideoThumbnailFile(file: File): Promise<File | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null)
      return
    }

    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      resolve(null)
      return
    }

    const revoke = () => {
      if (video.src) {
        URL.revokeObjectURL(video.src)
      }
    }

    const captureFrame = () => {
      canvas.width = video.videoWidth || 1280
      canvas.height = video.videoHeight || 720
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          revoke()
          if (blob) {
            const thumbFile = new File([blob], `${file.name.split('.')[0]}-thumb.jpg`, { type: 'image/jpeg' })
            resolve(thumbFile)
          } else {
            resolve(null)
          }
        },
        'image/jpeg',
        0.78
      )
    }

    video.onloadedmetadata = () => {
      const targetTime = Math.min(1, Math.max(0.1, video.duration ? video.duration * 0.1 : 0.1))
      video.currentTime = targetTime
    }

    video.onseeked = captureFrame
    video.onerror = () => {
      revoke()
      resolve(null)
    }

    video.src = URL.createObjectURL(file)
  })
}

export async function uploadVideoThumbnail(file: File, userId: number): Promise<UploadResult> {
  return uploadFile('posts', file, userId)
}

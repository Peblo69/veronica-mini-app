import { supabase } from './supabase'

// ============================================
// SUPABASE STORAGE API
// ============================================

export type BucketName = 'avatars' | 'posts' | 'messages' | 'stories' | 'livestreams'

export interface UploadResult {
  url: string | null
  error: string | null
  path: string | null
}

// Generate unique filename
function generateFilename(file: File, userId: number): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const ext = file.name.split('.').pop() || 'jpg'
  return `${userId}/${timestamp}-${random}.${ext}`
}

// Upload file to bucket
export async function uploadFile(
  bucket: BucketName,
  file: File,
  userId: number
): Promise<UploadResult> {
  try {
    const filename = generateFilename(file, userId)

    const { error } = await supabase.storage
      .from(bucket)
      .upload(filename, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (error) {
      console.error('Upload error:', error)
      return { url: null, error: error.message, path: null }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filename)

    return {
      url: urlData.publicUrl,
      error: null,
      path: filename
    }
  } catch (err: any) {
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
  const { error } = await supabase.storage
    .from(bucket)
    .remove([path])
  return !error
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
    const { error } = await supabase.storage
      .from('messages')
      .upload(filename, blob, {
        cacheControl: '3600',
        contentType: 'audio/webm'
      })

    if (error) {
      return { url: null, error: error.message, path: null, duration: 0 }
    }

    const { data: urlData } = supabase.storage
      .from('messages')
      .getPublicUrl(filename)

    return {
      url: urlData.publicUrl,
      error: null,
      path: filename,
      duration
    }
  } catch (err: any) {
    return { url: null, error: err.message, path: null, duration: 0 }
  }
}

// Generate video thumbnail
export async function generateVideoThumbnail(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!

    video.onloadeddata = () => {
      video.currentTime = 1 // Seek to 1 second
    }

    video.onseeked = () => {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
      URL.revokeObjectURL(video.src)
    }

    video.onerror = () => {
      resolve(null)
      URL.revokeObjectURL(video.src)
    }

    video.src = URL.createObjectURL(file)
    video.load()
  })
}

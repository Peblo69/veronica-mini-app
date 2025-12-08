// This interface is now aligned with the one in MediaUploader, but with more details
export interface MediaFile {
  file: File
  preview: string
  type: 'image' | 'video' | 'other'
  metadata?: MediaMetadata
  thumbnail?: {
    file: File | null
    preview?: string
  }
  filters?: {
    brightness: number
    contrast: number
    saturation: number
    blur: number
    sepia: number
    grayscale: number
    invert: number
    'hue-rotate': number
  }
}

export interface MediaMetadata {
  width: number
  height: number
  duration?: number // for videos, in seconds
  sizeBytes: number
}

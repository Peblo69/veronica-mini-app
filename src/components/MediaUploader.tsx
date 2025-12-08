import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { X, File as FileIcon, Image as ImageIcon, Video as VideoIcon, Plus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// Re-defining for use in this component, originally from CreatePage.tsx
export interface MediaFile {
  file: File
  preview: string
  type: 'image' | 'video' | 'other'
}

interface MediaUploaderProps {
  mediaFiles: MediaFile[]
  setMediaFiles: React.Dispatch<React.SetStateAction<MediaFile[]>>
  maxFiles?: number
}

export default function MediaUploader({ mediaFiles, setMediaFiles, maxFiles = 10 }: MediaUploaderProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newFiles = acceptedFiles.map((file): MediaFile => {
        const type = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'other'
        return {
          file,
          preview: URL.createObjectURL(file),
          type
        }
      })

      setMediaFiles(prev => [...prev, ...newFiles].slice(0, maxFiles))
    },
    [setMediaFiles, maxFiles]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp'],
      'video/*': ['.mp4', '.mov', '.avi', '.webm']
    },
    maxSize: 50 * 1024 * 1024 // 50MB
  })

  const removeMedia = (index: number) => {
    setMediaFiles(prev => {
      const newFiles = [...prev]
      URL.revokeObjectURL(newFiles[index].preview)
      newFiles.splice(index, 1)
      return newFiles
    })
  }

  const getFileIcon = (type: MediaFile['type']) => {
    if (type === 'image') return <ImageIcon className="w-8 h-8 text-white/50" />
    if (type === 'video') return <VideoIcon className="w-8 h-8 text-white/50" />
    return <FileIcon className="w-8 h-8 text-white/50" />
  }

  return (
    <div className="space-y-4">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3"
        >
          {mediaFiles.map((mediaFile, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              layout
              className="relative aspect-square rounded-lg overflow-hidden border border-white/10 group"
            >
              {mediaFile.type === 'image' ? (
                <img
                  src={mediaFile.preview}
                  alt={mediaFile.file.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                  <div className="w-full h-full bg-black flex items-center justify-center">
                    <div className="absolute inset-0 bg-cover bg-center opacity-30" style={{backgroundImage: `url(${mediaFile.preview})`}} />
                    {getFileIcon(mediaFile.type)}
                  </div>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <p className="text-white text-xs text-center p-2 truncate">{mediaFile.file.name}</p>
              </div>
              <button
                onClick={() => removeMedia(i)}
                className="absolute top-1 right-1 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center text-white/70 hover:bg-black/80 hover:text-white transition-all z-10"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}

          {mediaFiles.length < maxFiles && (
            <div
              {...getRootProps()}
              className={`relative group aspect-square flex items-center justify-center border border-white/10 rounded-lg cursor-pointer transition-all duration-300 ease-in-out
                ${isDragActive ? 'border-white/50 bg-white/10 scale-105' : 'hover:border-white/30 hover:bg-white/5'}`}
            >
              <input {...getInputProps()} />
              <div className="text-center text-white/30 group-hover:text-white/60 transition-colors">
                <Plus className="w-8 h-8 mx-auto" />
                <p className="mt-2 text-xs font-semibold">Add Media</p>
              </div>
               <div className="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 opacity-0 group-hover:opacity-50 transition-opacity duration-500 blur-lg" />
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Square, Send, X, Loader2 } from 'lucide-react'

interface VoiceRecorderProps {
  onSend: (blob: Blob, duration: number) => Promise<void>
  onCancel?: () => void
  disabled?: boolean
}

export default function VoiceRecorder({ onSend, onCancel, disabled }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [isSending, setIsSending] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      })

      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start(100)
      setIsRecording(true)
      setDuration(0)

      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1)
      }, 1000)
    } catch (err) {
      console.error('Failed to start recording:', err)
      alert('Could not access microphone. Please allow microphone access.')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }

  const cancelRecording = () => {
    stopRecording()
    setAudioBlob(null)
    setDuration(0)
    chunksRef.current = []
    onCancel?.()
  }

  const handleSend = async () => {
    if (!audioBlob || isSending) return

    setIsSending(true)
    try {
      await onSend(audioBlob, duration)
      setAudioBlob(null)
      setDuration(0)
    } catch (err) {
      console.error('Failed to send voice:', err)
    }
    setIsSending(false)
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Initial state - just mic button
  if (!isRecording && !audioBlob) {
    return (
      <motion.button
        onClick={startRecording}
        disabled={disabled}
        className="p-2 hover:bg-gray-100 rounded-full disabled:opacity-50"
        whileTap={{ scale: 0.9 }}
      >
        <Mic className="w-5 h-5 text-gray-500" />
      </motion.button>
    )
  }

  // Recording or has recording
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="flex items-center gap-2 bg-red-50 rounded-full px-3 py-1"
      >
        {/* Cancel button */}
        <button
          onClick={cancelRecording}
          className="p-1 hover:bg-red-100 rounded-full"
        >
          <X className="w-4 h-4 text-red-500" />
        </button>

        {/* Recording indicator / waveform */}
        <div className="flex items-center gap-1">
          {isRecording && (
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="w-2 h-2 rounded-full bg-red-500"
            />
          )}
          <span className="text-sm font-medium text-red-600 min-w-[40px]">
            {formatDuration(duration)}
          </span>
        </div>

        {/* Waveform visualization */}
        {isRecording && (
          <div className="flex items-center gap-0.5 h-6">
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={i}
                className="w-1 bg-red-400 rounded-full"
                animate={{
                  height: [8, 16 + Math.random() * 8, 8],
                }}
                transition={{
                  repeat: Infinity,
                  duration: 0.5,
                  delay: i * 0.05,
                }}
              />
            ))}
          </div>
        )}

        {/* Stop/Send button */}
        {isRecording ? (
          <button
            onClick={stopRecording}
            className="p-2 bg-red-500 rounded-full text-white"
          >
            <Square className="w-4 h-4 fill-white" />
          </button>
        ) : audioBlob ? (
          <button
            onClick={handleSend}
            disabled={isSending}
            className="p-2 bg-of-blue rounded-full text-white"
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        ) : null}
      </motion.div>
    </AnimatePresence>
  )
}

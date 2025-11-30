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
        className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 disabled:opacity-50 text-gray-500"
        whileTap={{ scale: 0.9 }}
      >
        <Mic className="w-5 h-5" />
      </motion.button>
    )
  }

  // Recording or has recording - Floating UI
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[80] bg-black/20 backdrop-blur-sm" onClick={cancelRecording} />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9, x: '-50%' }}
        animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
        exit={{ opacity: 0, y: 20, scale: 0.9, x: '-50%' }}
        className="fixed bottom-40 left-1/2 z-[90] flex flex-col items-center gap-4 w-full max-w-[280px]"
      >
        <div className="bg-white rounded-[2rem] p-4 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 w-full flex flex-col items-center gap-4">
          
          {/* Waveform & Timer */}
          <div className="flex items-center justify-between w-full px-2">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-gray-300'}`} />
              <span className="text-lg font-bold font-mono text-gray-800">
                {formatDuration(duration)}
              </span>
            </div>

            {isRecording && (
               <div className="flex items-center gap-1 h-8">
                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-1 bg-red-400 rounded-full"
                    animate={{
                      height: [8, 12 + Math.random() * 16, 8],
                      opacity: [0.5, 1, 0.5]
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
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between w-full gap-4">
             <button
              onClick={cancelRecording}
              className="p-3 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            {isRecording ? (
              <button
                onClick={stopRecording}
                className="p-4 bg-red-500 rounded-full text-white shadow-lg shadow-red-500/30 hover:scale-105 transition-transform"
              >
                <Square className="w-6 h-6 fill-white" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={isSending}
                className="p-4 bg-of-blue rounded-full text-white shadow-lg shadow-blue-500/30 hover:scale-105 transition-transform disabled:opacity-50"
              >
                {isSending ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Send className="w-6 h-6 ml-0.5" />
                )}
              </button>
            )}
          </div>
          
          <p className="text-xs text-gray-400 font-medium">
            {isRecording ? 'Recording...' : 'Review your message'}
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

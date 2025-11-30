import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Play, Pause, Loader2 } from 'lucide-react'

export default function VoicePage() {
  const [isListening, setIsListening] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [response, setResponse] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)

  // Simulate audio level animation
  useEffect(() => {
    if (isListening) {
      const interval = setInterval(() => {
        setAudioLevel(Math.random() * 100)
      }, 100)
      return () => clearInterval(interval)
    } else {
      setAudioLevel(0)
    }
  }, [isListening])

  const toggleListening = async () => {
    if (isListening) {
      setIsListening(false)
      setIsProcessing(true)
      
      // Simulate processing
      await new Promise(resolve => setTimeout(resolve, 2000))
      setTranscript('Hello, how can you help me today?')
      
      await new Promise(resolve => setTimeout(resolve, 1500))
      setResponse('Hi! I am Veronica, your AI assistant. I can help you generate images, create videos, answer questions, and much more. What would you like to do?')
      setIsProcessing(false)
    } else {
      setTranscript('')
      setResponse('')
      setIsListening(true)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-180px)]">
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold">Voice Assistant</h2>
        <p className="text-sm text-white/50">Talk naturally with Veronica</p>
      </div>

      {/* Conversation Area */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-6">
        <AnimatePresence>
          {transcript && (
            <motion.div
              className="flex justify-end"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="max-w-[80%] bg-gradient-brand rounded-2xl rounded-br-sm px-4 py-3">
                <p className="text-sm">{transcript}</p>
              </div>
            </motion.div>
          )}
          
          {isProcessing && (
            <motion.div
              className="flex justify-start"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="glass rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm text-white/70">Thinking...</span>
              </div>
            </motion.div>
          )}
          
          {response && (
            <motion.div
              className="flex justify-start"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="max-w-[80%] glass rounded-2xl rounded-bl-sm px-4 py-3">
                <p className="text-sm">{response}</p>
                <button 
                  className={"mt-2 flex items-center gap-1 text-xs " + (isPlaying ? 'text-brand-purple' : 'text-white/50')}
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span>{isPlaying ? 'Playing...' : 'Play audio'}</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Voice Input Area */}
      <div className="text-center space-y-4">
        {/* Audio Visualizer */}
        <div className="flex items-center justify-center gap-1 h-12">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="w-1 bg-gradient-brand rounded-full"
              animate={{
                height: isListening 
                  ? Math.max(8, Math.sin(i * 0.5 + audioLevel * 0.1) * 20 + audioLevel * 0.3)
                  : 8
              }}
              transition={{ duration: 0.1 }}
            />
          ))}
        </div>

        {/* Mic Button */}
        <motion.button
          className={"w-20 h-20 rounded-full flex items-center justify-center transition-all " + (isListening ? 'bg-red-500 glow-pink' : 'bg-gradient-brand glow-purple')}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={toggleListening}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : isListening ? (
            <MicOff className="w-8 h-8" />
          ) : (
            <Mic className="w-8 h-8" />
          )}
        </motion.button>

        <p className="text-sm text-white/50">
          {isProcessing ? 'Processing...' : isListening ? 'Listening... Tap to stop' : 'Tap to speak'}
        </p>
      </div>
    </div>
  )
}

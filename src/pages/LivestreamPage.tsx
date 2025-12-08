import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AgoraRTC from 'agora-rtc-sdk-ng'
import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, IRemoteVideoTrack, IRemoteAudioTrack } from 'agora-rtc-sdk-ng'
import { ArrowLeft, Video, VideoOff, Mic, MicOff, Users, Gift, Send, X, Clock, Loader2, Image as ImageIcon, Shield } from 'lucide-react'
import { type User } from '../lib/api'
import { getGifts, type Gift as GiftType } from '../lib/chatApi'
import {
  AGORA_APP_ID,
  createLivestream,
  endLivestream,
  getLivestream,
  joinLivestream,
  leaveLivestream,
  getLivestreamMessages,
  sendLivestreamMessage,
  sendLivestreamGift,
  subscribeToLivestreamMessages,
  subscribeToViewerCount,
  getLivestreamAccess,
  purchaseLivestreamTicket,
  getRemainingStreamMinutes,
  addStreamingMinutes,
  type Livestream,
  type LivestreamMessage,
  type LivestreamAccessState
} from '../lib/livestreamApi'
import { uploadLivestreamMedia } from '../lib/storage'

interface LivestreamPageProps {
  user: User
  livestreamId?: string // If viewing
  isCreator?: boolean // If starting a stream
  onExit: () => void
}

export default function LivestreamPage({ user, livestreamId, isCreator, onExit }: LivestreamPageProps) {
  const [client, setClient] = useState<IAgoraRTCClient | null>(null)
  const [localVideoTrack, setLocalVideoTrack] = useState<ICameraVideoTrack | null>(null)
  const [localAudioTrack, setLocalAudioTrack] = useState<IMicrophoneAudioTrack | null>(null)
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<IRemoteVideoTrack | null>(null)
  const [remoteAudioTrack, setRemoteAudioTrack] = useState<IRemoteAudioTrack | null>(null)

  const [livestream, setLivestream] = useState<Livestream | null>(null)
  const [messages, setMessages] = useState<LivestreamMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [viewerCount, setViewerCount] = useState(0)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [showGifts, setShowGifts] = useState(false)
  const [gifts, setGifts] = useState<GiftType[]>([])
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [remainingMinutes, setRemainingMinutes] = useState(60)
  const [streamDuration, setStreamDuration] = useState(0)
  const [giftAnimation, setGiftAnimation] = useState<{ name: string; sender: string } | null>(null)
  const [accessState, setAccessState] = useState<LivestreamAccessState | null>(null)
  const [showTicketPrompt, setShowTicketPrompt] = useState(false)
  const [unlocking, setUnlocking] = useState(false)

  // Stream title for creator
  const [streamTitle, setStreamTitle] = useState('')
  const [streamDescription, setStreamDescription] = useState('')
  const [streamPrivate, setStreamPrivate] = useState(false)
  const [streamPrice, setStreamPrice] = useState(0)
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const [thumbnailUploading, setThumbnailUploading] = useState(false)
  const thumbnailInputRef = useRef<HTMLInputElement>(null)
  const [isStarting, setIsStarting] = useState(true)

  const videoRef = useRef<HTMLDivElement>(null)
  const remoteVideoRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const messageUnsubscribeRef = useRef<(() => void) | null>(null)
  const viewerCountUnsubscribeRef = useRef<(() => void) | null>(null)
  const hasLeftRef = useRef(false)
  const initialSettingsRef = useRef({
    title: '',
    description: '',
    entry_price: 0,
    is_private: false,
  })

  // Fetch Agora token if configured
  const fetchAgoraToken = async (channel: string, uid: number) => {
    const tokenUrl = import.meta.env.VITE_AGORA_TOKEN_URL
    if (!tokenUrl) return null
    try {
      const res = await fetch(`${tokenUrl}?channel=${encodeURIComponent(channel)}&uid=${uid}`)
      if (!res.ok) return null
      const data = await res.json()
      return data.token || null
    } catch (err) {
      console.warn('[Agora] token fetch failed', err)
      return null
    }
  }

  // Initialize
  useEffect(() => {
    loadGifts()

    if (isCreator) {
      // Pre-fill defaults if already had a scheduled title
      initialSettingsRef.current = {
        title: streamTitle,
        description: streamDescription,
        entry_price: streamPrice,
        is_private: streamPrivate,
      }
      checkStreamingLimit()
    } else if (livestreamId) {
      initViewer()
    }

    return () => {
      cleanup()
    }
  }, [])

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Duration tracking for creator
  useEffect(() => {
    if (isCreator && livestream && !isStarting) {
      durationIntervalRef.current = setInterval(() => {
        setStreamDuration(prev => {
          const newDuration = prev + 1
          // Update usage every minute
          if (newDuration % 60 === 0) {
            addStreamingMinutes(user.telegram_id, 1)
            setRemainingMinutes(r => Math.max(0, r - 1))
          }
          // Auto-end if limit reached
          if (newDuration >= remainingMinutes * 60) {
            handleEndStream()
          }
          return newDuration
        })
      }, 1000)
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
    }
  }, [isCreator, livestream, isStarting])

  const loadGifts = async () => {
    const data = await getGifts()
    setGifts(data)
  }

  const handleIncomingMessage = (msg: LivestreamMessage) => {
    setMessages(prev => [...prev, msg])
    if (msg.message_type === 'gift' && msg.gift) {
      setGiftAnimation({
        name: msg.gift.name,
        sender: msg.user?.first_name || msg.user?.username || 'Someone'
      })
      setTimeout(() => setGiftAnimation(null), 3000)
    }
  }

  const attachRealtimeSubscriptions = (streamId: string) => {
    messageUnsubscribeRef.current?.()
    messageUnsubscribeRef.current = subscribeToLivestreamMessages(streamId, handleIncomingMessage)

    viewerCountUnsubscribeRef.current?.()
    viewerCountUnsubscribeRef.current = subscribeToViewerCount(streamId, setViewerCount)
  }

  const checkStreamingLimit = async () => {
    const remaining = await getRemainingStreamMinutes(user.telegram_id)
    setRemainingMinutes(remaining)
    if (remaining <= 0) {
      setError('You have reached your daily streaming limit (60 minutes). Try again tomorrow!')
      setLoading(false)
    } else {
      setLoading(false)
    }
  }

  const initViewer = async () => {
    try {
      if (!livestreamId) return

      // Get livestream info
      const stream = await getLivestream(livestreamId)
      if (!stream || stream.status !== 'live') {
        setError('This stream has ended or does not exist')
        setLoading(false)
        return
      }

      setLivestream(stream)
      setViewerCount(stream.viewer_count)

      const access = await getLivestreamAccess(stream, user.telegram_id)
      setAccessState(access)
      setShowTicketPrompt(false)

      if (!access.can_watch) {
        if (access.requires_ticket && !access.has_ticket) {
          setShowTicketPrompt(true)
          setLoading(false)
          return
        }

        setError(access.reason || 'You do not have access to this stream.')
        setLoading(false)
        return
      }

      hasLeftRef.current = false
      await enterLivestreamAsViewer(stream)
    } catch (err) {
      console.error('Init viewer error:', err)
      setError('Failed to join stream')
      setLoading(false)
    }
  }

  const initAgoraViewer = async (channel: string) => {
    try {
      const agoraClient = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' })
      agoraClient.setClientRole('audience')

      agoraClient.on('user-published', async (remoteUser, mediaType) => {
        await agoraClient.subscribe(remoteUser, mediaType)
        if (mediaType === 'video') {
          const videoTrack = remoteUser.videoTrack
          setRemoteVideoTrack(videoTrack || null)
          if (videoTrack && remoteVideoRef.current) {
            videoTrack.play(remoteVideoRef.current)
          }
        }
        if (mediaType === 'audio') {
          const audioTrack = remoteUser.audioTrack
          setRemoteAudioTrack(audioTrack || null)
          audioTrack?.play()
        }
      })

      agoraClient.on('user-unpublished', () => {
        setRemoteVideoTrack(null)
        setRemoteAudioTrack(null)
      })

      const token = await fetchAgoraToken(channel, user.telegram_id)
      await agoraClient.join(AGORA_APP_ID, channel, token, user.telegram_id)
      setClient(agoraClient)
    } catch (err) {
      console.error('Agora viewer init error:', err)
      setError('Failed to connect to stream')
    }
  }

  const enterLivestreamAsViewer = async (stream: Livestream) => {
    try {
      setLivestream(stream)
      setViewerCount(stream.viewer_count)
      const msgs = await getLivestreamMessages(stream.id)
      setMessages(msgs)
      attachRealtimeSubscriptions(stream.id)

      await joinLivestream(stream.id, user.telegram_id)

      if (stream.agora_channel) {
        await initAgoraViewer(stream.agora_channel)
      }

      setLoading(false)
    } catch (err) {
      console.error('Enter viewer error:', err)
      setError('Failed to load stream')
      setLoading(false)
    }
  }

  const startStream = async () => {
    if (!streamTitle.trim()) {
      alert('Please enter a stream title')
      return
    }

    setIsStarting(false)
    setLoading(true)

    try {
      let thumbnailUrl: string | null = null
      if (thumbnailFile) {
        setThumbnailUploading(true)
        const upload = await uploadLivestreamMedia(thumbnailFile, user.telegram_id)
        setThumbnailUploading(false)
        if (upload.error || !upload.url) {
          alert('Failed to upload thumbnail')
          setLoading(false)
          return
        }
        thumbnailUrl = upload.url
      }

      // Create livestream in database
      const stream = await createLivestream(user.telegram_id, streamTitle, {
        description: streamDescription || undefined,
        is_private: streamPrivate,
        entry_price: Math.max(0, Math.floor(streamPrice)),
        thumbnail_url: thumbnailUrl
      })
      if (!stream) {
        setError('Failed to create stream')
        setLoading(false)
        return
      }

      setLivestream(stream)

      attachRealtimeSubscriptions(stream.id)

      // Initialize Agora as broadcaster
      if (stream.agora_channel) {
        await initAgoraBroadcaster(stream.agora_channel)
      }

      setLoading(false)
    } catch (err) {
      console.error('Start stream error:', err)
      setError('Failed to start stream')
      setLoading(false)
    }
  }

  const initAgoraBroadcaster = async (channel: string) => {
    try {
      const agoraClient = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' })
      agoraClient.setClientRole('host')

      // Get camera and microphone
      const [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks()

      setLocalAudioTrack(audioTrack)
      setLocalVideoTrack(videoTrack)

      // Play local video
      if (videoRef.current) {
        videoTrack.play(videoRef.current)
      }

      // Join and publish
      const token = await fetchAgoraToken(channel, user.telegram_id)
      await agoraClient.join(AGORA_APP_ID, channel, token, user.telegram_id)
      await agoraClient.publish([audioTrack, videoTrack])

      setClient(agoraClient)
    } catch (err) {
      console.error('Agora broadcaster init error:', err)
      setError('Failed to access camera/microphone. Please grant permissions.')
    }
  }

  const handleEndStream = async () => {
    if (livestream) {
      await endLivestream(livestream.id)
      // Add final duration
      const minutes = Math.ceil(streamDuration / 60)
      if (minutes > 0) {
        await addStreamingMinutes(user.telegram_id, minutes)
      }
    }
    cleanup()
    onExit()
  }

  const handleLeaveStream = async () => {
    if (livestream) {
      await leaveLivestream(livestream.id, user.telegram_id)
      hasLeftRef.current = true
    }
    cleanup()
    onExit()
  }

  const cleanup = () => {
    messageUnsubscribeRef.current?.()
    viewerCountUnsubscribeRef.current?.()
    messageUnsubscribeRef.current = null
    viewerCountUnsubscribeRef.current = null
    if (!isCreator && livestream && !hasLeftRef.current) {
      hasLeftRef.current = true
      void leaveLivestream(livestream.id, user.telegram_id)
    }
    setAccessState(null)
    setShowTicketPrompt(false)
    localVideoTrack?.close()
    localAudioTrack?.close()
    remoteVideoTrack?.stop()
    remoteAudioTrack?.stop()
    client?.leave()
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
    }
  }

  const toggleVideo = () => {
    if (localVideoTrack) {
      localVideoTrack.setEnabled(!isVideoEnabled)
      setIsVideoEnabled(!isVideoEnabled)
    }
  }

  const toggleAudio = () => {
    if (localAudioTrack) {
      localAudioTrack.setEnabled(!isAudioEnabled)
      setIsAudioEnabled(!isAudioEnabled)
    }
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !livestream || sending) return

    setSending(true)
    await sendLivestreamMessage(livestream.id, user.telegram_id, newMessage.trim())
    setNewMessage('')
    setSending(false)
  }

  const handleSendGift = async (gift: GiftType) => {
    if (!livestream || sending) return

    setSending(true)
    const { error } = await sendLivestreamGift(livestream.id, user.telegram_id, gift.id, gift.price)
    if (error) {
      alert(error)
    }
    setShowGifts(false)
    setSending(false)
  }

  const handleUnlockStream = async () => {
    if (unlocking) return
    const targetStream = livestream || (livestreamId ? await getLivestream(livestreamId) : null)
    if (!targetStream) {
      setError('This stream is no longer available')
      setShowTicketPrompt(false)
      return
    }

    setUnlocking(true)
    const result = await purchaseLivestreamTicket(targetStream.id, user.telegram_id)
    setUnlocking(false)

    if (!result.success) {
      alert(result.error || 'Failed to unlock this stream')
      return
    }

    const updatedAccess = await getLivestreamAccess(targetStream, user.telegram_id)
    setAccessState(updatedAccess)
    setShowTicketPrompt(false)
    hasLeftRef.current = false
    await enterLivestreamAsViewer(targetStream)
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const subscriptionBlocked = !isCreator && Boolean(accessState?.requires_subscription && !accessState?.has_subscription)
  const ticketPrice = accessState?.entry_price ?? livestream?.entry_price ?? 0

  // Error state
  if (error) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center text-white p-8">
          <p className="text-lg mb-4">{error}</p>
          <button onClick={onExit} className="btn-subscribe">
            Go Back
          </button>
        </div>
      </div>
    )
  }

  // Creator starting screen
  if (isCreator && isStarting && !loading) {
    return (
      <div className="fixed inset-0 bg-black overflow-y-auto">
        <div className="p-4 flex items-center gap-3">
          <button onClick={onExit} className="text-white">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <p className="text-xs text-white/60">Livestream setup</p>
            <h2 className="text-white text-xl font-bold">Go Live</h2>
          </div>
          <div className="ml-auto text-sm text-white/70">{remainingMinutes} min left today</div>
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-10 space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4">
            <div className="space-y-2">
              <label className="text-xs text-white/60">Title</label>
              <input
                type="text"
                value={streamTitle}
                onChange={(e) => setStreamTitle(e.target.value)}
                placeholder="Enter stream title..."
                className="w-full px-4 py-3 rounded-xl bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-white/60">Description (optional)</label>
              <textarea
                value={streamDescription}
                onChange={(e) => setStreamDescription(e.target.value)}
                placeholder="What will you stream?"
                className="w-full px-4 py-3 rounded-xl bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-white/70" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Private stream</p>
                  <p className="text-xs text-white/60">Only subscribers/ticket holders can watch</p>
                </div>
              </div>
              <button
                onClick={() => setStreamPrivate(!streamPrivate)}
                className={`w-12 h-7 rounded-full p-0.5 transition ${streamPrivate ? 'bg-blue-500' : 'bg-white/20'}`}
              >
                <div className={`w-6 h-6 bg-white rounded-full shadow transition ${streamPrivate ? 'translate-x-5' : ''}`} />
              </button>
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[180px] space-y-2">
                <label className="text-xs text-white/60">Ticket price (Stars)</label>
                <input
                  type="number"
                  min={0}
                  value={streamPrice}
                  onChange={(e) => setStreamPrice(Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-white/60">Thumbnail</label>
                <button
                  onClick={() => thumbnailInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-sm"
                  disabled={thumbnailUploading}
                >
                  <ImageIcon className="w-4 h-4" />
                  {thumbnailFile ? 'Change' : 'Upload'}
                </button>
                <input
                  ref={thumbnailInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) setThumbnailFile(file)
                  }}
                />
                {thumbnailUploading && <p className="text-[11px] text-yellow-400">Uploading...</p>}
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={startStream}
              className="w-full py-3 bg-red-500 text-white rounded-xl font-semibold disabled:opacity-60"
              disabled={loading || thumbnailUploading}
            >
              {loading ? 'Starting...' : 'Start Streaming'}
            </motion.button>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        </div>
      </div>
    )
  }

  // Loading
  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-white animate-spin" />
      </div>
    )
  }

  if (subscriptionBlocked) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-center p-6 space-y-4">
        <div>
          <h2 className="text-white text-2xl font-bold mb-2">Subscribers Only</h2>
          <p className="text-gray-300 text-sm">
            Subscribe to {livestream?.creator?.first_name || livestream?.creator?.username || 'this creator'} to watch this livestream.
          </p>
        </div>
        <button
          onClick={onExit}
          className="px-6 py-3 rounded-full bg-white text-black font-semibold"
        >
          Go Back
        </button>
      </div>
    )
  }

  // Main stream view
  return (
    <div className="fixed inset-0 bg-black flex flex-col">
      {/* Video area */}
      <div className="flex-1 relative">
        {/* Local video (creator) or Remote video (viewer) */}
        {isCreator ? (
          <div ref={videoRef} className="w-full h-full bg-gray-900" />
        ) : (
          <div ref={remoteVideoRef} className="w-full h-full bg-gray-900">
            {!remoteVideoTrack && (
              <div className="w-full h-full flex items-center justify-center">
                <p className="text-gray-500">Waiting for stream...</p>
              </div>
            )}
          </div>
        )}

        {/* Overlay UI */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Top bar */}
          <div className="flex justify-between items-start p-4 pointer-events-auto">
            <button
              onClick={isCreator ? handleEndStream : handleLeaveStream}
              className="p-2 bg-black/50 rounded-full"
            >
              <X className="w-6 h-6 text-white" />
            </button>

            <div className="flex items-center gap-2">
              {isCreator && (
                <div className="flex items-center gap-1 px-3 py-1.5 bg-red-500 rounded-full">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  <span className="text-white text-sm font-medium">LIVE</span>
                </div>
              )}
              <div className="flex items-center gap-1 px-3 py-1.5 bg-black/50 rounded-full">
                <Users className="w-4 h-4 text-white" />
                <span className="text-white text-sm">{viewerCount}</span>
              </div>
              {isCreator && (
                <div className="flex items-center gap-1 px-3 py-1.5 bg-black/50 rounded-full">
                  <Clock className="w-4 h-4 text-white" />
                  <span className="text-white text-sm">{formatDuration(streamDuration)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Creator info */}
          <div className="absolute top-16 left-4 flex items-center gap-3 pointer-events-auto">
            <img
              src={livestream?.creator?.avatar_url || `https://i.pravatar.cc/150?u=${livestream?.creator_id}`}
              alt=""
              className="w-10 h-10 rounded-full border-2 border-white"
            />
            <div>
              <p className="text-white font-semibold">
                {livestream?.creator?.first_name || livestream?.creator?.username}
              </p>
              <p className="text-gray-300 text-xs">{livestream?.title}</p>
            </div>
          </div>

          {/* Gift animation */}
          <AnimatePresence>
            {giftAnimation && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                className="absolute top-1/3 left-1/2 -translate-x-1/2 text-center"
              >
                <div className="text-6xl mb-2">🎁</div>
                <p className="text-white font-bold text-lg">
                  {giftAnimation.sender} sent {giftAnimation.name}!
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Creator controls */}
        {isCreator && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-4">
            <button
              onClick={toggleAudio}
              className={`p-4 rounded-full ${isAudioEnabled ? 'bg-white/20' : 'bg-red-500'}`}
            >
              {isAudioEnabled ? (
                <Mic className="w-6 h-6 text-white" />
              ) : (
                <MicOff className="w-6 h-6 text-white" />
              )}
            </button>
            <button
              onClick={toggleVideo}
              className={`p-4 rounded-full ${isVideoEnabled ? 'bg-white/20' : 'bg-red-500'}`}
            >
              {isVideoEnabled ? (
                <Video className="w-6 h-6 text-white" />
              ) : (
                <VideoOff className="w-6 h-6 text-white" />
              )}
            </button>
            <button
              onClick={handleEndStream}
              className="px-6 py-4 rounded-full bg-red-500"
            >
              <span className="text-white font-semibold">End</span>
            </button>
          </div>
        )}
      </div>

      {/* Chat section */}
      <div className="h-[40%] bg-black/90 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {messages.map((msg) => (
            <div key={msg.id} className="flex items-start gap-2">
              <img
                src={msg.user?.avatar_url || `https://i.pravatar.cc/150?u=${msg.user_id}`}
                alt=""
                className="w-6 h-6 rounded-full"
              />
              <div>
                <span className="text-gray-400 text-xs">
                  {msg.user?.first_name || msg.user?.username}
                </span>
                {msg.message_type === 'gift' ? (
                  <p className="text-yellow-400 text-sm">🎁 {msg.content}</p>
                ) : (
                  <p className="text-white text-sm">{msg.content}</p>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-gray-800">
        <div className="flex items-center gap-2">
            {!isCreator && (
              <button
                onClick={() => setShowGifts(true)}
                className="p-2 bg-gray-800 rounded-full"
              >
                <Gift className="w-5 h-5 text-yellow-400" />
              </button>
            )}
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Send a message..."
              className="flex-1 px-4 py-2 bg-gray-800 rounded-full text-white text-sm placeholder-gray-500 focus:outline-none"
            />
            <button
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || sending}
              className="p-2 bg-of-blue rounded-full disabled:opacity-50"
            >
              <Send className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* Gift picker */}
      <AnimatePresence>
        {showGifts && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            className="absolute bottom-0 left-0 right-0 bg-gray-900 rounded-t-3xl p-4"
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-bold">Send a Gift</h3>
              <button onClick={() => setShowGifts(false)}>
                <X className="w-5 h-5 text-white" />
              </button>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {gifts.map((gift) => (
                <button
                  key={gift.id}
                  onClick={() => handleSendGift(gift)}
                  className="flex flex-col items-center p-2 rounded-xl hover:bg-gray-800"
                >
                  <div className="text-2xl mb-1">🎁</div>
                  <span className="text-white text-[10px]">{gift.name}</span>
                  <span className="text-yellow-400 text-[10px]">{gift.price}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTicketPrompt && livestream && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[70] p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-sm bg-white/90 rounded-3xl p-6 text-center space-y-4 shadow-2xl"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Exclusive Access</p>
                <h3 className="text-2xl font-bold text-gray-900 mb-1">{livestream?.title || 'Livestream Access'}</h3>
                <p className="text-gray-600 text-sm">
                  Unlock this livestream for {ticketPrice} Stars. Stars go directly to the creator minus platform fees.
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleUnlockStream}
                disabled={unlocking}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-red-500 to-pink-500 text-white font-semibold disabled:opacity-60"
              >
                {unlocking ? 'Unlocking...' : `Unlock for ${ticketPrice} Stars`}
              </motion.button>
              <button
                onClick={() => {
                  setShowTicketPrompt(false)
                  onExit()
                }}
                className="w-full py-3 rounded-2xl bg-gray-100 text-gray-800 font-semibold"
              >
                Not now
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

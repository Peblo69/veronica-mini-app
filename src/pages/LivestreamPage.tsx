import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import AgoraRTC from 'agora-rtc-sdk-ng'
import type { IAgoraRTCClient, ICameraVideoTrack, IMicrophoneAudioTrack, IRemoteVideoTrack, IRemoteAudioTrack } from 'agora-rtc-sdk-ng'
import { ArrowLeft, Video, VideoOff, Mic, MicOff, Users, Gift, Send, X, Clock, Loader2, Image as ImageIcon, Shield, MonitorSmartphone, Pin, Trash2, Ban } from 'lucide-react'
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
import { useTranslation } from 'react-i18next'

interface LivestreamPageProps {
  user: User
  livestreamId?: string // If viewing
  isCreator?: boolean // If starting a stream
  onExit: () => void
}

export default function LivestreamPage({ user, livestreamId, isCreator, onExit }: LivestreamPageProps) {
  const { t } = useTranslation()
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
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string | null>(null)
  const [selectedVideoDevice, setSelectedVideoDevice] = useState<string | null>(null)
  const [pinMessageId, setPinMessageId] = useState<string | null>(null)
  const [permissionStatus, setPermissionStatus] = useState<'checking' | 'granted' | 'denied' | 'prompt'>('checking')

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
  const fetchAgoraToken = async (channel: string, uid: string, role: 'publisher' | 'subscriber' = 'publisher') => {
    const tokenUrl = import.meta.env.VITE_AGORA_TOKEN_URL
    if (!tokenUrl) {
      console.warn('[Agora] No token URL configured - connection may fail if tokens are required')
      return null
    }
    try {
      console.log('[Agora] Fetching token for channel:', channel, 'uid:', uid, 'role:', role)
      const res = await fetch(`${tokenUrl}?channel=${encodeURIComponent(channel)}&uid=${encodeURIComponent(uid)}&role=${role}`)
      if (!res.ok) {
        console.error('[Agora] Token fetch failed with status:', res.status)
        return null
      }
      const data = await res.json()
      console.log('[Agora] Token fetched successfully')
      return data.token || null
    } catch (err) {
      console.warn('[Agora] Token fetch failed:', err)
      return null
    }
  }

  // Initialize
  useEffect(() => {
    loadGifts()

    if (isCreator) {
      // For creators, request permissions immediately to show device options
      requestPermissionsAndLoadDevices()
      // Pre-fill defaults if already had a scheduled title
      initialSettingsRef.current = {
        title: streamTitle,
        description: streamDescription,
        entry_price: streamPrice,
        is_private: streamPrivate,
      }
      checkStreamingLimit()
    } else if (livestreamId) {
      // Viewers don't need camera/mic permissions
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

  // Check permission status using the Permission API (where available)
  const checkPermissionStatus = async () => {
    try {
      // Try the Permissions API first (Chrome/Edge)
      if (navigator.permissions && navigator.permissions.query) {
        const [cameraPermission, micPermission] = await Promise.all([
          navigator.permissions.query({ name: 'camera' as PermissionName }),
          navigator.permissions.query({ name: 'microphone' as PermissionName })
        ])

        if (cameraPermission.state === 'granted' && micPermission.state === 'granted') {
          return 'granted'
        } else if (cameraPermission.state === 'denied' || micPermission.state === 'denied') {
          return 'denied'
        }
        return 'prompt'
      }
      // Permissions API not available, we'll need to request to find out
      return 'prompt'
    } catch {
      return 'prompt'
    }
  }

  // Request permissions and load devices
  const requestPermissionsAndLoadDevices = async () => {
    setPermissionStatus('checking')

    try {
      // First check if we already have permission
      const status = await checkPermissionStatus()

      if (status === 'denied') {
        setPermissionStatus('denied')
        return false
      }

      if (status === 'prompt' || status === 'granted') {
        // Request permission by getting a stream, then immediately stop it
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        })
        // Stop the test stream - we just needed to trigger the permission prompt
        stream.getTracks().forEach(track => track.stop())
      }

      // Now load devices (they'll have proper labels now that permission is granted)
      const devices = await AgoraRTC.getDevices()
      const audios = devices.filter(d => d.kind === 'audioinput')
      const videos = devices.filter(d => d.kind === 'videoinput')
      setAudioDevices(audios)
      setVideoDevices(videos)
      if (audios.length && !selectedAudioDevice) setSelectedAudioDevice(audios[0].deviceId)
      if (videos.length && !selectedVideoDevice) setSelectedVideoDevice(videos[0].deviceId)

      setPermissionStatus('granted')
      return true
    } catch (err: any) {
      console.error('[Permissions] Request failed:', err)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setPermissionStatus('denied')
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        // No devices but permission was probably granted
        setPermissionStatus('granted')
      } else {
        setPermissionStatus('denied')
      }
      return false
    }
  }

  const handleIncomingMessage = (msg: LivestreamMessage) => {
    setMessages(prev => [...prev, msg])
    if (msg.message_type === 'gift' && msg.gift) {
      setGiftAnimation({
        name: msg.gift.name,
        sender: msg.user?.first_name || msg.user?.username || t('livestream.common.someone')
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
      setError(t('livestream.errors.limitReached'))
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
        setError(t('livestream.errors.ended'))
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

        setError(access.reason || t('livestream.errors.noAccess'))
        setLoading(false)
        return
      }

      hasLeftRef.current = false
      await enterLivestreamAsViewer(stream)
    } catch (err) {
      console.error('Init viewer error:', err)
      setError(t('livestream.errors.joinFailed'))
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

      // Use string UID consistently (token uses account mode)
      const agoraUid = String(user.telegram_id)
      const token = await fetchAgoraToken(channel, agoraUid, 'subscriber')
      await agoraClient.join(AGORA_APP_ID, channel, token, agoraUid)
      setClient(agoraClient)
    } catch (err) {
      console.error('Agora viewer init error:', err)
      setError(t('livestream.errors.connectFailed'))
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
      setError(t('livestream.errors.loadFailed'))
      setLoading(false)
    }
  }

  const startStream = async () => {
    if (!streamTitle.trim()) {
      alert(t('livestream.errors.titleRequired'))
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
          alert(t('livestream.errors.thumbnailUpload'))
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
        setError(t('livestream.errors.createFailed'))
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
      setError(t('livestream.errors.startFailed'))
      setLoading(false)
    }
  }

  const initAgoraBroadcaster = async (channel: string) => {
    try {
      // Check if Agora App ID is configured
      if (!AGORA_APP_ID) {
        console.error('Agora App ID not configured')
        setError('Livestream service not configured. Please contact support.')
        return
      }

      console.log('[Agora] Creating client for channel:', channel)
      const agoraClient = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' })
      agoraClient.setClientRole('host')

      // Get camera and microphone (selected devices if set)
      console.log('[Agora] Creating tracks with devices:', { audio: selectedAudioDevice, video: selectedVideoDevice })
      const micConstraints = selectedAudioDevice ? { microphoneId: selectedAudioDevice } : undefined
      const camConstraints = selectedVideoDevice ? { cameraId: selectedVideoDevice } : undefined

      let audioTrack, videoTrack
      try {
        [audioTrack, videoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks(micConstraints, camConstraints)
        console.log('[Agora] Tracks created successfully')
      } catch (trackErr: any) {
        console.error('[Agora] Track creation failed:', trackErr)
        if (trackErr.code === 'PERMISSION_DENIED' || trackErr.name === 'NotAllowedError') {
          setError('Camera/microphone permission was revoked. Please allow access and try again.')
        } else if (trackErr.code === 'DEVICE_NOT_FOUND' || trackErr.name === 'NotFoundError') {
          setError('Camera or microphone not found. Please check your device connections.')
        } else {
          setError(`Failed to access camera/microphone: ${trackErr.message || trackErr.code || 'Unknown error'}`)
        }
        return
      }

      setLocalAudioTrack(audioTrack)
      setLocalVideoTrack(videoTrack)

      // Play local video
      if (videoRef.current) {
        videoTrack.play(videoRef.current)
        console.log('[Agora] Local video playing')
      }

      // Join and publish
      // Use string UID consistently (token uses account mode)
      const agoraUid = String(user.telegram_id)
      console.log('[Agora] Joining channel with UID:', agoraUid)
      const token = await fetchAgoraToken(channel, agoraUid, 'publisher')

      try {
        await agoraClient.join(AGORA_APP_ID, channel, token, agoraUid)
        console.log('[Agora] Joined channel successfully')
      } catch (joinErr: any) {
        console.error('[Agora] Join failed:', joinErr)
        setError(`Failed to connect to stream server: ${joinErr.message || joinErr.code || 'Connection error'}`)
        audioTrack?.close()
        videoTrack?.close()
        return
      }

      try {
        await agoraClient.publish([audioTrack, videoTrack])
        console.log('[Agora] Published tracks successfully')
      } catch (pubErr: any) {
        console.error('[Agora] Publish failed:', pubErr)
        setError(`Failed to start broadcasting: ${pubErr.message || pubErr.code || 'Publish error'}`)
        audioTrack?.close()
        videoTrack?.close()
        await agoraClient.leave()
        return
      }

      setClient(agoraClient)
      console.log('[Agora] Broadcaster initialized successfully!')
    } catch (err: any) {
      console.error('Agora broadcaster init error:', err)
      setError(`Stream setup failed: ${err.message || 'Unknown error'}`)
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

  const handlePinMessage = (messageId: string) => {
    setPinMessageId(messageId)
  }

  const handleDeleteMessage = (messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId))
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
      setError(t('livestream.errors.noLongerAvailable'))
      setShowTicketPrompt(false)
      return
    }

    setUnlocking(true)
    const result = await purchaseLivestreamTicket(targetStream.id, user.telegram_id)
    setUnlocking(false)

    if (!result.success) {
      alert(result.error || t('livestream.errors.unlockFailed'))
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
            {t('livestream.actions.goBack')}
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
            <p className="text-xs text-white/60">{t('livestream.setup.subtitle')}</p>
            <h2 className="text-white text-xl font-bold">{t('livestream.setup.title')}</h2>
          </div>
          <div className="ml-auto text-sm text-white/70">{t('livestream.setup.minutesLeft', { count: remainingMinutes })}</div>
        </div>

        <div className="max-w-2xl mx-auto px-4 pb-10 space-y-4">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4">
            <div className="space-y-2">
              <label className="text-xs text-white/60">{t('livestream.setup.titleLabel')}</label>
              <input
                type="text"
                value={streamTitle}
                onChange={(e) => setStreamTitle(e.target.value)}
                placeholder={t('livestream.setup.titlePlaceholder')}
                className="w-full px-4 py-3 rounded-xl bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs text-white/60">{t('livestream.setup.descriptionLabel')}</label>
              <textarea
                value={streamDescription}
                onChange={(e) => setStreamDescription(e.target.value)}
                placeholder={t('livestream.setup.descriptionPlaceholder')}
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
                  <p className="text-white font-semibold text-sm">{t('livestream.setup.privateTitle')}</p>
                  <p className="text-xs text-white/60">{t('livestream.setup.privateSubtitle')}</p>
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
                <label className="text-xs text-white/60">{t('livestream.setup.ticketLabel')}</label>
                <input
                  type="number"
                  min={0}
                  value={streamPrice}
                  onChange={(e) => setStreamPrice(Number(e.target.value))}
                  className="w-full px-4 py-3 rounded-xl bg-gray-800 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs text-white/60">{t('livestream.setup.thumbnailLabel')}</label>
                <button
                  onClick={() => thumbnailInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-sm"
                  disabled={thumbnailUploading}
                >
                  <ImageIcon className="w-4 h-4" />
                  {thumbnailFile ? t('livestream.setup.thumbnailChange') : t('livestream.setup.thumbnailUpload')}
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
                {thumbnailUploading && <p className="text-[11px] text-yellow-400">{t('livestream.setup.thumbnailUploading')}</p>}
              </div>
            </div>

            {/* Permission status and device selection */}
            {permissionStatus === 'checking' && (
              <div className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                <p className="text-sm text-blue-300">{t('livestream.setup.checkingPermissions') || 'Checking camera & microphone permissions...'}</p>
              </div>
            )}

            {permissionStatus === 'denied' && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <VideoOff className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{t('livestream.setup.permissionDeniedTitle') || 'Camera & Microphone Access Denied'}</p>
                  </div>
                </div>

                {/* Platform-specific instructions */}
                <div className="bg-black/30 rounded-lg p-3 space-y-2 text-xs">
                  <p className="text-white font-medium">How to enable:</p>

                  <div className="text-gray-300 space-y-2">
                    <div>
                      <span className="text-blue-400 font-medium">iPhone/iPad:</span>
                      <p className="ml-2">Settings → Telegram → Camera & Microphone → Enable</p>
                    </div>

                    <div>
                      <span className="text-green-400 font-medium">Android:</span>
                      <p className="ml-2">Settings → Apps → Telegram → Permissions → Camera & Microphone → Allow</p>
                    </div>

                    <div>
                      <span className="text-purple-400 font-medium">Desktop:</span>
                      <p className="ml-2">Click the lock/camera icon in browser address bar → Allow camera & microphone</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={requestPermissionsAndLoadDevices}
                  className="w-full py-2.5 rounded-xl bg-red-500 text-white font-semibold text-sm"
                >
                  {t('livestream.setup.retryPermissions') || 'Retry Permission Request'}
                </button>
              </div>
            )}

            {permissionStatus === 'granted' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-white/60 flex items-center gap-1"><Mic className="w-4 h-4" /> {t('livestream.setup.micLabel')}</label>
                  <select
                    value={selectedAudioDevice || ''}
                    onChange={(e) => setSelectedAudioDevice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 text-white text-sm"
                  >
                    {audioDevices.length === 0 && (
                      <option value="">{t('livestream.setup.noMicFound') || 'No microphone found'}</option>
                    )}
                    {audioDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || t('livestream.setup.micFallback')}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-white/60 flex items-center gap-1"><MonitorSmartphone className="w-4 h-4" /> {t('livestream.setup.cameraLabel')}</label>
                  <select
                    value={selectedVideoDevice || ''}
                    onChange={(e) => setSelectedVideoDevice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 text-white text-sm"
                  >
                    {videoDevices.length === 0 && (
                      <option value="">{t('livestream.setup.noCameraFound') || 'No camera found'}</option>
                    )}
                    {videoDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || t('livestream.setup.cameraFallback')}</option>
                    ))}
                  </select>
                </div>
                {(audioDevices.length === 0 || videoDevices.length === 0) && (
                  <p className="col-span-full text-xs text-yellow-400">
                    {t('livestream.setup.devicesWarning') || 'Some devices not detected. Make sure your camera and microphone are connected.'}
                  </p>
                )}
              </div>
            )}

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={startStream}
              className="w-full py-3 bg-red-500 text-white rounded-xl font-semibold disabled:opacity-60"
              disabled={loading || thumbnailUploading || permissionStatus === 'denied' || permissionStatus === 'checking'}
            >
              {loading ? t('livestream.setup.starting') : permissionStatus === 'denied' ? (t('livestream.setup.permissionRequired') || 'Permission Required') : t('livestream.setup.start')}
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
          <h2 className="text-white text-2xl font-bold mb-2">{t('livestream.subscriptionOnly.title')}</h2>
          <p className="text-gray-300 text-sm">
            {t('livestream.subscriptionOnly.subtitle', { name: livestream?.creator?.first_name || livestream?.creator?.username || t('livestream.common.creatorFallback') })}
          </p>
        </div>
        <button
          onClick={onExit}
          className="px-6 py-3 rounded-full bg-white text-black font-semibold"
        >
          {t('livestream.actions.goBack')}
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
                <p className="text-gray-500">{t('livestream.status.waiting')}</p>
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
                  <span className="text-white text-sm font-medium">{t('livestream.status.live')}</span>
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
                  {t('livestream.chat.giftBanner', { sender: giftAnimation.sender, gift: giftAnimation.name })}
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
              <span className="text-white font-semibold">{t('livestream.actions.end')}</span>
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
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs">
                    {msg.user?.first_name || msg.user?.username}
                  </span>
                  {pinMessageId === msg.id && (
                    <span className="text-[10px] text-yellow-300 bg-yellow-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Pin className="w-3 h-3" /> {t('livestream.chat.pinned')}
                    </span>
                  )}
                </div>
                {msg.message_type === 'gift' ? (
                  <p className="text-yellow-400 text-sm">🎁 {msg.content}</p>
                ) : (
                  <p className="text-white text-sm">{msg.content}</p>
                )}
                {isCreator && (
                  <div className="flex items-center gap-2 text-[11px] text-white/60">
                    <button onClick={() => handlePinMessage(msg.id)} className="flex items-center gap-1 hover:text-yellow-300">
                      <Pin className="w-3 h-3" /> {t('livestream.chat.pin')}
                    </button>
                    <button onClick={() => handleDeleteMessage(msg.id)} className="flex items-center gap-1 hover:text-red-400">
                      <Trash2 className="w-3 h-3" /> {t('livestream.chat.delete')}
                    </button>
                    {/* Placeholder ban control */}
                    <button className="flex items-center gap-1 hover:text-red-400">
                      <Ban className="w-3 h-3" /> {t('livestream.chat.ban')}
                    </button>
                  </div>
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
              placeholder={t('livestream.chat.placeholder')}
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
              <h3 className="text-white font-bold">{t('livestream.chat.giftTitle')}</h3>
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
                <p className="text-xs font-semibold text-gray-500 mb-2">{t('livestream.unlock.exclusive')}</p>
                <h3 className="text-2xl font-bold text-gray-900 mb-1">{livestream?.title || t('livestream.unlock.title')}</h3>
                <p className="text-gray-600 text-sm">
                  {t('livestream.unlock.description', { price: ticketPrice })}
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleUnlockStream}
                disabled={unlocking}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-red-500 to-pink-500 text-white font-semibold disabled:opacity-60"
              >
                {unlocking ? t('livestream.unlock.unlocking') : t('livestream.unlock.cta', { price: ticketPrice })}
              </motion.button>
              <button
                onClick={() => {
                  setShowTicketPrompt(false)
                  onExit()
                }}
                className="w-full py-3 rounded-2xl bg-gray-100 text-gray-800 font-semibold"
              >
                {t('livestream.unlock.cancel')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

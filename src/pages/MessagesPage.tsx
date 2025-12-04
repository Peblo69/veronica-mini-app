import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import type { VideoHTMLAttributes } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Search, ArrowLeft, Send, Image, Gift, DollarSign, Lock, X, Loader2, Plus, Video, CheckCheck, AlertCircle, CornerUpLeft, Forward, Trash2, Mic, Volume2 } from 'lucide-react'
import { type User } from '../lib/api'
import {
  getConversations,
  getMessages,
  sendMessage,
  sendMediaMessage,
  sendGift,
  sendTip,
  unlockPPV,
  markMessagesRead,
  getGifts,
  subscribeToMessages,
  addReaction,
  deleteMessage,
  getMessageReactions,
  type Conversation,
  type Message,
  type Gift as GiftType,
  type MessageReaction
} from '../lib/chatApi'
import { uploadMessageMedia, uploadVoiceMessage, getMediaType } from '../lib/storage'
import VoiceRecorder from '../components/VoiceRecorder'
import { useInViewport } from '../hooks/useInViewport'

// Star Background Component
const StarsBackground = () => {
  // Use useMemo to prevent re-rendering stars on every state change
  const stars = useMemo(() => Array.from({ length: 70 }).map((_, i) => ({
    id: i,
    top: `${Math.random() * 100}%`,
    left: `${Math.random() * 100}%`,
    size: `${Math.random() * 2 + 1}px`,
    duration: `${Math.random() * 3 + 2}s`,
    opacity: Math.random() * 0.7 + 0.3,
    delay: `${Math.random() * 5}s`
  })), [])

  return (
    <div className="stars-container fixed inset-0 z-0 pointer-events-none">
      {stars.map(star => (
        <div
          key={star.id}
          className="star"
          style={{
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            animationDelay: star.delay,
            '--duration': star.duration,
            '--opacity': star.opacity
          } as any}
        />
      ))}
    </div>
  )
}

type ChatMessage = Message & {
  _localId?: string
  _status?: 'sending' | 'uploading' | 'failed'
  preview_url?: string
  error?: string
  reactions?: { emoji: string; user_id: number }[]
  reply_to?: ChatMessage | null
}

type PendingMedia = {
  file: File | Blob
  mediaType: 'image' | 'video' | 'voice'
  duration?: number
}

type MessageVideoProps = VideoHTMLAttributes<HTMLVideoElement> & {
  containerClassName?: string
}

function MessageVideo({ containerClassName, ...videoProps }: MessageVideoProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const isVisible = useInViewport(containerRef, { minimumRatio: 0.35 })

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (!isVisible && !video.paused) {
      video.pause()
    }
  }, [isVisible])

  const attrs: VideoHTMLAttributes<HTMLVideoElement> = {
  ...videoProps,
  preload: videoProps.preload ?? 'metadata'
  }

  return (
    <div ref={containerRef} className={containerClassName}>
      <video ref={videoRef} {...attrs} />
    </div>
  )
}

type MessageCategory = 'primary' | 'general' | 'requests'

interface MessagesPageProps {
  user: User
  selectedConversationId?: string | null
  onConversationOpened?: () => void
  onChatStateChange?: (isOpen: boolean) => void
  onProfileClick?: (user: User) => void
  scrollElement?: HTMLElement | null
}

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍']

export default function MessagesPage({ user, selectedConversationId, onConversationOpened, onChatStateChange, onProfileClick, scrollElement: _scrollElement }: MessagesPageProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [showGifts, setShowGifts] = useState(false)
  const [showTip, setShowTip] = useState(false)
  const [tipAmount, setTipAmount] = useState('')
  const [gifts, setGifts] = useState<GiftType[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [uploadingCount, setUploadingCount] = useState(0)
  const [activeCategory, setActiveCategory] = useState<MessageCategory>('primary')
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null)
  const [showMessageMenu, setShowMessageMenu] = useState(false)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [messageReactions, setMessageReactions] = useState<Map<string, MessageReaction[]>>(new Map())

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlsRef = useRef<Set<string>>(new Set())
  const pendingMediaRef = useRef<Map<string, PendingMedia>>(new Map())
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const initialScrollDoneRef = useRef(false)
  const isSendingRef = useRef(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTapRef = useRef<{ time: number; messageId: string } | null>(null)
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const pendingReactionsRef = useRef<Set<string>>(new Set()) // Track pending reaction calls

  const messageListVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => messagesContainerRef.current,
    estimateSize: () => 220,
    overscan: 12,
    getItemKey: (index) => messages[index]?.id ?? index,
    measureElement: (el) => el.getBoundingClientRect().height || 0,
  })

  const trackPreviewUrl = (url: string) => {
    previewUrlsRef.current.add(url)
  }

  const releasePreviewUrl = (url?: string) => {
    if (!url) return
    if (previewUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url)
      previewUrlsRef.current.delete(url)
    }
  }

  const resolveTempMessage = (tempId: string, finalMessage?: Message, errorMessage?: string) => {
    let previewToRelease: string | undefined
    setMessages(prev =>
      prev.map(msg => {
        if (msg._localId === tempId) {
          if (finalMessage) {
            previewToRelease = msg.preview_url
            return finalMessage
          }
          return {
            ...msg,
            _status: 'failed',
            error: errorMessage || msg.error || 'Failed to send',
          }
        }
        return msg
      })
    )

    if (finalMessage && previewToRelease) {
      releasePreviewUrl(previewToRelease)
      pendingMediaRef.current.delete(tempId)
    }
  }

  // Keyboard handling - position input above keyboard
  useEffect(() => {
    if (!activeConversation) return
    // We now rely on interactive-widget=resizes-content in index.html for basic resizing.
    // However, we still listen to visualViewport to ensure we scroll to bottom.
    
    const handleResize = () => {
      if (messagesEndRef.current) {
        // Use a small timeout to let layout settle
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ block: 'end' })
        }, 100)
      }
    }

    window.visualViewport?.addEventListener('resize', handleResize)
    return () => window.visualViewport?.removeEventListener('resize', handleResize)
  }, [activeConversation])

  // Load conversations
  useEffect(() => {
    loadConversations()
    loadGifts()
  }, [])

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
      previewUrlsRef.current.clear()
    }
  }, [])

  // Handle selected conversation from external navigation
  useEffect(() => {
    if (selectedConversationId && conversations.length > 0) {
      const conv = conversations.find(c => c.id === selectedConversationId)
      if (conv) {
        setActiveConversation(conv)
        onConversationOpened?.()
      }
    }
  }, [selectedConversationId, conversations])

  // Load messages when conversation changes
  useEffect(() => {
    onChatStateChange?.(!!activeConversation)

    if (activeConversation) {
      loadMessages(activeConversation.id)
      markMessagesRead(activeConversation.id, user.telegram_id)

      // Subscribe to new messages
      const unsubscribe = subscribeToMessages(activeConversation.id, (newMsg) => {
        setMessages(prev => {
          const clientId = newMsg.client_message_id
          if (clientId) {
            const pendingIndex = prev.findIndex(m => m._localId && m._localId === clientId)
            if (pendingIndex >= 0) {
              const updated = [...prev]
              updated[pendingIndex] = newMsg
              return updated
            }
          }

          if (prev.some(m => m.id === newMsg.id)) return prev
          return [...prev, newMsg]
        })
        // Mark as read if not from us
        if (newMsg.sender_id !== user.telegram_id) {
          markMessagesRead(activeConversation.id, user.telegram_id)
        }
      })

      return () => unsubscribe()
    }

    return () => {
      onChatStateChange?.(false)
    }
  }, [activeConversation])

  // Scroll to bottom on new messages (only after initial load is done)
  useEffect(() => {
    if (messages.length > 0 && initialScrollDoneRef.current) {
      // Only smooth scroll for new messages after initial load
      requestAnimationFrame(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTo({
            top: messagesContainerRef.current.scrollHeight,
            behavior: 'smooth'
          })
        }
      })
    }
  }, [messages.length])

  const loadConversations = async () => {
    setLoading(true)
    const data = await getConversations(user.telegram_id)
    setConversations(data)
    setLoading(false)
  }

  const loadMessages = async (conversationId: string) => {
    // Reset scroll flag when loading new conversation
    initialScrollDoneRef.current = false

    const data = await getMessages(conversationId)
    setMessages(data)

    // Load reactions for all messages
    if (data.length > 0) {
      const messageIds = data.map(m => m.id)
      const reactions = await getMessageReactions(messageIds)
      setMessageReactions(reactions)
    }

    // Scroll to bottom after messages load
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
        }
        initialScrollDoneRef.current = true
      }, 100)
    })
  }

  const loadGifts = async () => {
    const data = await getGifts()
    setGifts(data)
  }

  const runMediaUpload = async (tempId: string, payload: PendingMedia, conversationId: string) => {
    setUploadingCount(prev => prev + 1)
    try {
      if (payload.mediaType === 'voice') {
        const voiceResult = await uploadVoiceMessage(payload.file as Blob, user.telegram_id, payload.duration || 0)
        if (voiceResult.error || !voiceResult.url) {
          throw new Error(voiceResult.error || 'Voice upload failed')
        }
        const msg = await sendMediaMessage(conversationId, user.telegram_id, voiceResult.url, 'voice', undefined, tempId)
        if (msg) {
          resolveTempMessage(tempId, msg)
        } else {
          throw new Error('Failed to send voice message')
        }
      } else {
        const mediaResult = await uploadMessageMedia(payload.file as File, user.telegram_id)
        if (mediaResult.error || !mediaResult.url) {
          throw new Error(mediaResult.error || 'Upload failed')
        }
        const msg = await sendMediaMessage(conversationId, user.telegram_id, mediaResult.url, payload.mediaType, undefined, tempId)
        if (msg) {
          resolveTempMessage(tempId, msg)
        } else {
          throw new Error('Failed to send media message')
        }
      }
      pendingMediaRef.current.delete(tempId)
    } catch (err) {
      console.error('[Chat] Media upload error:', err)
      const message = err instanceof Error ? err.message : 'Failed to send media'
      resolveTempMessage(tempId, undefined, message)
      alert(message)
    } finally {
      setUploadingCount(prev => Math.max(0, prev - 1))
    }
  }

  const handleSendMessage = async () => {
    // Use ref to prevent double-sends on iOS
    if (isSendingRef.current) return
    if (!newMessage.trim() || !activeConversation || sending) return

    isSendingRef.current = true

    const text = newMessage.trim()
    const tempId = `temp-text-${Date.now()}`
    const replyToId = replyTo?.id?.startsWith('temp-') ? undefined : replyTo?.id
    const savedReplyTo = replyTo // Save before clearing

    const optimisticMessage: ChatMessage = {
      id: tempId,
      _localId: tempId,
      _status: 'sending',
      conversation_id: activeConversation.id,
      sender_id: user.telegram_id,
      content: text,
      message_type: 'text',
      media_url: null,
      media_thumbnail: null,
      is_ppv: false,
      ppv_price: 0,
      ppv_unlocked_by: [],
      gift_id: null,
      tip_amount: null,
      is_read: false,
      is_deleted: false,
      created_at: new Date().toISOString(),
      client_message_id: tempId,
      reply_to_id: replyToId,
      reply_to: savedReplyTo,
    }

    // Clear input FIRST before any async work
    setNewMessage('')
    setReplyTo(null)
    setSending(true)

    // Add optimistic message
    setMessages(prev => [...prev, optimisticMessage])

    try {
      // Pass reply_to_id if replying to a message
      const msg = await sendMessage(activeConversation.id, user.telegram_id, text, tempId, replyToId)
      if (msg) {
        // Add the reply_to data to the returned message
        if (savedReplyTo && !savedReplyTo.id.startsWith('temp-')) {
          msg.reply_to = savedReplyTo
        }
        resolveTempMessage(tempId, msg)
      } else {
        resolveTempMessage(tempId, undefined, 'Failed to send message')
      }
    } catch (err) {
      console.error('[Chat] Send message error:', err)
      const message = err instanceof Error ? err.message : 'Failed to send message'
      resolveTempMessage(tempId, undefined, message)
      alert(message)
    }

    setSending(false)
    isSendingRef.current = false
  }

  const handleSendGift = async (gift: GiftType) => {
    if (!activeConversation || sending) return

    setSending(true)
    const { message, error } = await sendGift(
      activeConversation.id,
      user.telegram_id,
      gift.id,
      gift.price
    )

    if (error) {
      alert(error)
    } else if (message) {
      setMessages(prev => [...prev, message])
    }

    setShowGifts(false)
    setSending(false)
  }

  const handleSendTip = async () => {
    const amount = parseFloat(tipAmount)
    if (!amount || !activeConversation || sending) return

    setSending(true)
    const { message, error } = await sendTip(activeConversation.id, user.telegram_id, amount)

    if (error) {
      alert(error)
    } else if (message) {
      setMessages(prev => [...prev, message])
    }

    setShowTip(false)
    setTipAmount('')
    setSending(false)
  }

  const handleUnlockPPV = async (messageId: string) => {
    const { success, error } = await unlockPPV(messageId, user.telegram_id)
    if (error) {
      alert(error)
    } else if (success) {
      loadMessages(activeConversation!.id)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    setShowActions(false)

    if (!files?.length || !activeConversation) {
      e.target.value = ''
      return
    }

    for (const [index, file] of Array.from(files).entries()) {
      const mediaType = getMediaType(file)

      if (mediaType === 'unknown' || mediaType === 'audio') {
        alert('Please select an image or video file')
        continue
      }

      const tempId = `temp-media-${Date.now()}-${index}`
      const previewUrl = URL.createObjectURL(file)
      trackPreviewUrl(previewUrl)

      const optimisticMessage: ChatMessage = {
        id: tempId,
        _localId: tempId,
        _status: 'uploading',
        preview_url: previewUrl,
        conversation_id: activeConversation.id,
        sender_id: user.telegram_id,
        content: null,
        message_type: mediaType,
        media_url: previewUrl,
        media_thumbnail: null,
        is_ppv: false,
        ppv_price: 0,
        ppv_unlocked_by: [],
        gift_id: null,
        tip_amount: null,
        is_read: false,
        is_deleted: false,
        created_at: new Date().toISOString(),
        client_message_id: tempId,
      }

      setMessages(prev => [...prev, optimisticMessage])
      pendingMediaRef.current.set(tempId, { file, mediaType })
      void runMediaUpload(tempId, pendingMediaRef.current.get(tempId)!, activeConversation.id)
    }

    e.target.value = ''
  }

  const handleSendVoice = async (blob: Blob, duration: number) => {
    if (!activeConversation) return

    const tempId = `temp-voice-${Date.now()}`
    const previewUrl = URL.createObjectURL(blob)
    trackPreviewUrl(previewUrl)

    const optimisticMessage: ChatMessage = {
      id: tempId,
      _localId: tempId,
      _status: 'uploading',
      preview_url: previewUrl,
      conversation_id: activeConversation.id,
      sender_id: user.telegram_id,
      content: null,
      message_type: 'voice',
      media_url: previewUrl,
      media_thumbnail: null,
      is_ppv: false,
      ppv_price: 0,
      ppv_unlocked_by: [],
      gift_id: null,
      tip_amount: null,
      is_read: false,
      is_deleted: false,
      created_at: new Date().toISOString(),
      client_message_id: tempId,
    }

    setMessages(prev => [...prev, optimisticMessage])
    pendingMediaRef.current.set(tempId, { file: blob, mediaType: 'voice', duration })
    void runMediaUpload(tempId, pendingMediaRef.current.get(tempId)!, activeConversation.id)
  }

  const retryFailedMessage = async (msg: ChatMessage) => {
    if (!activeConversation || msg._status !== 'failed') return
    const tempId = msg._localId || msg.id

    if (msg.message_type === 'text' && msg.content) {
      setMessages(prev =>
        prev.map(m => (m._localId === tempId ? { ...m, _status: 'sending', error: undefined, created_at: new Date().toISOString() } : m))
      )
      setSending(true)
      try {
        const result = await sendMessage(activeConversation.id, user.telegram_id, msg.content, tempId)
        if (result) {
          resolveTempMessage(tempId, result)
        } else {
          resolveTempMessage(tempId, undefined, 'Failed to send message')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to send message'
        resolveTempMessage(tempId, undefined, message)
        alert(message)
      }
      setSending(false)
      return
    }

    const pending = pendingMediaRef.current.get(tempId)
    if (!pending) {
      alert('Original media is no longer available. Please resend the file.')
      return
    }

    setMessages(prev =>
      prev.map(m => (m._localId === tempId ? { ...m, _status: 'uploading', error: undefined } : m))
    )
    void runMediaUpload(tempId, pending, activeConversation.id)
  }

  // Long press handler
  const handleTouchStart = useCallback((msg: ChatMessage) => {
    longPressTimer.current = setTimeout(() => {
      setSelectedMessage(msg)
      setShowMessageMenu(true)
    }, 500)
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  // Double tap handler for quick like
  const handleMessageTap = useCallback((msg: ChatMessage) => {
    const now = Date.now()
    if (lastTapRef.current && lastTapRef.current.messageId === msg.id && now - lastTapRef.current.time < 300) {
      // Double tap - add heart reaction
      handleAddReaction(msg.id, '❤️')
      lastTapRef.current = null
    } else {
      lastTapRef.current = { time: now, messageId: msg.id }
    }
  }, [])

  // Add reaction to message - with proper locking to prevent duplicates
  const handleAddReaction = async (messageId: string, emoji: string) => {
    const reactionKey = `${messageId}:${emoji}`

    // Prevent duplicate calls - if this exact reaction is already pending, ignore
    if (pendingReactionsRef.current.has(reactionKey)) {
      console.log('[Reaction] Already pending, ignoring:', reactionKey)
      setShowMessageMenu(false)
      setSelectedMessage(null)
      return
    }

    // Don't allow reactions on temp/pending messages
    if (messageId.startsWith('temp-')) {
      console.log('[Reaction] Skipping - temp message')
      setShowMessageMenu(false)
      setSelectedMessage(null)
      return
    }

    // Mark as pending
    pendingReactionsRef.current.add(reactionKey)
    console.log('[Reaction] Starting:', { messageId, emoji, userId: user.telegram_id })

    // Close menu immediately
    setShowMessageMenu(false)
    setSelectedMessage(null)

    try {
      // Call backend FIRST - let server be source of truth
      const result = await addReaction(messageId, user.telegram_id, emoji)
      console.log('[Reaction] Backend result:', result)

      // Always refresh from server after operation
      const updatedReactions = await getMessageReactions([messageId])
      console.log('[Reaction] Server reactions:', updatedReactions.get(messageId))

      setMessageReactions(prev => {
        const newMap = new Map(prev)
        newMap.set(messageId, updatedReactions.get(messageId) || [])
        return newMap
      })
    } catch (err) {
      console.error('[Reaction] Error:', err)
      // On error, still refresh to get correct state
      try {
        const updatedReactions = await getMessageReactions([messageId])
        setMessageReactions(prev => {
          const newMap = new Map(prev)
          newMap.set(messageId, updatedReactions.get(messageId) || [])
          return newMap
        })
      } catch (e) {
        console.error('[Reaction] Failed to refresh:', e)
      }
    } finally {
      // Release lock
      pendingReactionsRef.current.delete(reactionKey)
    }
  }

  // Reply to message
  const handleReply = () => {
    console.log('[Reply] Replying to:', selectedMessage)
    if (selectedMessage) {
      setReplyTo(selectedMessage)
      setShowMessageMenu(false)
      setSelectedMessage(null)
      console.log('[Reply] replyTo set, menu closed')
    }
  }

  // Delete message
  const handleDeleteMessage = async () => {
    console.log('[Delete] Deleting message:', selectedMessage)
    if (!selectedMessage) return

    const messageId = selectedMessage.id
    const senderId = selectedMessage.sender_id
    console.log('[Delete] messageId:', messageId, 'senderId:', senderId, 'userId:', user.telegram_id)

    setShowMessageMenu(false)
    setSelectedMessage(null)

    // For temp messages, just remove from UI
    if (messageId.startsWith('temp-')) {
      console.log('[Delete] Removing temp message from UI')
      setMessages(prev => prev.filter(m => m.id !== messageId))
      return
    }

    // Optimistic remove from UI - keep it removed even on error
    console.log('[Delete] Removing message from UI')
    setMessages(prev => prev.filter(m => m.id !== messageId))

    // Call backend (fire and forget)
    try {
      const result = await deleteMessage(messageId, user.telegram_id)
      console.log('[Delete] Backend result:', result)
    } catch (err) {
      console.error('[Delete] Backend error:', err)
    }
  }

  // Scroll to replied message with highlight animation
  const scrollToMessage = useCallback((messageId: string) => {
    const targetIndex = messages.findIndex(m => m.id === messageId)
    if (targetIndex === -1) return

    messageListVirtualizer.scrollToIndex(targetIndex, { align: 'center' })

    setTimeout(() => {
      const element = messageRefs.current.get(messageId)
      if (!element) return

      element.classList.add('animate-pulse')
      element.style.backgroundColor = 'rgba(59, 130, 246, 0.25)'
      element.style.borderRadius = '16px'
      element.style.transition = 'background-color 0.3s ease-out'

      setTimeout(() => {
        element.style.backgroundColor = 'rgba(59, 130, 246, 0.15)'
      }, 200)
      setTimeout(() => {
        element.style.backgroundColor = 'rgba(59, 130, 246, 0.25)'
      }, 400)
      setTimeout(() => {
        element.style.backgroundColor = 'rgba(59, 130, 246, 0.1)'
      }, 600)

      setTimeout(() => {
        element.classList.remove('animate-pulse')
        element.style.backgroundColor = ''
        element.style.borderRadius = ''
      }, 1500)
    }, 120)
  }, [messageListVirtualizer, messages])

  const formatTime = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()

    if (diff < 60000) return 'now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  // Filter conversations by category
  const getFilteredConversations = () => {
    let filtered = conversations.filter(c =>
      c.other_user?.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.other_user?.first_name?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // For now, simulate categories (in real app, this would come from backend)
    switch (activeCategory) {
      case 'primary':
        return filtered
      case 'general':
        return filtered.filter((_, i) => i % 3 === 0) // Simulated
      case 'requests':
        return filtered.filter((_, i) => i % 5 === 0) // Simulated
      default:
        return filtered
    }
  }

  const filteredConversations = getFilteredConversations()

  const categories: { id: MessageCategory; label: string }[] = [
    { id: 'primary', label: 'Primary' },
    { id: 'general', label: 'General' },
    { id: 'requests', label: 'Requests' },
  ]

  const renderConversationCard = (conv: Conversation) => (
    <motion.button
      key={conv.id}
      className="group w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-white/5 transition-all duration-300 border border-transparent hover:border-white/5 relative overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={() => setActiveConversation(conv)}
    >
      {/* Hover Glow Effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/0 to-blue-500/0 group-hover:from-blue-500/5 group-hover:via-purple-500/5 group-hover:to-pink-500/5 transition-all duration-500" />
      
      <div className="relative shrink-0">
        <div className="w-12 h-12 rounded-full p-[2px] bg-gradient-to-br from-white/10 to-white/5 group-hover:from-blue-500 group-hover:to-purple-500 transition-all duration-500">
          <img
            src={conv.other_user?.avatar_url || `https://i.pravatar.cc/150?u=${conv.other_user?.telegram_id}`}
            alt=""
            loading="lazy"
            className="w-full h-full rounded-full object-cover bg-black"
          />
        </div>
        {(conv.unread_count || 0) > 0 && (
          <div className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gradient-to-r from-red-500 to-rose-600 border-2 border-black flex items-center justify-center shadow-[0_0_10px_rgba(244,63,94,0.5)]">
            <span className="text-[10px] font-bold text-white leading-none">{conv.unread_count}</span>
          </div>
        )}
        {/* Online Indicator (Simulated) */}
        <div className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-black" />
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-0.5 text-left relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-[15px] text-white/90 group-hover:text-white transition-colors truncate">
              {conv.other_user?.first_name || conv.other_user?.username || 'User'}
            </span>
            {conv.other_user?.is_verified && (
              <CheckCircle className="w-3.5 h-3.5 text-blue-400 fill-blue-400/20" />
            )}
          </div>
          <span className="text-[11px] text-white/30 font-medium whitespace-nowrap">
            {formatTime(conv.last_message_at)}
          </span>
        </div>
        
        <div className="flex items-center justify-between gap-2">
          <p className={`text-[13px] truncate leading-snug ${
            (conv.unread_count || 0) > 0 ? 'text-white/90 font-medium' : 'text-white/40 group-hover:text-white/60'
          }`}>
            {conv.last_message_preview || 'Start a conversation'}
          </p>
          {(conv.unread_count || 0) > 0 && (
             <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
          )}
        </div>
      </div>
    </motion.button>
  )

  // Chat view - Full screen overlay
  if (activeConversation) {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col bg-[#050505]"
        style={{ height: 'var(--app-height)', position: 'absolute', inset: 0, width: '100%' }}
      >
        {/* Star Background for Chat */}
        <StarsBackground />

        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Header - Sticky at top with Glassmorphism */}
        <div className="shrink-0 bg-black/40 border-b border-white/5 shadow-sm safe-area-top relative z-50 backdrop-blur-xl">
          <div className="flex items-center gap-3 px-3 py-2 h-14">
            <button
              onClick={() => {
                setActiveConversation(null)
                onChatStateChange?.(false)
              }}
              className="p-1.5 hover:bg-white/10 rounded-full transition-colors -ml-1"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={() => {
                if (activeConversation.other_user) {
                  onProfileClick?.(activeConversation.other_user)
                }
              }}
              className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity text-left cursor-pointer"
            >
              <div className="relative shrink-0">
                <img
                  src={activeConversation.other_user?.avatar_url || `https://i.pravatar.cc/150?u=${activeConversation.other_user?.telegram_id}`}
                  alt=""
                  loading="lazy"
                  className="w-10 h-10 rounded-full object-cover border border-white/10"
                />
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0c0c0c]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-[15px] text-white truncate">{activeConversation.other_user?.first_name || activeConversation.other_user?.username}</span>
                  {activeConversation.other_user?.is_verified && (
                    <CheckCircle className="w-3.5 h-3.5 text-of-blue fill-of-blue" />
                  )}
                </div>
                <p className="text-[11px] text-green-400 font-medium">Online</p>
              </div>
            </button>
          </div>
        </div>


        {/* Messages - Virtualized scrollable area */}
        <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-3 py-3 overscroll-none relative z-10">
          <div
            style={{
              height: messageListVirtualizer.getTotalSize(),
              width: '100%',
              position: 'relative'
            }}
          >
            {messageListVirtualizer.getVirtualItems().map((virtualRow) => {
              const msg = messages[virtualRow.index]
              if (!msg) return null

              const index = virtualRow.index
              const isOwn = msg.sender_id === user.telegram_id
              const isPPVLocked = msg.is_ppv && !msg.ppv_unlocked_by?.includes(user.telegram_id) && !isOwn
              const showAvatar = !isOwn && (index === messages.length - 1 || messages[index + 1]?.sender_id !== msg.sender_id)
              const isPending = msg._status === 'sending' || msg._status === 'uploading'
              const isFailed = msg._status === 'failed'
              const resolvedMediaUrl = msg.media_url || msg.preview_url || undefined
              const timeLabel = formatTime(msg.created_at)
              const reactions = messageReactions.get(msg.id) || []

              const renderTicks = () => {
                if (!isOwn) return null
                if (isPending) {
                  return <Loader2 className="w-3 h-3 text-white/70 animate-spin" />
                }
                return msg.is_read ? (
                  <CheckCheck className="w-3.5 h-3.5 text-blue-200" />
                ) : (
                  <CheckCheck className="w-3.5 h-3.5 text-white/50" />
                )
              }

              const isSpecialType = msg.message_type === 'gift' || !!msg.tip_amount

              return (
                <motion.div
                  key={virtualRow.key}
                  initial={isSpecialType ? { scale: 0.8, opacity: 0, y: 20 } : undefined}
                  animate={isSpecialType ? { scale: 1, opacity: 1, y: 0 } : undefined}
                  transition={isSpecialType ? { type: 'spring', damping: 12, stiffness: 100 } : undefined}
                  ref={el => {
                    if (el) {
                      messageListVirtualizer.measureElement(el)
                      messageRefs.current.set(msg.id, el)
                    } else {
                      messageRefs.current.delete(msg.id)
                    }
                  }}
                  data-index={virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: reactions.length > 0 ? '20px' : '8px'
                  }}
                  className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} transition-colors duration-500 rounded-2xl`}
                >
                  {/* Reply preview - shows what message this is replying to */}
                  {msg.reply_to && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        scrollToMessage(msg.reply_to!.id)
                      }}
                      className={`flex items-start gap-2 text-xs px-3 py-2 rounded-xl mb-1.5 max-w-[85%] backdrop-blur-md ${
                        isOwn
                          ? 'bg-blue-500/30 text-white ml-auto border-l-2 border-white/50'
                          : 'bg-white/10 text-white border-l-2 border-slate-400'
                      }`}
                    >
                      <div className="flex flex-col items-start min-w-0 flex-1">
                        <span className={`text-[11px] font-semibold mb-0.5 ${isOwn ? 'text-white/90' : 'text-slate-300'}`}>
                          {msg.reply_to.sender_id === user.telegram_id ? 'You' : activeConversation.other_user?.first_name || 'User'}
                        </span>
                        <span className={`truncate w-full text-[13px] ${isOwn ? 'text-white/80' : 'text-gray-300'}`}>
                          {msg.reply_to.content
                            ? msg.reply_to.content.slice(0, 50) + (msg.reply_to.content.length > 50 ? '...' : '')
                            : msg.reply_to.message_type === 'image' ? 'Photo'
                            : msg.reply_to.message_type === 'video' ? 'Video'
                            : msg.reply_to.message_type === 'voice' ? 'Voice message'
                            : msg.reply_to.message_type === 'gift' ? 'Gift'
                            : 'Media'
                          }
                        </span>
                      </div>
                    </button>
                  )}

                  <div className={`flex items-end gap-2 w-full ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    {!isOwn && (
                      <div className="w-7 shrink-0 pb-0.5">
                        {showAvatar && (
                          <img
                            src={activeConversation.other_user?.avatar_url || `https://i.pravatar.cc/150?u=${activeConversation.other_user?.telegram_id}`}
                            alt=""
                            loading="lazy"
                            className="w-7 h-7 rounded-full object-cover"
                          />
                        )}
                      </div>
                    )}

                    <div
                      className={`relative max-w-[75%] ${
                        // Styling logic based on message type and ownership
                        isSpecialType ? 'p-0 !bg-transparent !shadow-none !border-none' :
                        msg.message_type === 'image' || msg.message_type === 'video' ? 'p-0 !bg-transparent !shadow-none !border-none' :
                        isOwn
                          ? 'px-3 py-1.5 bg-gradient-to-br from-[#007AFF] to-[#0055FF] text-white rounded-[18px] rounded-br-sm'
                          : 'px-3 py-1.5 bg-[#262626] text-white rounded-[18px] rounded-bl-sm'
                      } ${isFailed ? 'ring-2 ring-red-400' : ''}`}
                      style={{ userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
                      onTouchStart={() => handleTouchStart(msg)}
                      onTouchEnd={handleTouchEnd}
                      onTouchCancel={handleTouchEnd}
                      onContextMenu={e => e.preventDefault()}
                      onClick={() => handleMessageTap(msg)}
                    >
                      {isPending && msg.message_type !== 'text' && (
                        <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center z-10">
                          <Loader2 className="w-8 h-8 text-white animate-spin" />
                        </div>
                      )}

                      {/* Gift message - Premium No Bubble */}
                      {msg.message_type === 'gift' && msg.gift && (
                        <div className="text-center relative">
                          <div className="absolute inset-0 bg-gradient-to-tr from-pink-500/30 to-purple-500/30 blur-xl rounded-full" />
                          <div className="relative z-10 flex flex-col items-center">
                             <motion.div 
                               animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] }}
                               transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                               className="w-20 h-20 mb-2 drop-shadow-2xl"
                             >
                               <img src="/gift-box-3d.png" onError={(e) => e.currentTarget.src = 'https://cdn-icons-png.flaticon.com/512/4213/4213958.png'} className="w-full h-full object-contain" alt="gift" />
                             </motion.div>
                            <p className="font-bold text-white text-lg drop-shadow-md">{msg.gift.name}</p>
                            <p className="text-sm text-pink-300 font-medium drop-shadow-md">{msg.gift.price} tokens</p>
                          </div>
                        </div>
                      )}

                      {/* Tip message - Premium No Bubble */}
                      {msg.tip_amount && (
                        <div className="text-center relative">
                           <div className="absolute inset-0 bg-gradient-to-tr from-green-500/30 to-emerald-500/30 blur-xl rounded-full" />
                           <div className="relative z-10 flex flex-col items-center">
                             <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-green-600 rounded-full flex items-center justify-center shadow-lg mb-2 border-2 border-white/20">
                               <DollarSign className="w-8 h-8 text-white" strokeWidth={3} />
                             </div>
                             <p className="font-bold text-white text-lg drop-shadow-md">${msg.tip_amount.toFixed(2)}</p>
                             <p className="text-sm text-emerald-300 font-medium drop-shadow-md">Tip sent</p>
                           </div>
                        </div>
                      )}

                      {/* Voice message */}
                      {msg.message_type === 'voice' && (
                        <div className="flex items-center gap-3 text-white">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isOwn ? 'bg-white/20' : 'bg-white/10'}`}>
                            <Mic className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1">
                            <div className={`h-2 rounded-full overflow-hidden relative ${isOwn ? 'bg-white/30' : 'bg-white/20'}`}>
                              <div className={`absolute inset-y-0 left-0 w-1/2 animate-pulse ${isOwn ? 'bg-white' : 'bg-white/60'}`} />
                            </div>
                            <p className="text-xs mt-1 text-white/70">
                              Voice message
                            </p>
                          </div>
                          {isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin text-white/70" />
                          ) : (
                            <button
                              className={`w-8 h-8 rounded-full flex items-center justify-center active:scale-95 transition-transform ${isOwn ? 'bg-white/20' : 'bg-white/10'} text-white`}
                              onClick={(e) => {
                                e.stopPropagation()
                                const audio = new Audio(resolvedMediaUrl!)
                                audio.play().catch(err => console.error('Failed to play voice', err))
                              }}
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Image / Video - No Border */}
                      {(msg.message_type === 'image' || msg.message_type === 'video') && resolvedMediaUrl && (
                        <div className="relative overflow-hidden rounded-3xl max-w-[75vw] max-h-[70vh] shadow-2xl">
                          {msg.message_type === 'image' ? (
                            <img
                              src={resolvedMediaUrl}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <MessageVideo
                              src={resolvedMediaUrl}
                              controls
                              playsInline
                              loop
                              muted={!isOwn}
                              className="max-h-[70vh] max-w-[75vw] object-contain bg-black"
                              containerClassName="max-h-[70vh] max-w-[75vw]"
                            />
                          )}

                          {isPending && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <Loader2 className="w-10 h-10 text-white animate-spin" />
                            </div>
                          )}
                        </div>
                      )}

                      {/* PPV locked overlay */}
                      {isPPVLocked && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center text-white text-center p-4">
                          <Lock className="w-8 h-8 mb-3 text-white/80" />
                          <p className="font-bold mb-1 text-lg">Locked Content</p>
                          <p className="text-sm text-white/70 mb-4">{msg.ppv_price} tokens</p>
                          <button
                            onClick={() => handleUnlockPPV(msg.id)}
                            className="px-6 py-2.5 bg-white text-black rounded-full font-bold text-sm active:scale-95 transition-transform"
                          >
                            Unlock Post
                          </button>
                        </div>
                      )}

                      {/* Text message */}
                      {msg.message_type === 'text' && msg.content && (
                        <p className="text-[15px] leading-snug whitespace-pre-wrap break-words">
                          {msg.content}
                        </p>
                      )}

                      {/* Failed status message */}
                      {isFailed && (
                        <div className="mt-1 text-xs text-red-200 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>Failed to send</span>
                        </div>
                      )}


                      {/* Reactions */}
                      {reactions.length > 0 && (
                        <div className="absolute -bottom-2.5 right-1 flex items-center gap-0.5 bg-[#1c1c1e] rounded-full shadow-lg px-1.5 py-0.5 border border-white/10 z-20">
                          {reactions.map((reaction, idx) => (
                            <span key={`${reaction.emoji}-${idx}`} className="text-xs leading-none">{reaction.emoji}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Message status icon for errors */}
                    {isFailed && (
                      <button
                        onClick={() => retryFailedMessage(msg)}
                        className="flex items-center gap-1 text-xs text-red-500 hover:underline"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Retry</span>
                      </button>
                    )}
                  </div>

                  {/* Time under bubble - over background */}
                  {!isSpecialType && (
                    <div className={`flex items-center gap-1 mt-1 text-[10px] text-gray-500 ${isOwn ? 'justify-end mr-1' : 'justify-start ml-9'}`}>
                      {isOwn && renderTicks()}
                      <span>{timeLabel}</span>
                    </div>
                  )}
                </motion.div>
              )
            })}
            <div
              ref={messagesEndRef}
              style={{
                position: 'absolute',
                top: messageListVirtualizer.getTotalSize(),
                height: 1,
                width: '100%'
              }}
            />
          </div>
        </div>
        {/* Message Action Menu */}
        <AnimatePresence>
          {showMessageMenu && selectedMessage && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
                onClick={() => { setShowMessageMenu(false); setSelectedMessage(null) }}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl rounded-t-3xl z-[201] safe-area-bottom overflow-hidden shadow-2xl border-t border-white/20"
                style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                onContextMenu={e => e.preventDefault()}
              >
                {/* Quick Reactions */}
                <div className="flex justify-center gap-3 py-6 border-b border-gray-200/50" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
                  {QUICK_REACTIONS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => handleAddReaction(selectedMessage.id, emoji)}
                      onContextMenu={e => e.preventDefault()}
                      className="w-12 h-12 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center text-2xl transition-transform active:scale-90 active:bg-gray-50"
                      style={{ userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>

                {/* Menu Options */}
                <div className="py-2" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
                  <button onClick={handleReply} onContextMenu={e => e.preventDefault()} className="w-full flex items-center gap-4 px-6 py-4 hover:bg-black/5 active:bg-black/10" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
                    <CornerUpLeft className="w-6 h-6 text-gray-600" />
                    <span className="font-medium text-gray-900 text-lg">Reply</span>
                  </button>
                  <button onClick={() => { setShowMessageMenu(false); setSelectedMessage(null) }} onContextMenu={e => e.preventDefault()} className="w-full flex items-center gap-4 px-6 py-4 hover:bg-black/5 active:bg-black/10" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
                    <Forward className="w-6 h-6 text-gray-600" />
                    <span className="font-medium text-gray-900 text-lg">Forward</span>
                  </button>
                  {selectedMessage.sender_id === user.telegram_id && (
                    <button onClick={handleDeleteMessage} onContextMenu={e => e.preventDefault()} className="w-full flex items-center gap-4 px-6 py-4 hover:bg-black/5 active:bg-black/10" style={{ userSelect: 'none', WebkitUserSelect: 'none' }}>
                      <Trash2 className="w-6 h-6 text-red-500" />
                      <span className="font-medium text-red-500 text-lg">Delete</span>
                    </button>
                  )}
                </div>

                {/* Cancel */}
                <div className="px-4 pb-6 pt-2">
                  <button
                    onClick={() => { setShowMessageMenu(false); setSelectedMessage(null) }}
                    onContextMenu={e => e.preventDefault()}
                    className="w-full py-4 bg-gray-100/80 rounded-2xl font-semibold text-gray-800 text-lg active:scale-95 transition-transform"
                    style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                  >
                    Cancel
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Actions Menu */}
        <AnimatePresence>
          {showActions && (
            <>
              <div className="fixed inset-0 z-[101]" onClick={() => setShowActions(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                className="absolute bottom-24 left-4 bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/40 p-2 z-[102] flex flex-col gap-1 w-48"
              >
                <button onClick={() => { fileInputRef.current?.click(); setShowActions(false) }} className="flex items-center gap-3 px-4 py-3.5 hover:bg-black/5 rounded-2xl transition-colors w-full text-left">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><Image className="w-5 h-5" /></div>
                  <span className="font-semibold text-gray-800">Photo</span>
                </button>
                <button onClick={() => { fileInputRef.current?.click(); setShowActions(false) }} className="flex items-center gap-3 px-4 py-3.5 hover:bg-black/5 rounded-2xl transition-colors w-full text-left">
                  <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-purple-600"><Video className="w-5 h-5" /></div>
                  <span className="font-semibold text-gray-800">Video</span>
                </button>
                <button onClick={() => { setShowGifts(true); setShowActions(false) }} className="flex items-center gap-3 px-4 py-3.5 hover:bg-black/5 rounded-2xl transition-colors w-full text-left">
                  <div className="w-9 h-9 rounded-full bg-pink-100 flex items-center justify-center text-pink-600"><Gift className="w-5 h-5" /></div>
                  <span className="font-semibold text-gray-800">Gift</span>
                </button>
                <button onClick={() => { setShowTip(true); setShowActions(false) }} className="flex items-center gap-3 px-4 py-3.5 hover:bg-black/5 rounded-2xl transition-colors w-full text-left">
                  <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-600"><DollarSign className="w-5 h-5" /></div>
                  <span className="font-semibold text-gray-800">Tip</span>
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Gifts Modal */}
        <AnimatePresence>
          {showGifts && (
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl rounded-t-[2.5rem] shadow-2xl z-[150] max-h-[70vh] overflow-hidden flex flex-col border-t border-white/20"
            >
              <div className="px-8 py-6 border-b border-gray-100/50 flex justify-between items-center">
                <h3 className="font-bold text-gray-900 text-xl">Send a Gift</h3>
                <button onClick={() => setShowGifts(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto">
                <div className="grid grid-cols-3 gap-4">
                  {gifts.map((gift) => (
                    <button
                      key={gift.id}
                      onClick={() => handleSendGift(gift)}
                      className="flex flex-col items-center p-4 rounded-3xl bg-gray-50 border border-gray-100 hover:border-pink-300 hover:bg-pink-50 transition-all active:scale-95"
                    >
                      <div className="w-16 h-16 bg-gradient-to-br from-pink-100 to-rose-100 rounded-2xl flex items-center justify-center mb-3 shadow-sm">
                        <Gift className="w-8 h-8 text-pink-500" />
                      </div>
                      <span className="text-sm font-bold text-gray-800 mb-1">{gift.name}</span>
                      <span className="text-xs font-bold text-pink-600 bg-pink-100/50 px-2 py-0.5 rounded-full">
                        {gift.price} tokens
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tip modal */}
        <AnimatePresence>
          {showTip && (
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-2xl rounded-t-[2.5rem] shadow-2xl z-[150] p-8 border-t border-white/20"
            >
              <div className="flex justify-between items-center mb-8">
                <h3 className="font-bold text-gray-900 text-xl">Send a Tip</h3>
                <button onClick={() => setShowTip(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>
              <div className="flex gap-4 mb-6">
                {[5, 10, 25, 50].map(amount => (
                  <button
                    key={amount}
                    onClick={() => setTipAmount(String(amount))}
                    className={`flex-1 py-4 rounded-2xl font-bold text-lg transition-all shadow-sm ${
                      tipAmount === String(amount)
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white scale-105 shadow-green-500/30'
                        : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    ${amount}
                  </button>
                ))}
              </div>
              <div className="flex gap-4">
                <div className="relative flex-1">
                  <span className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">$</span>
                  <input
                    type="number"
                    value={tipAmount}
                    onChange={(e) => setTipAmount(e.target.value)}
                    placeholder="Custom"
                    className="w-full pl-10 pr-4 py-4 rounded-2xl bg-gray-50 font-bold text-gray-900 text-lg focus:outline-none focus:ring-2 focus:ring-green-500 border border-transparent"
                  />
                </div>
                <button
                  onClick={handleSendTip}
                  disabled={!tipAmount || sending}
                  className="px-10 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl font-bold text-lg disabled:opacity-50 shadow-lg shadow-green-500/20 active:scale-95 transition-transform"
                >
                  {sending ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Send'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reply Preview */}
        <AnimatePresence>
          {replyTo && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="shrink-0 bg-white/10 backdrop-blur-xl border-t border-white/5 px-4 py-3 flex items-center gap-3 relative z-20"
            >
              <div className="w-1 h-10 bg-blue-500 rounded-full" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-blue-400 mb-0.5">
                  Replying to {replyTo.sender_id === user.telegram_id ? 'yourself' : activeConversation?.other_user?.first_name || 'user'}
                </p>
                <p className="text-sm text-gray-300 truncate">
                  {replyTo.content
                    ? replyTo.content.slice(0, 60) + (replyTo.content.length > 60 ? '...' : '')
                    : replyTo.message_type === 'image' ? '📷 Photo'
                    : replyTo.message_type === 'video' ? '🎥 Video'
                    : replyTo.message_type === 'voice' ? '🎤 Voice message'
                    : replyTo.message_type === 'gift' ? '🎁 Gift'
                    : '📎 Media'
                  }
                </p>
              </div>
              <button
                onClick={() => setReplyTo(null)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input Area - Glassmorphism */}
        <div
          className="shrink-0 bg-black/40 border-t border-white/5 px-3 py-2 relative z-20 backdrop-blur-xl"
          style={{
            paddingBottom: 'calc(var(--keyboard-height, 0px) + env(safe-area-inset-bottom, 0px))',
            transition: 'padding-bottom 0.12s ease'
          }}
        >
          <div className="bg-white/10 border border-white/5 rounded-[1.5rem] p-1.5 flex items-end gap-2 backdrop-blur-md">
            <button
              onClick={() => setShowActions(!showActions)}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shrink-0 ${showActions ? 'bg-white text-black rotate-45' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
              <Plus className="w-6 h-6" />
              {uploadingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-black animate-pulse" />
              )}
            </button>

            <div className="flex-1 py-1.5">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                ref={inputRef}
                onFocus={() => {
                  requestAnimationFrame(() => {
                    messagesEndRef.current?.scrollIntoView({ block: 'end' })
                  })
                }}
                placeholder="Message..."
                rows={1}
                className="w-full px-3 py-1 bg-transparent text-[16px] focus:outline-none text-white placeholder:text-white/40 resize-none max-h-32"
                style={{ minHeight: '24px' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height = Math.min(target.scrollHeight, 128) + 'px'
                }}
              />
            </div>

            <div className="shrink-0 flex items-center justify-center pb-0.5 pr-0.5">
              {newMessage.trim() ? (
                <button
                  onTouchEnd={(e) => {
                    e.preventDefault()
                    handleSendMessage()
                  }}
                  onClick={(e) => {
                    e.preventDefault()
                    handleSendMessage()
                  }}
                  disabled={sending || isSendingRef.current}
                  className="w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full text-white flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform shadow-lg shadow-blue-500/20"
                >
                  {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 ml-0.5" />}
                </button>
              ) : (
                <div className="w-10 h-10 flex items-center justify-center">
                  <VoiceRecorder onSend={handleSendVoice} disabled={sending} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Conversations list
  return (
    <div className="min-h-full text-white relative" style={{ background: 'black' }}>
      <StarsBackground />
      
      {/* Header */}
      <div className="sticky top-0 z-40 px-5 pt-6 pb-2 bg-gradient-to-b from-black/80 to-transparent backdrop-blur-sm">
        <div className="flex items-center justify-between mb-6">
           <h2 className="text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-white to-white/60">
             Messages
           </h2>
           <div className="p-2 rounded-full bg-white/5 border border-white/5 backdrop-blur-md">
             <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse" />
           </div>
        </div>

        {/* Search - Ultra modern */}
        <div className="relative mb-6 group">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative bg-white/5 border border-white/5 rounded-2xl flex items-center px-4 py-3 focus-within:bg-white/10 focus-within:border-white/10 transition-all duration-300">
             <Search className="w-5 h-5 text-white/40 mr-3 group-focus-within:text-white/80 transition-colors" />
             <input
               type="text"
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               placeholder="Search conversations..."
               className="w-full bg-transparent text-[15px] text-white placeholder:text-white/30 focus:outline-none"
             />
          </div>
        </div>

        {/* Category Tabs - Minimalist pills */}
        <div className="flex gap-2 mb-2 overflow-x-auto no-scrollbar pb-2">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-all duration-300 border ${
                activeCategory === cat.id
                  ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]'
                  : 'bg-transparent text-white/50 border-transparent hover:bg-white/5 hover:text-white/80'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conversations */}
      <div className="px-2 pb-24 relative z-10">
        {loading ? (
          <div className="text-center py-20">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-white/20" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-white/5 to-transparent rounded-full flex items-center justify-center mb-4 border border-white/5">
              <div className="w-12 h-12 text-white/20" >
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </div>
            </div>
            <p className="font-medium text-white/60 text-lg">No messages yet</p>
            <p className="text-sm text-white/30 mt-2">Start chatting with your favorite creators</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredConversations.map((conv) => renderConversationCard(conv))}
          </div>
        )}
      </div>
    </div>
  )
}

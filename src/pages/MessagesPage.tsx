import { useState, useEffect, useRef, useCallback } from 'react'
import type { VideoHTMLAttributes } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, ArrowLeft, Send, Image, Gift, DollarSign, Lock, X, Loader2, Plus, Video, CheckCheck, AlertCircle, CornerUpLeft, Forward, Trash2, Volume2, MessageCircle, Languages, Globe, Sparkles, ChevronDown, Edit3, MoreVertical, Ban, Eraser, Flag, Bell, Megaphone } from 'lucide-react'
import { type User } from '../lib/api'
import { useTranslation } from 'react-i18next'
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
  subscribeToConversations,
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
import { translateMessage } from '../lib/moderation'
import { TranslationLRUCache } from '../lib/lruCache'

// Global translation cache with LRU eviction (max 500 messages)
const translationCache = new TranslationLRUCache(500)
const TRANSLATION_PREF_KEY = 'chat-translation-prefs'

// Simplified dark background - no animated stars for performance
const ChatBackground = () => (
  <div className="fixed inset-0 bg-[#0a0a0a] pointer-events-none" style={{ zIndex: 0 }} />
)

type ChatMessage = Message & {
  _localId?: string
  _status?: 'sending' | 'uploading' | 'failed'
  _hidden?: boolean
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

type MessageCategory = 'messages' | 'requests' | 'notifications' | 'updates'

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
  const { t } = useTranslation()
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
  const [uploadingCount, setUploadingCount] = useState(0)
  const [activeCategory, setActiveCategory] = useState<MessageCategory>('messages')
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null)
  const [showMessageMenu, setShowMessageMenu] = useState(false)
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null)
  const [messageReactions, setMessageReactions] = useState<Map<string, MessageReaction[]>>(new Map())
  const [messagesReady, setMessagesReady] = useState(false)
  const [translateEnabled, setTranslateEnabled] = useState(false)
  const [translateTarget, setTranslateTarget] = useState('en')
  const [showTranslateSettings, setShowTranslateSettings] = useState(false)
  const [conversationMenuId, setConversationMenuId] = useState<string | null>(null)

  // Note: Using global translationCache (LRU) defined at module level

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlsRef = useRef<Set<string>>(new Set())
  const pendingMediaRef = useRef<Map<string, PendingMedia>>(new Map())
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const isSendingRef = useRef(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTapRef = useRef<{ time: number; messageId: string } | null>(null)
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const pendingReactionsRef = useRef<Set<string>>(new Set())

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

  const loadTranslationPrefs = (conversationId: string | null) => {
    if (typeof window === 'undefined' || !conversationId) return
    try {
      const raw = localStorage.getItem(TRANSLATION_PREF_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Record<string, { enabled: boolean; target: string }>
      const pref = parsed[conversationId]
      if (pref) {
        setTranslateEnabled(pref.enabled)
        setTranslateTarget(pref.target || 'en')
      } else {
        setTranslateEnabled(false)
        setTranslateTarget('en')
      }
    } catch (err) {
      console.warn('[Translation] load prefs failed', err)
    }
  }

  const saveTranslationPrefs = (conversationId: string | null, enabled: boolean, target: string) => {
    if (typeof window === 'undefined' || !conversationId) return
    try {
      const raw = localStorage.getItem(TRANSLATION_PREF_KEY)
      const parsed = raw ? (JSON.parse(raw) as Record<string, { enabled: boolean; target: string }>) : {}
      parsed[conversationId] = { enabled, target }
      localStorage.setItem(TRANSLATION_PREF_KEY, JSON.stringify(parsed))
    } catch (err) {
      console.warn('[Translation] save prefs failed', err)
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
            error: errorMessage || msg.error || t('messages.errors.sendFailed'),
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

  // Translate a single incoming message
  const translateIncomingMessage = useCallback(async (messageId: string, content: string, targetLang: string) => {
    // Check cache first (uses global LRU cache with 500 message limit)
    const cached = translationCache.get(messageId, targetLang)
    if (cached) {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, _translatedContent: cached, _isTranslating: false } : m
      ))
      return
    }

    // Mark as translating
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, _isTranslating: true, _translationError: null } : m
    ))

    try {
      console.log('[Translation] Starting for message:', messageId, content.slice(0, 30))
      const translated = await translateMessage(content, targetLang)
      console.log('[Translation] Result:', translated)

      if (translated) {
        // Cache the translation (LRU cache auto-evicts oldest entries)
        translationCache.set(messageId, targetLang, translated)

        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, _translatedContent: translated, _isTranslating: false } : m
        ))
      } else {
        // Translation returned null - API might have failed silently
        console.warn('[Translation] No result returned for message:', messageId)
        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, _isTranslating: false, _translationError: t('messages.errors.translationNoResult') } : m
        ))
      }
    } catch (err: any) {
      console.error('[Translation] Error:', err)
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, _isTranslating: false, _translationError: err?.message || t('messages.errors.translationFailed') } : m
      ))
    }
  }, [])

  // Translate all incoming messages when translation is enabled
  useEffect(() => {
    if (!translateEnabled || !translateTarget || !import.meta.env.VITE_AI_GUARDRAIL_URL) return

    // Find incoming text messages that need translation
    const incomingTextMessages = messages.filter(m =>
      m.sender_id !== user.telegram_id &&
      m.message_type === 'text' &&
      m.content &&
      !m._translatedContent &&
      !m._isTranslating &&
      !m._translationError && // Don't retry failed translations
      !m.id.startsWith('temp-')
    )

    // Translate up to 5 messages at a time to avoid rate limits
    const toTranslate = incomingTextMessages.slice(0, 5)
    toTranslate.forEach(msg => {
      if (msg.content) {
        translateIncomingMessage(msg.id, msg.content, translateTarget)
      }
    })
  }, [translateEnabled, translateTarget, messages, user.telegram_id, translateIncomingMessage])

  // Persist translation prefs per conversation when user toggles or changes target
  useEffect(() => {
    if (activeConversation?.id) {
      saveTranslationPrefs(activeConversation.id, translateEnabled, translateTarget)
    }
  }, [activeConversation?.id, translateEnabled, translateTarget])

  // iOS keyboard fix: scroll to bottom when keyboard opens/closes
  useEffect(() => {
    if (!activeConversation) return

    let lastHeight = window.visualViewport?.height ?? window.innerHeight
    let scrollInterval: ReturnType<typeof setInterval> | null = null

    const scrollToBottom = () => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
      }
    }

    const handleViewportResize = () => {
      const currentHeight = window.visualViewport?.height ?? window.innerHeight
      const heightDiff = currentHeight - lastHeight

      // Keyboard opening = viewport getting SMALLER (heightDiff < -50px)
      // Keyboard closing = viewport getting BIGGER (heightDiff > 50px)
      if (Math.abs(heightDiff) > 50 && messagesContainerRef.current) {
        // Clear any existing interval
        if (scrollInterval) clearInterval(scrollInterval)

        // Scroll immediately
        scrollToBottom()

        // For keyboard OPENING, keep scrolling during the animation (iOS ~300ms)
        if (heightDiff < -50) {
          let scrollCount = 0
          scrollInterval = setInterval(() => {
            scrollToBottom()
            scrollCount++
            // Stop after 300ms (15 iterations at 20ms)
            if (scrollCount >= 15) {
              if (scrollInterval) clearInterval(scrollInterval)
              scrollInterval = null
            }
          }, 20)
        }
      }

      lastHeight = currentHeight
    }

    window.visualViewport?.addEventListener('resize', handleViewportResize)
    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportResize)
      if (scrollInterval) clearInterval(scrollInterval)
    }
  }, [activeConversation])

  useEffect(() => {
    loadConversations()
    loadGifts()
    loadTranslationPrefs(activeConversation?.id ?? null)

    // Subscribe to conversation updates (new messages, unread counts, new conversations)
    const unsubscribe = subscribeToConversations(user.telegram_id, (updatedConv) => {
      setConversations(prev => {
        const existingIndex = prev.findIndex(c => c.id === updatedConv.id)
        if (existingIndex >= 0) {
          // Update existing conversation
          const updated = [...prev]
          updated[existingIndex] = updatedConv
          // Re-sort by last_message_at
          updated.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())
          return updated
        } else {
          // New conversation - add to top
          return [updatedConv, ...prev]
        }
      })
    })

    return () => unsubscribe()
  }, [user.telegram_id])

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
      previewUrlsRef.current.clear()
    }
  }, [])

  useEffect(() => {
    if (selectedConversationId && conversations.length > 0) {
      const conv = conversations.find(c => c.id === selectedConversationId)
      if (conv) {
        setActiveConversation(conv)
        onConversationOpened?.()
      }
    }
  }, [selectedConversationId, conversations])

  useEffect(() => {
    onChatStateChange?.(!!activeConversation)

    if (activeConversation) {
      // Load per-conversation translation prefs
      loadTranslationPrefs(activeConversation.id)

      loadMessages(activeConversation.id)
      markMessagesRead(activeConversation.id, user.telegram_id)

      const unsubscribe = subscribeToMessages(
        activeConversation.id,
        // onMessage - new messages
        (newMsg) => {
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

          // Auto-scroll to bottom on any new message
          requestAnimationFrame(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
            }
          })

          if (newMsg.sender_id !== user.telegram_id) {
            markMessagesRead(activeConversation.id, user.telegram_id)
          }
        },
        // onMessageUpdate - read status updates
        (messageId, updates) => {
          setMessages(prev => prev.map(msg => {
            if (msg.id === messageId) {
              return { ...msg, ...updates }
            }
            return msg
          }))
        }
      )

      return () => unsubscribe()
    }

    return () => {
      onChatStateChange?.(false)
    }
  }, [activeConversation])

  // With flex-col-reverse, scrollTop=0 means bottom (newest), no scroll needed for new messages

  const loadConversations = async () => {
    setLoading(true)
    const data = await getConversations(user.telegram_id)
    setConversations(data)
    setLoading(false)
  }

  const loadMessages = async (conversationId: string) => {
    setMessagesReady(false)
    const data = await getMessages(conversationId)
    setMessages(data)

    if (data.length > 0) {
      const messageIds = data.map(m => m.id)
      const reactions = await getMessageReactions(messageIds)
      setMessageReactions(reactions)
    }

    // After messages render, scroll to bottom THEN show
    requestAnimationFrame(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
      }
      // Small delay to ensure scroll is complete before showing
      requestAnimationFrame(() => {
        setMessagesReady(true)
      })
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
          throw new Error(voiceResult.error || t('messages.errors.voiceUploadFailed'))
        }
        const msg = await sendMediaMessage(conversationId, user.telegram_id, voiceResult.url, 'voice', undefined, tempId)
        if (msg) {
          resolveTempMessage(tempId, msg)
        } else {
          throw new Error(t('messages.errors.voiceUploadFailed'))
        }
      } else {
        const mediaResult = await uploadMessageMedia(payload.file as File, user.telegram_id)
        if (mediaResult.error || !mediaResult.url) {
          throw new Error(mediaResult.error || t('messages.errors.mediaUploadFailed'))
        }
        const msg = await sendMediaMessage(conversationId, user.telegram_id, mediaResult.url, payload.mediaType, undefined, tempId)
        if (msg) {
          resolveTempMessage(tempId, msg)
        } else {
          throw new Error(t('messages.errors.mediaUploadFailed'))
        }
      }
      pendingMediaRef.current.delete(tempId)
    } catch (err) {
      console.error('[Chat] Media upload error:', err)
      const message = err instanceof Error ? err.message : t('messages.errors.mediaUploadFailed')
      resolveTempMessage(tempId, undefined, message)
      alert(message)
    } finally {
      setUploadingCount(prev => Math.max(0, prev - 1))
    }
  }

  const handleSendMessage = async () => {
    if (isSendingRef.current) return
    if (!newMessage.trim() || !activeConversation || sending) return

    isSendingRef.current = true

    let text = newMessage.trim()
    const tempId = `temp-text-${Date.now()}`
    const replyToId = replyTo?.id?.startsWith('temp-') ? undefined : replyTo?.id
    const savedReplyTo = replyTo

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

    // Clear input and reset textarea height instantly
    setNewMessage('')
    setReplyTo(null)
    if (inputRef.current) {
      inputRef.current.style.height = '40px'
    }

    // Add message and scroll to bottom
    setSending(true)
    setMessages(prev => [...prev, optimisticMessage])

    // Scroll to bottom after message is added
    requestAnimationFrame(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
      }
    })

    try {
      const msg = await sendMessage(activeConversation.id, user.telegram_id, text, tempId, replyToId)
      if (msg) {
        if (savedReplyTo && !savedReplyTo.id.startsWith('temp-')) {
          msg.reply_to = savedReplyTo
        }
        resolveTempMessage(tempId, msg)
      } else {
        resolveTempMessage(tempId, undefined, t('messages.errors.sendMessageFailed'))
      }
    } catch (err) {
      console.error('[Chat] Send message error:', err)
      const message = err instanceof Error ? err.message : t('messages.errors.sendMessageFailed')
      resolveTempMessage(tempId, undefined, message)
      alert(message)
    } finally {
      // Always release the lock, even if alert() or other code throws
      setSending(false)
      isSendingRef.current = false
    }
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
        alert(t('messages.errors.selectMedia'))
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
        resolveTempMessage(tempId, undefined, t('messages.errors.sendMessageFailed'))
        }
      } catch (err) {
      const message = err instanceof Error ? err.message : t('messages.errors.sendMessageFailed')
        resolveTempMessage(tempId, undefined, message)
        alert(message)
      }
      setSending(false)
      return
    }

    const pending = pendingMediaRef.current.get(tempId)
    if (!pending) {
      alert(t('messages.errors.mediaMissing'))
      return
    }

    setMessages(prev =>
      prev.map(m => (m._localId === tempId ? { ...m, _status: 'uploading', error: undefined } : m))
    )
    void runMediaUpload(tempId, pending, activeConversation.id)
  }

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

  const handleMessageTap = useCallback((msg: ChatMessage) => {
    const now = Date.now()
    if (lastTapRef.current && lastTapRef.current.messageId === msg.id && now - lastTapRef.current.time < 300) {
      handleAddReaction(msg.id, '❤️')
      lastTapRef.current = null
    } else {
      lastTapRef.current = { time: now, messageId: msg.id }
    }
  }, [])

  const handleAddReaction = async (messageId: string, emoji: string) => {
    const reactionKey = `${messageId}:${emoji}`

    if (pendingReactionsRef.current.has(reactionKey)) {
      setShowMessageMenu(false)
      setSelectedMessage(null)
      return
    }

    if (messageId.startsWith('temp-')) {
      setShowMessageMenu(false)
      setSelectedMessage(null)
      return
    }

    pendingReactionsRef.current.add(reactionKey)
    setShowMessageMenu(false)
    setSelectedMessage(null)

    try {
      await addReaction(messageId, user.telegram_id, emoji)
      const updatedReactions = await getMessageReactions([messageId])
      setMessageReactions(prev => {
        const newMap = new Map(prev)
        newMap.set(messageId, updatedReactions.get(messageId) || [])
        return newMap
      })
    } catch (err) {
      console.error('[Reaction] Error:', err)
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
      pendingReactionsRef.current.delete(reactionKey)
    }
  }

  const handleReply = () => {
    if (selectedMessage) {
      setReplyTo(selectedMessage)
      setShowMessageMenu(false)
      setSelectedMessage(null)
    }
  }

  const handleDeleteMessage = async () => {
    if (!selectedMessage) return

    const messageId = selectedMessage.id
    setShowMessageMenu(false)
    setSelectedMessage(null)

    if (messageId.startsWith('temp-')) {
      setMessages(prev => prev.filter(m => m.id !== messageId))
      return
    }

    setMessages(prev => prev.filter(m => m.id !== messageId))

    try {
      await deleteMessage(messageId, user.telegram_id)
    } catch (err) {
      console.error('[Delete] Backend error:', err)
    }
  }

  const scrollToMessage = useCallback((messageId: string) => {
    const element = messageRefs.current.get(messageId)
    if (!element) return

    // Scroll to element
    element.scrollIntoView({ behavior: 'instant', block: 'center' })

    // Highlight effect
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
  }, [])

  const formatTime = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()

    if (diff < 60000) return t('messages.time.now')
    if (diff < 3600000) return t('messages.time.minutes', { count: Math.floor(diff / 60000) })
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const getFilteredConversations = () => {
    const filtered = conversations

    switch (activeCategory) {
      case 'messages':
        // Messages: accepted conversations only (not requests)
        return filtered.filter(c => !c.is_request)
      case 'requests':
        // Requests: only pending requests
        return filtered.filter(c => c.is_request)
      case 'notifications':
      case 'updates':
        // These tabs don't show conversations
        return []
      default:
        return filtered
    }
  }

  const filteredConversations = getFilteredConversations()

  const categories: { id: MessageCategory; label: string }[] = [
    { id: 'messages', label: 'Messages' },
    { id: 'requests', label: 'Requests' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'updates', label: 'Updates' },
  ]

  const renderConversationCard = (conv: Conversation) => (
    <div
      key={conv.id}
      className="w-full flex items-center gap-3 py-2 px-4 active:bg-white/5 transition-colors"
    >
      <button
        className="flex items-center gap-3 flex-1 min-w-0"
        onClick={() => setActiveConversation(conv)}
      >
        {/* Avatar with gradient ring for stories/active */}
        <div className="relative shrink-0">
          <div className={`w-14 h-14 rounded-full overflow-hidden ${
            conv.is_request
              ? 'ring-2 ring-amber-500/50'
              : 'ring-2 ring-transparent'
          }`}>
            <img
              src={conv.other_user?.avatar_url || `https://i.pravatar.cc/150?u=${conv.other_user?.telegram_id}`}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </div>
          {/* Online indicator or unread dot */}
          {(conv.unread_count || 0) > 0 && (
            <div className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 rounded-full border-2 border-black" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <span className={`text-[15px] truncate ${
              (conv.unread_count || 0) > 0 ? 'font-semibold text-white' : 'font-normal text-white'
            }`}>
              {conv.other_user?.first_name || conv.other_user?.username || t('messages.userFallback')}
            </span>
            {conv.other_user?.is_verified && (
              <CheckCircle className="w-4 h-4 text-blue-400 fill-blue-400" />
            )}
          </div>
          <p className={`text-[14px] truncate ${
            (conv.unread_count || 0) > 0 ? 'text-white/70' : 'text-white/50'
          }`}>
            {conv.last_message_preview || t('messages.lastMessageFallback')}
            {conv.last_message_at && (
              <span className="text-white/40"> · {formatTime(conv.last_message_at)}</span>
            )}
          </p>
        </div>
      </button>

      {/* 3-dots menu button */}
      <div className="relative shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setConversationMenuId(conversationMenuId === conv.id ? null : conv.id)
          }}
          className="w-10 h-10 flex items-center justify-center"
        >
          <MoreVertical className="w-5 h-5 text-white/40" strokeWidth={1.5} />
        </button>

        {/* Glassmorphic menu dropdown */}
        <AnimatePresence>
          {conversationMenuId === conv.id && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-12 z-50 min-w-[200px] rounded-2xl overflow-hidden"
              style={{
                background: 'rgba(40, 40, 40, 0.85)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  setConversationMenuId(null)
                  // Clear conversation action - would need API implementation
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors"
              >
                <Eraser className="w-5 h-5 text-white/70" />
                <span className="text-[15px] text-white">Clear conversation</span>
              </button>
              <div className="h-px bg-white/10" />
              <button
                onClick={() => {
                  setConversationMenuId(null)
                  // Mute action
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors"
              >
                <Ban className="w-5 h-5 text-white/70" />
                <span className="text-[15px] text-white">Mute notifications</span>
              </button>
              <div className="h-px bg-white/10" />
              <button
                onClick={() => {
                  setConversationMenuId(null)
                  // Report action
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors"
              >
                <Flag className="w-5 h-5 text-amber-500/80" />
                <span className="text-[15px] text-amber-500">Report user</span>
              </button>
              <div className="h-px bg-white/10" />
              <button
                onClick={async () => {
                  setConversationMenuId(null)
                  // Delete conversation
                  setConversations(prev => prev.filter(c => c.id !== conv.id))
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors"
              >
                <Trash2 className="w-5 h-5 text-red-500/80" />
                <span className="text-[15px] text-red-500">Delete chat</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )

  if (activeConversation) {
    return (
      <div
        ref={chatContainerRef}
        className="fixed inset-0 z-[100] flex flex-col bg-[#050505]"
        style={{ height: '100%', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
      >
        <ChatBackground />

        <input
          type="file"
          ref={fileInputRef}
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        <div className="shrink-0 relative z-50" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.95) 0%, rgba(10,10,10,0.9) 100%)', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 44px)' }}>
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/10">
            <button
              onClick={() => {
                setActiveConversation(null)
                onChatStateChange?.(false)
              }}
              className="w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-full transition-all active:scale-95"
            >
              <ArrowLeft className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={() => {
                if (activeConversation.other_user) {
                  onProfileClick?.(activeConversation.other_user)
                }
              }}
              className="flex items-center gap-3 flex-1 min-w-0 active:opacity-70 transition-opacity text-left"
            >
              <div className="relative shrink-0">
                <img
                  src={activeConversation.other_user?.avatar_url || `https://i.pravatar.cc/150?u=${activeConversation.other_user?.telegram_id}`}
                  alt=""
                  loading="lazy"
                  className="w-9 h-9 rounded-full object-cover ring-2 ring-white/10"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-[14px] text-white truncate">{activeConversation.other_user?.first_name || activeConversation.other_user?.username}</span>
                  {activeConversation.other_user?.is_verified && (
                    <CheckCircle className="w-3.5 h-3.5 text-blue-400 fill-blue-400/20" />
                  )}
                </div>
                {activeConversation.other_user?.username && (
                  <p className="text-[11px] text-white/50 font-medium">@{activeConversation.other_user.username}</p>
                )}
              </div>
            </button>

            {/* Translation settings button */}
            <button
              onClick={() => setShowTranslateSettings(true)}
              className={`w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-95 ${translateEnabled ? 'bg-blue-500/20 text-blue-400' : 'hover:bg-white/10 text-white/70'}`}
            >
              <Languages className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto px-3 pt-3 overscroll-none relative z-10"
          style={{
            display: 'flex',
            flexDirection: 'column',
            overflowAnchor: 'none',
            paddingBottom: 'calc(90px + env(safe-area-inset-bottom, 0px))',
            opacity: messagesReady ? 1 : 0
          }}
        >
          {/* Spacer that grows to push messages to bottom */}
          <div style={{ flexGrow: 1, minHeight: 0 }} />
          <div style={{ overflowAnchor: 'auto' }}>
            {messages.map((msg, index) => {
              // Skip hidden messages (waiting for keyboard to close)
              if (msg._hidden) return null

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
                <div
                  key={msg.id}
                  ref={el => {
                    if (el) {
                      messageRefs.current.set(msg.id, el)
                    } else {
                      messageRefs.current.delete(msg.id)
                    }
                  }}
                  style={{
                    marginBottom: reactions.length > 0 ? '16px' : '4px'
                  }}
                  className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                >
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
                          {msg.reply_to.sender_id === user.telegram_id ? t('messages.you') : activeConversation.other_user?.first_name || t('messages.userFallback')}
                        </span>
                        <span className={`truncate w-full text-[13px] ${isOwn ? 'text-white/80' : 'text-gray-300'}`}>
                          {msg.reply_to.content
                            ? msg.reply_to.content.slice(0, 50) + (msg.reply_to.content.length > 50 ? '...' : '')
                            : msg.reply_to.message_type === 'image' ? t('messages.typePhoto')
                            : msg.reply_to.message_type === 'video' ? t('messages.typeVideo')
                            : msg.reply_to.message_type === 'voice' ? t('messages.typeVoice')
                            : msg.reply_to.message_type === 'gift' ? t('messages.typeGift')
                            : t('messages.typeMedia')
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
                        isSpecialType ? 'p-0 bg-transparent' :
                        msg.message_type === 'image' || msg.message_type === 'video' ? 'p-0 bg-transparent' :
                        isOwn
                          ? 'px-3.5 py-2 text-white rounded-[18px] rounded-br-[4px]'
                          : 'px-3.5 py-2 text-white rounded-[18px] rounded-bl-[4px]'
                      } ${isFailed ? 'ring-2 ring-red-500/50' : ''}`}
                      style={{
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        WebkitTouchCallout: 'none',
                        minHeight: msg.message_type === 'text' && !isSpecialType ? '36px' : undefined,
                        ...(msg.message_type === 'text' && !isSpecialType ? {
                          background: isOwn
                            ? 'linear-gradient(135deg, #0A84FF 0%, #0066CC 100%)'
                            : 'linear-gradient(135deg, #2C2C2E 0%, #1C1C1E 100%)',
                          boxShadow: isOwn
                            ? '0 1px 8px rgba(10, 132, 255, 0.25)'
                            : '0 1px 6px rgba(0, 0, 0, 0.25)'
                        } : {})
                      }}
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
                            <p className="text-sm text-pink-300 font-medium drop-shadow-md">{msg.gift.price} {t('messages.tokensLabel')}</p>
                          </div>
                        </div>
                      )}

                      {msg.tip_amount && (
                        <div className="text-center relative">
                           <div className="absolute inset-0 bg-gradient-to-tr from-green-500/30 to-emerald-500/30 blur-xl rounded-full" />
                           <div className="relative z-10 flex flex-col items-center">
                             <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-green-600 rounded-full flex items-center justify-center shadow-lg mb-2 border-2 border-white/20">
                               <DollarSign className="w-8 h-8 text-white" strokeWidth={3} />
                             </div>
                             <p className="font-bold text-white text-lg drop-shadow-md">${msg.tip_amount.toFixed(2)}</p>
                             <p className="text-sm text-emerald-300 font-medium drop-shadow-md">{t('messages.tipSent')}</p>
                           </div>
                        </div>
                      )}

                      {msg.message_type === 'voice' && (
                        <div
                          className="flex items-center gap-3 px-4 py-3 rounded-2xl min-w-[200px]"
                          style={{
                            background: isOwn
                              ? 'linear-gradient(135deg, #0A84FF 0%, #0066CC 100%)'
                              : 'linear-gradient(135deg, #2C2C2E 0%, #1C1C1E 100%)',
                            boxShadow: isOwn
                              ? '0 2px 12px rgba(10, 132, 255, 0.3)'
                              : '0 2px 8px rgba(0, 0, 0, 0.3)'
                          }}
                        >
                          {isPending ? (
                            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(255, 255, 255, 0.15)' }}>
                              <Loader2 className="w-5 h-5 animate-spin text-white" />
                            </div>
                          ) : (
                            <button
                              className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                              style={{ background: 'rgba(255, 255, 255, 0.2)' }}
                              onClick={(e) => {
                                e.stopPropagation()
                                const audio = new Audio(resolvedMediaUrl!)
                                audio.play().catch(err => console.error('Failed to play voice', err))
                              }}
                            >
                              <Volume2 className="w-5 h-5 text-white" />
                            </button>
                          )}
                          <div className="flex-1">
                            {/* Waveform visualization - deterministic based on message id */}
                            <div className="flex items-center gap-0.5 h-6">
                              {Array.from({ length: 20 }).map((_, i) => {
                                // Generate stable pseudo-random height based on message id and bar index
                                const seed = (msg.id.charCodeAt(i % msg.id.length) || 0) + i * 7
                                const height = 20 + (seed % 80)
                                return (
                                  <div
                                    key={i}
                                    className="w-1 rounded-full"
                                    style={{
                                      height: `${height}%`,
                                      minHeight: '4px',
                                      background: 'rgba(255, 255, 255, 0.6)'
                                    }}
                                  />
                                )
                              })}
                            </div>
                            <p className="text-[11px] mt-1 text-white/60 font-medium">
                              {t('messages.typeVoice')}
                            </p>
                          </div>
                        </div>
                      )}

                      {(msg.message_type === 'image' || msg.message_type === 'video') && resolvedMediaUrl && (
                        <div
                          className="relative overflow-hidden max-w-[75vw]"
                          style={{
                            borderRadius: '20px',
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
                          }}
                        >
                          {msg.message_type === 'image' ? (
                            <img
                              src={resolvedMediaUrl}
                              alt=""
                              className="w-full h-auto max-h-[60vh] object-cover"
                              loading="lazy"
                              style={{ display: 'block' }}
                            />
                          ) : (
                            <MessageVideo
                              src={resolvedMediaUrl}
                              controls
                              playsInline
                              loop
                              muted={!isOwn}
                              className="max-h-[60vh] max-w-[75vw] object-contain"
                              containerClassName="max-h-[60vh] max-w-[75vw]"
                              style={{ background: '#000', display: 'block' }}
                            />
                          )}

                          {isPending && (
                            <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0, 0, 0, 0.5)' }}>
                              <Loader2 className="w-10 h-10 text-white animate-spin" />
                            </div>
                          )}
                        </div>
                      )}

                      {isPPVLocked && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-md rounded-3xl flex flex-col items-center justify-center text-white text-center p-4">
                          <Lock className="w-8 h-8 mb-3 text-white/80" />
                          <p className="font-bold mb-1 text-lg">{t('messages.lockedTitle')}</p>
                          <p className="text-sm text-white/70 mb-4">{msg.ppv_price} {t('messages.tokensLabel')}</p>
                          <button
                            onClick={() => handleUnlockPPV(msg.id)}
                            className="px-6 py-2.5 bg-white text-black rounded-full font-bold text-sm active:scale-95 transition-transform"
                          >
                            {t('messages.unlock')}
                          </button>
                        </div>
                      )}

                      {msg.message_type === 'text' && msg.content && (
                        <div className="flex flex-col">
                          <p className="text-[15px] leading-snug whitespace-pre-wrap break-words" style={{ wordBreak: 'break-word' }}>
                            {/* Show translated content for incoming messages when available */}
                            {translateEnabled && !isOwn && msg._translatedContent
                              ? msg._translatedContent
                              : msg.content}
                          </p>
                          {/* Translation indicator for incoming messages */}
                          {!isOwn && translateEnabled && (
                            <div className="mt-1 flex items-center gap-1">
                              {msg._isTranslating && (
                                <span className="text-[10px] text-white/40 flex items-center gap-1">
                                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                  {t('messages.translation.statusTranslating')}
                                </span>
                              )}
                              {msg._translatedContent && (
                                <span className="text-[10px] text-blue-400/70">
                                  {t('messages.translation.statusTranslated', { lang: translateTarget.toUpperCase() })}
                                </span>
                              )}
                              {msg._translationError && (
                                <span className="text-[10px] text-red-400/70">
                                  {t('messages.translation.statusFailed')}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {isFailed && (
                        <div className="mt-1 text-xs text-red-200 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>{t('messages.errors.sendFailed')}</span>
                        </div>
                      )}

                      {reactions.length > 0 && (
                        <div className="absolute -bottom-2.5 right-1 flex items-center gap-0.5 bg-[#1c1c1e] rounded-full shadow-lg px-1.5 py-0.5 border border-white/10 z-20">
                          {reactions.map((reaction, idx) => (
                            <span key={`${reaction.emoji}-${idx}`} className="text-xs leading-none">{reaction.emoji}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    {isFailed && (
                      <button
                        onClick={() => retryFailedMessage(msg)}
                        className="flex items-center gap-1 text-xs text-red-500 hover:underline"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>{t('messages.retry')}</span>
                      </button>
                    )}
                  </div>

                  {!isSpecialType && (
                    <div className={`flex items-center gap-1.5 mt-1.5 ${isOwn ? 'justify-end mr-1' : 'justify-start ml-9'}`}>
                      <span className="text-[11px] text-white/40 font-medium">{timeLabel}</span>
                      {isOwn && renderTicks()}
                    </div>
                  )}
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>
        <AnimatePresence>
          {showMessageMenu && selectedMessage && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[200]"
                style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)' }}
                onClick={() => { setShowMessageMenu(false); setSelectedMessage(null) }}
              />
              <motion.div
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 100 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="fixed bottom-0 left-0 right-0 z-[201] safe-area-bottom overflow-hidden"
                style={{
                  background: 'linear-gradient(to bottom, rgba(40, 40, 40, 0.98) 0%, rgba(30, 30, 30, 0.98) 100%)',
                  borderTopLeftRadius: '24px',
                  borderTopRightRadius: '24px',
                  boxShadow: '0 -4px 30px rgba(0, 0, 0, 0.5)',
                  userSelect: 'none',
                  WebkitUserSelect: 'none'
                }}
                onContextMenu={e => e.preventDefault()}
              >
                {/* Handle bar */}
                <div className="flex justify-center py-3">
                  <div className="w-10 h-1 rounded-full bg-white/20" />
                </div>

                {/* Quick reactions */}
                <div className="flex justify-center gap-2 px-4 pb-4">
                  {QUICK_REACTIONS.map(emoji => (
                    <motion.button
                      key={emoji}
                      whileTap={{ scale: 0.85 }}
                      onClick={() => handleAddReaction(selectedMessage.id, emoji)}
                      onContextMenu={e => e.preventDefault()}
                      className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
                      style={{
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                        WebkitTouchCallout: 'none'
                      }}
                    >
                      {emoji}
                    </motion.button>
                  ))}
                </div>

                {/* Divider */}
                <div className="mx-4 h-px bg-white/10" />

                {/* Actions */}
                <div className="py-2">
                  <button
                    onClick={handleReply}
                    onContextMenu={e => e.preventDefault()}
                    className="w-full flex items-center gap-4 px-5 py-4 active:bg-white/5 transition-colors"
                    style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                      <CornerUpLeft className="w-5 h-5 text-blue-400" />
                    </div>
                    <span className="font-medium text-white text-[16px]">{t('messages.actions.reply')}</span>
                  </button>
                  <button
                    onClick={() => { setShowMessageMenu(false); setSelectedMessage(null) }}
                    onContextMenu={e => e.preventDefault()}
                    className="w-full flex items-center gap-4 px-5 py-4 active:bg-white/5 transition-colors"
                    style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                  >
                    <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                      <Forward className="w-5 h-5 text-purple-400" />
                    </div>
                    <span className="font-medium text-white text-[16px]">{t('messages.actions.forward')}</span>
                  </button>
                  {selectedMessage.sender_id === user.telegram_id && (
                    <button
                      onClick={handleDeleteMessage}
                      onContextMenu={e => e.preventDefault()}
                      className="w-full flex items-center gap-4 px-5 py-4 active:bg-white/5 transition-colors"
                      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
                    >
                      <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                        <Trash2 className="w-5 h-5 text-red-400" />
                      </div>
                      <span className="font-medium text-red-400 text-[16px]">{t('messages.actions.delete')}</span>
                    </button>
                  )}
                </div>

                {/* Cancel button */}
                <div className="px-4 pb-6 pt-2">
                  <button
                    onClick={() => { setShowMessageMenu(false); setSelectedMessage(null) }}
                    onContextMenu={e => e.preventDefault()}
                    className="w-full py-4 rounded-2xl font-semibold text-white text-[16px] active:scale-[0.98] transition-transform"
                    style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      userSelect: 'none',
                      WebkitUserSelect: 'none'
                    }}
                  >
                    {t('messages.actions.cancel')}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Translation Settings Modal - Premium Glassmorphic Design */}
        <AnimatePresence>
          {showTranslateSettings && (
            <>
              {/* Backdrop with heavy blur */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[200]"
                style={{
                  background: 'rgba(0, 0, 0, 0.85)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)'
                }}
                onClick={() => setShowTranslateSettings(false)}
              />

              {/* Modal Container */}
              <motion.div
                initial={{ opacity: 0, y: 100, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 100, scale: 0.95 }}
                transition={{ type: 'spring', damping: 30, stiffness: 400 }}
                className="fixed bottom-0 left-0 right-0 z-[201] safe-area-bottom overflow-hidden"
                style={{
                  background: 'rgba(20, 20, 22, 0.95)',
                  backdropFilter: 'blur(40px)',
                  WebkitBackdropFilter: 'blur(40px)',
                  borderTopLeftRadius: '28px',
                  borderTopRightRadius: '28px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderBottom: 'none',
                  boxShadow: '0 -8px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                }}
              >
                {/* Handle bar */}
                <div className="flex justify-center py-4">
                  <div className="w-12 h-1.5 rounded-full bg-white/15" />
                </div>

                {/* Header */}
                <div className="px-6 pb-5">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)'
                      }}
                    >
                      <Languages className="w-7 h-7 text-white/70" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-white tracking-tight">{t('messages.translation.title')}</h3>
                      <p className="text-sm text-white/40 mt-0.5">{t('messages.translation.subtitle')}</p>
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="mx-6 h-px bg-white/8" />

                {/* Settings */}
                <div className="p-6 space-y-5">
                  {/* Enable/Disable Toggle */}
                  <div
                    className="flex items-center justify-between p-4 rounded-2xl"
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Sparkles className={`w-5 h-5 transition-colors ${translateEnabled ? 'text-white' : 'text-white/30'}`} />
                      <div>
                        <p className="font-medium text-white text-[15px]">{t('messages.translation.autoTitle')}</p>
                        <p className="text-xs text-white/35 mt-0.5">{t('messages.translation.autoSubtitle')}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setTranslateEnabled(!translateEnabled)}
                      className="w-14 h-8 rounded-full transition-all duration-300 relative"
                      style={{
                        background: translateEnabled
                          ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.9) 0%, rgba(200, 200, 200, 0.9) 100%)'
                          : 'rgba(255, 255, 255, 0.08)',
                        border: translateEnabled ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
                      }}
                    >
                      <div
                        className={`absolute top-1 w-6 h-6 rounded-full shadow-lg transition-all duration-300 ${translateEnabled ? 'left-7' : 'left-1'}`}
                        style={{
                          background: translateEnabled ? '#000' : 'rgba(255, 255, 255, 0.5)',
                        }}
                      />
                    </button>
                  </div>

                  {/* Language Selection */}
                  <div
                    className="p-4 rounded-2xl"
                    style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <Globe className="w-5 h-5 text-white/40" />
                      <p className="font-medium text-white text-[15px]">{t('messages.translation.translateTo')}</p>
                    </div>
                    <div className="grid grid-cols-4 gap-2 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                      {[
                        { code: 'en', name: 'English', flag: '🇬🇧' },
                        { code: 'es', name: 'Spanish', flag: '🇪🇸' },
                        { code: 'ru', name: 'Russian', flag: '🇷🇺' },
                        { code: 'fr', name: 'French', flag: '🇫🇷' },
                        { code: 'de', name: 'German', flag: '🇩🇪' },
                        { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
                        { code: 'bg', name: 'Bulgarian', flag: '🇧🇬' },
                        { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
                        { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
                        { code: 'ko', name: 'Korean', flag: '🇰🇷' },
                        { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
                        { code: 'it', name: 'Italian', flag: '🇮🇹' },
                        { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
                        { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
                        { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
                        { code: 'pl', name: 'Polish', flag: '🇵🇱' },
                        { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
                        { code: 'cs', name: 'Czech', flag: '🇨🇿' },
                        { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
                        { code: 'da', name: 'Danish', flag: '🇩🇰' },
                        { code: 'fi', name: 'Finnish', flag: '🇫🇮' },
                        { code: 'no', name: 'Norwegian', flag: '🇳🇴' },
                        { code: 'el', name: 'Greek', flag: '🇬🇷' },
                        { code: 'he', name: 'Hebrew', flag: '🇮🇱' },
                        { code: 'th', name: 'Thai', flag: '🇹🇭' },
                        { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' },
                        { code: 'id', name: 'Indonesian', flag: '🇮🇩' },
                        { code: 'ms', name: 'Malay', flag: '🇲🇾' },
                        { code: 'ro', name: 'Romanian', flag: '🇷🇴' },
                        { code: 'hu', name: 'Hungarian', flag: '🇭🇺' },
                        { code: 'sk', name: 'Slovak', flag: '🇸🇰' },
                        { code: 'hr', name: 'Croatian', flag: '🇭🇷' },
                      ].map(lang => (
                        <button
                          key={lang.code}
                          onClick={() => setTranslateTarget(lang.code)}
                          className="flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all active:scale-95"
                          style={{
                            background: translateTarget === lang.code
                              ? 'rgba(255, 255, 255, 0.1)'
                              : 'rgba(255, 255, 255, 0.02)',
                            border: translateTarget === lang.code
                              ? '1px solid rgba(255, 255, 255, 0.2)'
                              : '1px solid rgba(255, 255, 255, 0.04)',
                            boxShadow: translateTarget === lang.code
                              ? 'inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                              : 'none',
                          }}
                        >
                          <span className="text-xl">{lang.flag}</span>
                          <span className={`text-[11px] font-medium uppercase tracking-wide ${
                            translateTarget === lang.code ? 'text-white' : 'text-white/50'
                          }`}>
                            {lang.code}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Info */}
                  {translateEnabled && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-start gap-3 p-4 rounded-xl"
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                      }}
                    >
                      <Sparkles className="w-4 h-4 text-white/50 shrink-0 mt-0.5" />
                      <p className="text-[13px] text-white/50 leading-relaxed">
                        {t('messages.translation.info', {
                          name: activeConversation?.other_user?.first_name || t('messages.thisUserFallback'),
                          lang: translateTarget.toUpperCase()
                        })}
                      </p>
                    </motion.div>
                  )}
                </div>

                {/* Done button */}
                <div className="p-6 pt-2">
                  <button
                    onClick={() => setShowTranslateSettings(false)}
                    className="w-full py-4 rounded-2xl font-semibold text-black text-[16px] active:scale-[0.98] transition-all"
                    style={{
                      background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.95) 0%, rgba(200, 200, 200, 0.95) 100%)',
                      boxShadow: '0 4px 20px rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    {t('messages.translation.done')}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showActions && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[101]"
                onClick={() => setShowActions(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="absolute bottom-20 left-3 z-[102] flex flex-col gap-1 w-52 p-2"
                style={{
                  background: 'linear-gradient(135deg, rgba(40, 40, 40, 0.95) 0%, rgba(30, 30, 30, 0.95) 100%)',
                  borderRadius: '20px',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  backdropFilter: 'blur(20px)'
                }}
              >
                <button
                  onClick={() => { fileInputRef.current?.click(); setShowActions(false) }}
                  className="flex items-center gap-3 px-3 py-3 rounded-2xl transition-colors w-full text-left active:bg-white/10"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(59, 130, 246, 0.2)' }}>
                    <Image className="w-5 h-5 text-blue-400" />
                  </div>
                  <span className="font-medium text-white text-[15px]">{t('messages.actions.photo')}</span>
                </button>
                <button
                  onClick={() => { fileInputRef.current?.click(); setShowActions(false) }}
                  className="flex items-center gap-3 px-3 py-3 rounded-2xl transition-colors w-full text-left active:bg-white/10"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(168, 85, 247, 0.2)' }}>
                    <Video className="w-5 h-5 text-purple-400" />
                  </div>
                  <span className="font-medium text-white text-[15px]">{t('messages.actions.video')}</span>
                </button>
                <button
                  onClick={() => { setShowGifts(true); setShowActions(false) }}
                  className="flex items-center gap-3 px-3 py-3 rounded-2xl transition-colors w-full text-left active:bg-white/10"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(236, 72, 153, 0.2)' }}>
                    <Gift className="w-5 h-5 text-pink-400" />
                  </div>
                  <span className="font-medium text-white text-[15px]">{t('messages.actions.gift')}</span>
                </button>
                <button
                  onClick={() => { setShowTip(true); setShowActions(false) }}
                  className="flex items-center gap-3 px-3 py-3 rounded-2xl transition-colors w-full text-left active:bg-white/10"
                >
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(34, 197, 94, 0.2)' }}>
                    <DollarSign className="w-5 h-5 text-green-400" />
                  </div>
                  <span className="font-medium text-white text-[15px]">{t('messages.actions.tip')}</span>
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showGifts && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[149]"
                style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)' }}
                onClick={() => setShowGifts(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: '100%' }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: '100%' }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed bottom-0 left-0 right-0 z-[150] max-h-[70vh] overflow-hidden flex flex-col"
                style={{
                  background: 'linear-gradient(to bottom, rgba(35, 35, 35, 0.98) 0%, rgba(25, 25, 25, 0.98) 100%)',
                  borderTopLeftRadius: '28px',
                  borderTopRightRadius: '28px',
                  boxShadow: '0 -4px 30px rgba(0, 0, 0, 0.5)'
                }}
              >
                {/* Handle bar */}
                <div className="flex justify-center py-3">
                  <div className="w-10 h-1 rounded-full bg-white/20" />
                </div>

                <div className="px-6 pb-4 flex justify-between items-center">
                  <h3 className="font-bold text-white text-xl">{t('messages.gift.title')}</h3>
                  <button
                    onClick={() => setShowGifts(false)}
                    className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                    style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                  >
                    <X className="w-5 h-5 text-white/70" />
                  </button>
                </div>
                <div className="px-4 pb-8 overflow-y-auto">
                  <div className="grid grid-cols-3 gap-3">
                    {gifts.map((gift) => (
                      <motion.button
                        key={gift.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleSendGift(gift)}
                        className="flex flex-col items-center p-4 rounded-2xl transition-all active:opacity-80"
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.08)'
                        }}
                      >
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center mb-2"
                          style={{ background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.3) 0%, rgba(168, 85, 247, 0.3) 100%)' }}
                        >
                          <Gift className="w-7 h-7 text-pink-400" />
                        </div>
                        <span className="text-sm font-semibold text-white mb-1">{gift.name}</span>
                        <span className="text-xs font-medium text-pink-400 px-2 py-0.5 rounded-full" style={{ background: 'rgba(236, 72, 153, 0.2)' }}>
                          {gift.price} {t('messages.tokensLabel')}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showTip && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[149]"
                style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)' }}
                onClick={() => setShowTip(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: '100%' }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: '100%' }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed bottom-0 left-0 right-0 z-[150] p-6"
                style={{
                  background: 'linear-gradient(to bottom, rgba(35, 35, 35, 0.98) 0%, rgba(25, 25, 25, 0.98) 100%)',
                  borderTopLeftRadius: '28px',
                  borderTopRightRadius: '28px',
                  boxShadow: '0 -4px 30px rgba(0, 0, 0, 0.5)'
                }}
              >
                {/* Handle bar */}
                <div className="flex justify-center pb-4 -mt-2">
                  <div className="w-10 h-1 rounded-full bg-white/20" />
                </div>

                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-bold text-white text-xl">{t('messages.tip.title')}</h3>
                  <button
                    onClick={() => setShowTip(false)}
                    className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                    style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                  >
                    <X className="w-5 h-5 text-white/70" />
                  </button>
                </div>
                <div className="flex gap-3 mb-5">
                  {[5, 10, 25, 50].map(amount => (
                    <motion.button
                      key={amount}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setTipAmount(String(amount))}
                      className="flex-1 py-3.5 rounded-xl font-bold text-[16px] transition-all"
                      style={{
                        background: tipAmount === String(amount)
                          ? 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)'
                          : 'rgba(255, 255, 255, 0.08)',
                        color: tipAmount === String(amount) ? '#fff' : 'rgba(255, 255, 255, 0.7)',
                        boxShadow: tipAmount === String(amount) ? '0 4px 15px rgba(34, 197, 94, 0.3)' : 'none'
                      }}
                    >
                      ${amount}
                    </motion.button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 font-bold text-lg">$</span>
                    <input
                      type="number"
                      value={tipAmount}
                      onChange={(e) => setTipAmount(e.target.value)}
                      placeholder={t('messages.tip.customPlaceholder')}
                      className="w-full pl-9 pr-4 py-4 rounded-xl font-semibold text-white text-lg focus:outline-none placeholder:text-white/40"
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                      }}
                    />
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleSendTip}
                    disabled={!tipAmount || sending}
                    className="px-8 py-4 rounded-xl font-bold text-lg text-white disabled:opacity-50 transition-all"
                    style={{
                      background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
                      boxShadow: '0 4px 15px rgba(34, 197, 94, 0.3)'
                    }}
                  >
                    {sending ? <Loader2 className="w-6 h-6 animate-spin" /> : t('messages.tip.send')}
                  </motion.button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Input bar - fixed to bottom to prevent floating during iOS keyboard close animation */}
        <div
          className="fixed left-0 right-0 z-20"
          style={{
            bottom: 0,
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
            background: 'linear-gradient(to top, rgba(5,5,5,0.98) 0%, rgba(5,5,5,0.95) 100%)',
            borderTop: '1px solid rgba(255,255,255,0.06)'
          }}
        >
          {/* Reply preview inside fixed container */}
          <AnimatePresence>
            {replyTo && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="px-3 py-2 flex items-center gap-3"
              >
                <div
                  className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2 rounded-xl"
                  style={{
                    background: 'rgba(59, 130, 246, 0.15)',
                    borderLeft: '3px solid #3B82F6'
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-blue-400 mb-0.5">
                      {t('messages.replyingTo', {
                        name: replyTo.sender_id === user.telegram_id
                          ? t('messages.replySelf')
                          : activeConversation?.other_user?.first_name || t('messages.userFallback')
                      })}
                    </p>
                    <p className="text-sm text-white/60 truncate">
                      {replyTo.content
                        ? replyTo.content.slice(0, 60) + (replyTo.content.length > 60 ? '...' : '')
                        : replyTo.message_type === 'image' ? t('messages.typePhoto')
                        : replyTo.message_type === 'video' ? t('messages.typeVideo')
                        : replyTo.message_type === 'voice' ? t('messages.typeVoice')
                        : replyTo.message_type === 'gift' ? t('messages.typeGift')
                        : t('messages.typeMedia')
                      }
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setReplyTo(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full transition-all active:scale-90"
                  style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                >
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input row */}
          <div
            style={{
              paddingTop: '10px',
              paddingLeft: '12px',
              paddingRight: '12px'
            }}
          >
          <div
            className="flex items-end gap-2"
            style={{
              background: 'rgba(28, 28, 30, 0.95)',
              borderRadius: '22px',
              padding: '5px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              minHeight: '52px'
            }}
          >
            <button
              onClick={() => setShowActions(!showActions)}
              className="relative w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 active:scale-90"
              style={{
                background: showActions ? '#fff' : 'rgba(255, 255, 255, 0.1)',
                transform: showActions ? 'rotate(45deg)' : 'rotate(0deg)',
                transition: 'all 0.2s ease'
              }}
            >
              <Plus className={`w-5 h-5 ${showActions ? 'text-black' : 'text-white'}`} />
              {uploadingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-[#1e1e1e] animate-pulse" />
              )}
            </button>

            <div className="flex-1 flex items-center">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                onFocus={() => {
                  // Immediately scroll to bottom when input is focused (keyboard opening)
                  if (messagesContainerRef.current) {
                    // Instant scroll
                    messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
                    // Also schedule a delayed scroll to catch iOS keyboard animation
                    setTimeout(() => {
                      if (messagesContainerRef.current) {
                        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
                      }
                    }, 100)
                    setTimeout(() => {
                      if (messagesContainerRef.current) {
                        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
                      }
                    }, 300)
                  }
                }}
                ref={inputRef}
                placeholder={t('messages.placeholder')}
                rows={1}
                className="w-full px-2 py-2 bg-transparent text-[16px] focus:outline-none text-white placeholder:text-white/40 resize-none overflow-y-auto"
                style={{
                  minHeight: '40px',
                  maxHeight: '100px',
                  lineHeight: '1.4'
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = '40px'
                  target.style.height = Math.min(target.scrollHeight, 100) + 'px'
                }}
              />
            </div>

            <div className="shrink-0 flex items-center justify-center">
              {newMessage.trim() ? (
                <motion.button
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  onTouchStart={(e) => {
                    // Fire on touch START to beat keyboard dismiss
                    e.preventDefault()
                    e.stopPropagation()
                    handleSendMessage()
                  }}
                  onMouseDown={(e) => {
                    // For desktop - fire on mousedown not click
                    e.preventDefault()
                    handleSendMessage()
                  }}
                  disabled={sending || isSendingRef.current}
                  className="w-10 h-10 rounded-full text-white flex items-center justify-center disabled:opacity-50 active:scale-90 transition-transform touch-none"
                  style={{
                    background: 'linear-gradient(135deg, #0A84FF 0%, #0066CC 100%)',
                    boxShadow: '0 2px 12px rgba(10, 132, 255, 0.4)'
                  }}
                >
                  {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </motion.button>
              ) : (
                <div className="w-10 h-10 flex items-center justify-center">
                  <VoiceRecorder onSend={handleSendVoice} disabled={sending} />
                </div>
              )}
            </div>
          </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen bg-black text-white relative pb-20"
      onClick={() => conversationMenuId && setConversationMenuId(null)}
    >
      {/* Header - Instagram DM style */}
      <div className="sticky top-0 z-40 bg-black border-b border-white/10">
        {/* Top bar with username and icons */}
        <div className="flex items-center justify-between px-4 py-3">
          <button className="flex items-center gap-1">
            <span className="text-[20px] font-semibold text-white">
              {user.username || user.first_name || 'Messages'}
            </span>
            <ChevronDown className="w-5 h-5 text-white" />
          </button>
          <button className="w-10 h-10 flex items-center justify-center">
            <Edit3 className="w-6 h-6 text-white" />
          </button>
        </div>

        {/* Stories/Notes row - only shows users with active stories */}
        <div className="overflow-x-auto pb-3">
          <div className="flex gap-4 px-4">
            {/* Your note/story - always visible */}
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className="w-16 h-16 rounded-full bg-white/5 border border-white/20 flex items-center justify-center relative">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <div className="text-white/40 text-lg font-semibold">
                    {(user.first_name || user.username || 'U')[0].toUpperCase()}
                  </div>
                )}
                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-blue-500 border-2 border-black flex items-center justify-center">
                  <Plus className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
              </div>
              <span className="text-[11px] text-white/50 font-medium">Your note</span>
            </div>
            {/* Other users' stories will appear here when implemented */}
          </div>
        </div>

        {/* Filter tabs - scrollable */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all whitespace-nowrap ${
                activeCategory === cat.id
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white/70'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content based on active tab */}
      <div className="py-2 pb-24">
        {activeCategory === 'messages' && (
          <>
            {loading ? (
              <div className="text-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-white/40 mx-auto mb-4" />
                <p className="text-white/40 text-sm">{t('messages.loading')}</p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-20 px-8">
                <div className="w-20 h-20 mx-auto rounded-full border-2 border-white/20 flex items-center justify-center mb-4">
                  <MessageCircle className="w-10 h-10 text-white/30" />
                </div>
                <p className="font-semibold text-white text-lg mb-2">{t('messages.emptyTitle')}</p>
                <p className="text-sm text-white/40">{t('messages.emptySubtitle')}</p>
              </div>
            ) : (
              <div>
                {filteredConversations.map((conv) => renderConversationCard(conv))}
              </div>
            )}
          </>
        )}

        {activeCategory === 'requests' && (
          <>
            {loading ? (
              <div className="text-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-white/40 mx-auto mb-4" />
                <p className="text-white/40 text-sm">{t('messages.loading')}</p>
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="text-center py-20 px-8">
                <div className="w-20 h-20 mx-auto rounded-full border-2 border-white/20 flex items-center justify-center mb-4">
                  <MessageCircle className="w-10 h-10 text-white/30" />
                </div>
                <p className="font-semibold text-white text-lg mb-2">No message requests</p>
                <p className="text-sm text-white/40">New messages from people you don't follow will appear here</p>
              </div>
            ) : (
              <div>
                {filteredConversations.map((conv) => renderConversationCard(conv))}
              </div>
            )}
          </>
        )}

        {activeCategory === 'notifications' && (
          <div className="text-center py-20 px-8">
            <div className="w-20 h-20 mx-auto rounded-full border-2 border-white/20 flex items-center justify-center mb-4">
              <Bell className="w-10 h-10 text-white/30" />
            </div>
            <p className="font-semibold text-white text-lg mb-2">No notifications yet</p>
            <p className="text-sm text-white/40">New followers, likes, comments and mentions will appear here</p>
          </div>
        )}

        {activeCategory === 'updates' && (
          <div className="text-center py-20 px-8">
            <div className="w-20 h-20 mx-auto rounded-full border-2 border-white/20 flex items-center justify-center mb-4">
              <Megaphone className="w-10 h-10 text-white/30" />
            </div>
            <p className="font-semibold text-white text-lg mb-2">No updates yet</p>
            <p className="text-sm text-white/40">Platform updates and announcements will appear here</p>
          </div>
        )}
      </div>
    </div>
  )
}

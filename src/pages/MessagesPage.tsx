import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Search, ArrowLeft, Send, Image, Gift, DollarSign, Lock, X, Loader2, Plus, Video, CheckCheck, AlertCircle, CornerUpLeft, Forward, Trash2, Flag, MoreHorizontal, Smile } from 'lucide-react'
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
  type Conversation,
  type Message,
  type Gift as GiftType
} from '../lib/chatApi'
import { uploadMessageMedia, uploadVoiceMessage, getMediaType } from '../lib/storage'
import VoiceRecorder from '../components/VoiceRecorder'

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
  const [messageReactions, setMessageReactions] = useState<Map<string, { emoji: string; user_id: number }[]>>(new Map())

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewUrlsRef = useRef<Set<string>>(new Set())
  const pendingMediaRef = useRef<Map<string, PendingMedia>>(new Map())
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTapRef = useRef<{ time: number; messageId: string } | null>(null)
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map())

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

    const updateKeyboardPosition = () => {
      if (!window.visualViewport) return

      // Calculate keyboard height from visualViewport
      const keyboardH = window.innerHeight - window.visualViewport.height

      if (keyboardH !== keyboardHeight) {
        setKeyboardHeight(keyboardH)

        // Scroll messages when keyboard opens
        if (keyboardH > 100) {
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ block: 'end' })
          }, 50)
        }
      }
    }

    updateKeyboardPosition()
    window.visualViewport?.addEventListener('resize', updateKeyboardPosition)
    window.visualViewport?.addEventListener('scroll', updateKeyboardPosition)

    return () => {
      window.visualViewport?.removeEventListener('resize', updateKeyboardPosition)
      window.visualViewport?.removeEventListener('scroll', updateKeyboardPosition)
    }
  }, [activeConversation, keyboardHeight])

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
          // Avoid duplicates
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

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadConversations = async () => {
    setLoading(true)
    const data = await getConversations(user.telegram_id)
    setConversations(data)
    setLoading(false)
  }

  const loadMessages = async (conversationId: string) => {
    const data = await getMessages(conversationId)
    setMessages(data)
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
        const msg = await sendMediaMessage(conversationId, user.telegram_id, voiceResult.url, 'voice')
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
        const msg = await sendMediaMessage(conversationId, user.telegram_id, mediaResult.url, payload.mediaType)
        if (msg) {
          resolveTempMessage(tempId, msg)
        } else {
          throw new Error('Failed to send media message')
        }
      }
      pendingMediaRef.current.delete(tempId)
    } catch (err) {
      console.error('[Chat] Media upload error:', err)
      resolveTempMessage(tempId, undefined, (err as Error).message)
    } finally {
      setUploadingCount(prev => Math.max(0, prev - 1))
    }
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !activeConversation || sending) return

    const text = newMessage.trim()
    const tempId = `temp-text-${Date.now()}`
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
      reply_to: replyTo,
    }

    setMessages(prev => [...prev, optimisticMessage])
    setNewMessage('')
    setReplyTo(null)
    setSending(true)

    try {
      const msg = await sendMessage(activeConversation.id, user.telegram_id, text)
      if (msg) {
        resolveTempMessage(tempId, msg)
      } else {
        resolveTempMessage(tempId, undefined, 'Failed to send message')
      }
    } catch (err) {
      console.error('[Chat] Send message error:', err)
      resolveTempMessage(tempId, undefined, 'Failed to send message')
    }
    setSending(false)
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
        const result = await sendMessage(activeConversation.id, user.telegram_id, msg.content)
        if (result) {
          resolveTempMessage(tempId, result)
        } else {
          resolveTempMessage(tempId, undefined, 'Failed to send message')
        }
      } catch (err) {
        resolveTempMessage(tempId, undefined, (err as Error).message)
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

  // Add reaction to message
  const handleAddReaction = (messageId: string, emoji: string) => {
    setMessageReactions(prev => {
      const newMap = new Map(prev)
      const reactions = newMap.get(messageId) || []
      const existingIndex = reactions.findIndex(r => r.user_id === user.telegram_id && r.emoji === emoji)

      if (existingIndex >= 0) {
        // Remove reaction
        reactions.splice(existingIndex, 1)
      } else {
        // Add reaction
        reactions.push({ emoji, user_id: user.telegram_id })
      }

      newMap.set(messageId, reactions)
      return newMap
    })
    setShowMessageMenu(false)
    setSelectedMessage(null)
  }

  // Reply to message
  const handleReply = () => {
    if (selectedMessage) {
      setReplyTo(selectedMessage)
      setShowMessageMenu(false)
      setSelectedMessage(null)
    }
  }

  // Scroll to replied message
  const scrollToMessage = (messageId: string) => {
    const element = messageRefs.current.get(messageId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      element.classList.add('bg-blue-100')
      setTimeout(() => element.classList.remove('bg-blue-100'), 1500)
    }
  }

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
      className="card p-4 flex items-center gap-4 w-full text-left hover:bg-gray-50 transition-colors"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      onClick={() => setActiveConversation(conv)}
    >
      <div className="relative">
        <img
          src={conv.other_user?.avatar_url || `https://i.pravatar.cc/150?u=${conv.other_user?.telegram_id}`}
          alt=""
          loading="lazy"
          className="w-14 h-14 rounded-full object-cover"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-semibold text-[15px]">
            {conv.other_user?.first_name || conv.other_user?.username || 'User'}
          </span>
          {conv.other_user?.is_verified && (
            <CheckCircle className="w-4 h-4 text-of-blue fill-of-blue" />
          )}
        </div>
        <p className="text-sm text-gray-500 truncate mt-0.5">
          {conv.last_message_preview || 'Start a conversation'}
        </p>
      </div>
      <div className="text-right shrink-0">
        <span className="text-xs text-gray-400">
          {formatTime(conv.last_message_at)}
        </span>
        {(conv.unread_count || 0) > 0 && (
          <div className="w-5 h-5 rounded-full bg-of-blue text-white text-xs flex items-center justify-center mt-1 ml-auto">
            {conv.unread_count}
          </div>
        )}
      </div>
    </motion.button>
  )

  // Chat view - Full screen overlay
  if (activeConversation) {
    return (
      <div
        className="fixed inset-0 z-[100] flex flex-col bg-[#F8FAFC]"
        style={{ height: '100vh' }}
      >
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Header - Sticky at top */}
        <div className="shrink-0 bg-white border-b border-gray-100 shadow-sm safe-area-top relative z-50">
          <div className="flex items-center gap-3 px-3 py-2 h-14">
            <button
              onClick={() => {
                setActiveConversation(null)
                onChatStateChange?.(false)
              }}
              className="p-1.5 hover:bg-gray-100 rounded-full transition-colors -ml-1"
            >
              <ArrowLeft className="w-5 h-5 text-gray-800" />
            </button>
            <button
              onClick={() => {
                if (activeConversation.other_user) {
                  onProfileClick?.(activeConversation.other_user)
                }
              }}
              className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-70 transition-opacity text-left cursor-pointer"
            >
              <div className="relative shrink-0">
                <img
                  src={activeConversation.other_user?.avatar_url || `https://i.pravatar.cc/150?u=${activeConversation.other_user?.telegram_id}`}
                  alt=""
                  loading="lazy"
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-[15px] text-gray-900 truncate">{activeConversation.other_user?.first_name || activeConversation.other_user?.username}</span>
                  {activeConversation.other_user?.is_verified && (
                    <CheckCircle className="w-3.5 h-3.5 text-of-blue fill-of-blue" />
                  )}
                </div>
                <p className="text-[11px] text-green-600 font-medium">Online</p>
              </div>
            </button>
          </div>
        </div>

        {/* Messages - Scrollable area */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 overscroll-none">
          {messages.map((msg, index) => {
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
                <CheckCheck className="w-3.5 h-3.5 text-blue-300" />
              ) : (
                <CheckCheck className="w-3.5 h-3.5 text-white/50" />
              )
            }

            return (
              <div
                key={msg.id}
                ref={el => { if (el) messageRefs.current.set(msg.id, el) }}
                className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} transition-colors duration-500 rounded-2xl`}
              >
                {/* Reply preview */}
                {msg.reply_to && (
                  <button
                    onClick={() => scrollToMessage(msg.reply_to!.id)}
                    className={`text-xs px-3 py-1.5 rounded-xl mb-1 max-w-[70%] truncate ${
                      isOwn ? 'bg-blue-400/30 text-blue-100 ml-auto' : 'bg-gray-200 text-gray-600'
                    }`}
                  >
                    ↩ {msg.reply_to.content?.slice(0, 30) || 'Media'}...
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
                    className={`relative max-w-[75%] px-4 py-2.5 ${
                      isOwn
                        ? 'bg-of-blue text-white rounded-[20px] rounded-br-md'
                        : 'bg-white text-gray-800 rounded-[20px] rounded-bl-md shadow-sm border border-gray-100'
                    } ${msg.message_type === 'text' || msg.message_type === 'voice' ? '' : '!p-0 !bg-transparent !shadow-none !border-0 !rounded-2xl'} ${isFailed ? 'ring-2 ring-red-300' : ''}`}
                    onTouchStart={() => handleTouchStart(msg)}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                    onClick={() => handleMessageTap(msg)}
                  >
                    {isPending && msg.message_type !== 'text' && (
                      <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center z-10">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                      </div>
                    )}

                    {/* Gift message */}
                    {msg.message_type === 'gift' && msg.gift && (
                      <div className={`text-center py-3 px-4 rounded-2xl ${isOwn ? 'bg-of-blue' : 'bg-white shadow-sm border border-gray-100'}`}>
                        <div className="w-10 h-10 mx-auto bg-gradient-to-tr from-pink-400 to-rose-500 rounded-xl flex items-center justify-center mb-2">
                          <Gift className="w-5 h-5 text-white" />
                        </div>
                        <p className={`font-semibold text-sm ${isOwn ? 'text-white' : 'text-gray-800'}`}>
                          {msg.gift.name}
                        </p>
                        <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium mt-1 ${isOwn ? 'bg-white/20 text-white' : 'bg-pink-50 text-pink-600'}`}>
                          {msg.gift.price} tokens
                        </div>
                      </div>
                    )}

                    {/* Tip message */}
                    {msg.message_type === 'tip' && (
                      <div className={`text-center py-3 px-4 rounded-2xl ${isOwn ? 'bg-of-blue' : 'bg-white shadow-sm border border-gray-100'}`}>
                        <div className="w-10 h-10 mx-auto bg-gradient-to-tr from-green-400 to-emerald-500 rounded-full flex items-center justify-center mb-2">
                          <DollarSign className="w-5 h-5 text-white" />
                        </div>
                        <p className={`font-semibold text-sm ${isOwn ? 'text-white' : 'text-gray-800'}`}>
                          Tip
                        </p>
                        <div className={`inline-block px-3 py-1 rounded-full text-sm font-semibold mt-1 ${isOwn ? 'bg-white/20 text-white' : 'bg-green-50 text-green-600'}`}>
                          ${msg.tip_amount}
                        </div>
                      </div>
                    )}

                    {/* PPV message */}
                    {msg.message_type === 'ppv' && (
                      <div className="min-w-[180px] max-w-[220px] rounded-2xl overflow-hidden bg-black">
                        {isPPVLocked ? (
                          <div className="text-center py-4 bg-black/60 backdrop-blur-sm">
                            <div className="w-10 h-10 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-2">
                              <Lock className="w-5 h-5 text-white" />
                            </div>
                            <p className="text-xs font-medium mb-2 text-white/80">Exclusive Content</p>
                            <button
                              onClick={() => handleUnlockPPV(msg.id)}
                              className="bg-white text-black px-4 py-1.5 rounded-full text-xs font-bold"
                            >
                              Unlock ${msg.ppv_price}
                            </button>
                          </div>
                        ) : (
                          <div className="rounded-2xl overflow-hidden">
                            {msg.media_url && (
                              msg.media_url.match(/\.(mp4|webm|mov)$/i) ? (
                                <video src={msg.media_url} controls className="w-full max-h-[220px] object-cover block" />
                              ) : (
                                <img src={msg.media_url} alt="" className="w-full max-h-[220px] object-cover block" />
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Image message */}
                    {msg.message_type === 'image' && resolvedMediaUrl && (
                      <div className="rounded-2xl overflow-hidden max-w-[220px]">
                        <img
                          src={resolvedMediaUrl}
                          alt=""
                          loading="lazy"
                          className="w-full max-h-[260px] object-cover block rounded-2xl"
                        />
                      </div>
                    )}

                    {/* Video message */}
                    {msg.message_type === 'video' && resolvedMediaUrl && (
                      <div className="rounded-2xl overflow-hidden max-w-[220px] bg-black">
                        <video
                          src={resolvedMediaUrl}
                          controls
                          controlsList="nodownload"
                          playsInline
                          muted
                          preload="metadata"
                          className="w-full max-h-[260px] object-contain block rounded-2xl"
                        />
                      </div>
                    )}

                    {/* Regular text */}
                    {msg.message_type === 'text' && (
                      <>
                        {msg.content?.match(/^https?:\/\/.*\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i) ? (
                          <div className="rounded-2xl overflow-hidden max-w-[220px]">
                            {msg.content.match(/\.(mp4|webm)$/i) ? (
                              <video src={msg.content} controls controlsList="nodownload" playsInline muted className="w-full max-h-[260px] object-contain block rounded-2xl bg-black" />
                            ) : (
                              <img src={msg.content} alt="" className="w-full max-h-[260px] object-cover block rounded-2xl" />
                            )}
                          </div>
                        ) : (
                          <div className="flex items-end gap-2">
                            <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{msg.content}</p>
                            <span className={`text-[10px] shrink-0 flex items-center gap-1 ${isOwn ? 'text-white/60' : 'text-gray-400'}`}>
                              {timeLabel}
                              {renderTicks()}
                            </span>
                          </div>
                        )}
                      </>
                    )}

                    {/* Voice message */}
                    {(msg.message_type === 'voice' || resolvedMediaUrl?.match(/\.(webm|ogg|mp3|wav)$/i)) && resolvedMediaUrl && (
                      <div className={`flex items-center gap-2 min-w-[140px] ${isOwn ? 'text-white' : 'text-gray-800'}`}>
                        <span className="text-lg">🎙️</span>
                        <audio src={resolvedMediaUrl} controls className="h-8 w-full accent-current opacity-90" />
                      </div>
                    )}

                    {/* Time & ticks for non-text bubbles */}
                    {msg.message_type !== 'text' && (
                      <div className={`flex items-center justify-end gap-1 mt-1 ${isOwn ? 'text-white/60' : 'text-gray-400'}`}>
                        <span className="text-[10px]">{timeLabel}</span>
                        {renderTicks()}
                      </div>
                    )}

                    {/* Reactions */}
                    {reactions.length > 0 && (
                      <div className={`absolute -bottom-3 ${isOwn ? 'right-2' : 'left-2'} flex gap-0.5 bg-white rounded-full px-1.5 py-0.5 shadow-md border border-gray-100`}>
                        {reactions.map((r, i) => (
                          <span key={i} className="text-sm">{r.emoji}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {isFailed && (
                  <button
                    onClick={() => retryFailedMessage(msg)}
                    className={`flex items-center gap-1 text-xs text-red-500 px-2 mt-1 ${isOwn ? 'justify-end' : 'justify-start'} hover:underline`}
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{msg.error || 'Failed. Tap to retry.'}</span>
                  </button>
                )}
              </div>
            )
          })}
          <div ref={messagesEndRef} className="h-6" />
        </div>

        {/* Message Action Menu */}
        <AnimatePresence>
          {showMessageMenu && selectedMessage && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/40 z-[200]"
                onClick={() => { setShowMessageMenu(false); setSelectedMessage(null) }}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-[201] safe-area-bottom overflow-hidden"
              >
                {/* Quick Reactions */}
                <div className="flex justify-center gap-3 py-4 border-b border-gray-100">
                  {QUICK_REACTIONS.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => handleAddReaction(selectedMessage.id, emoji)}
                      className="w-12 h-12 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-2xl transition-transform active:scale-90"
                    >
                      {emoji}
                    </button>
                  ))}
                  <button
                    onClick={() => {}}
                    className="w-12 h-12 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-transform active:scale-90"
                  >
                    <Smile className="w-6 h-6 text-gray-500" />
                  </button>
                </div>

                {/* Menu Options */}
                <div className="py-2">
                  <button onClick={handleReply} className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 active:bg-gray-100">
                    <CornerUpLeft className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-800">Reply</span>
                  </button>
                  <button className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 active:bg-gray-100">
                    <Smile className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-800">Add Sticker</span>
                  </button>
                  <button className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 active:bg-gray-100">
                    <Forward className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-800">Forward</span>
                  </button>
                  <button className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 active:bg-gray-100">
                    <Trash2 className="w-5 h-5 text-red-500" />
                    <span className="font-medium text-red-500">Delete</span>
                  </button>
                  <button className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 active:bg-gray-100">
                    <Flag className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-800">Report</span>
                  </button>
                  <button className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 active:bg-gray-100">
                    <MoreHorizontal className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-gray-800">More...</span>
                  </button>
                </div>

                {/* Cancel */}
                <div className="px-4 pb-4 pt-2">
                  <button
                    onClick={() => { setShowMessageMenu(false); setSelectedMessage(null) }}
                    className="w-full py-3.5 bg-gray-100 rounded-xl font-semibold text-gray-700"
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
                className="absolute bottom-20 left-4 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 z-[102] flex flex-col gap-1"
              >
                <button onClick={() => { fileInputRef.current?.click(); setShowActions(false) }} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 rounded-xl transition-colors w-full text-left">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500"><Image className="w-4 h-4" /></div>
                  <span className="font-medium text-gray-700">Photo</span>
                </button>
                <button onClick={() => { fileInputRef.current?.click(); setShowActions(false) }} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 rounded-xl transition-colors w-full text-left">
                  <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center text-purple-500"><Video className="w-4 h-4" /></div>
                  <span className="font-medium text-gray-700">Video</span>
                </button>
                <button onClick={() => { setShowGifts(true); setShowActions(false) }} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 rounded-xl transition-colors w-full text-left">
                  <div className="w-8 h-8 rounded-full bg-pink-50 flex items-center justify-center text-pink-500"><Gift className="w-4 h-4" /></div>
                  <span className="font-medium text-gray-700">Gift</span>
                </button>
                <button onClick={() => { setShowTip(true); setShowActions(false) }} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 rounded-xl transition-colors w-full text-left">
                  <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-green-500"><DollarSign className="w-4 h-4" /></div>
                  <span className="font-medium text-gray-700">Tip</span>
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
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-[150] max-h-[60vh] overflow-hidden flex flex-col"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                <h3 className="font-bold text-gray-800 text-lg">Send a Gift</h3>
                <button onClick={() => setShowGifts(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-6 overflow-y-auto">
                <div className="grid grid-cols-3 gap-4">
                  {gifts.map((gift) => (
                    <button
                      key={gift.id}
                      onClick={() => handleSendGift(gift)}
                      className="flex flex-col items-center p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:border-pink-300 hover:bg-pink-50 transition-all"
                    >
                      <div className="w-12 h-12 bg-gradient-to-br from-pink-100 to-rose-100 rounded-xl flex items-center justify-center mb-2">
                        <Gift className="w-6 h-6 text-pink-500" />
                      </div>
                      <span className="text-sm font-bold text-gray-800 mb-1">{gift.name}</span>
                      <span className="text-xs font-medium text-pink-600 bg-white px-2 py-0.5 rounded-full">
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
              className="fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-[150] p-6"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-gray-800 text-lg">Send a Tip</h3>
                <button onClick={() => setShowTip(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="flex gap-3 mb-6">
                {[5, 10, 25, 50].map(amount => (
                  <button
                    key={amount}
                    onClick={() => setTipAmount(String(amount))}
                    className={`flex-1 py-3.5 rounded-xl font-bold text-lg transition-all ${
                      tipAmount === String(amount)
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white scale-105'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    ${amount}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                  <input
                    type="number"
                    value={tipAmount}
                    onChange={(e) => setTipAmount(e.target.value)}
                    placeholder="Custom"
                    className="w-full pl-8 pr-4 py-3.5 rounded-xl bg-gray-100 font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <button
                  onClick={handleSendTip}
                  disabled={!tipAmount || sending}
                  className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold disabled:opacity-50"
                >
                  {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send'}
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
              className="shrink-0 bg-gray-100 border-t border-gray-200 px-4 py-2 flex items-center gap-3"
            >
              <div className="w-1 h-10 bg-of-blue rounded-full" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-of-blue">Replying to</p>
                <p className="text-sm text-gray-600 truncate">{replyTo.content?.slice(0, 50) || 'Media'}</p>
              </div>
              <button onClick={() => setReplyTo(null)} className="p-1.5 hover:bg-gray-200 rounded-full">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input */}
        <div
          className="shrink-0 bg-white border-t border-gray-100 px-3 py-2"
          style={{ paddingBottom: keyboardHeight > 0 ? `${keyboardHeight}px` : 'max(8px, env(safe-area-inset-bottom))' }}
        >
          <div className="bg-gray-100 rounded-full p-1.5 flex items-end gap-2">
            <button
              onClick={() => setShowActions(!showActions)}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 ${showActions ? 'bg-gray-300 rotate-45' : 'bg-white hover:bg-gray-200'}`}
            >
              <Plus className="w-5 h-5 text-gray-600" />
              {uploadingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-of-blue border-2 border-white animate-pulse" />
              )}
            </button>

            <div className="flex-1 py-1">
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
                  // Scroll to bottom instantly when focused
                  requestAnimationFrame(() => {
                    messagesEndRef.current?.scrollIntoView({ block: 'end' })
                  })
                }}
                placeholder="Message..."
                rows={1}
                className="w-full px-2 py-1 bg-transparent text-[15px] focus:outline-none text-gray-800 placeholder:text-gray-400 resize-none max-h-24"
                style={{ minHeight: '24px' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height = Math.min(target.scrollHeight, 96) + 'px'
                }}
              />
            </div>

            <div className="shrink-0 flex items-center justify-center">
              {newMessage.trim() ? (
                <button
                  onClick={handleSendMessage}
                  disabled={sending}
                  className="w-10 h-10 bg-of-blue rounded-full text-white flex items-center justify-center disabled:opacity-50"
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
    <div className="min-h-full bg-white">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 pt-4 pb-3">
        <h2 className="text-2xl font-bold mb-4">Messages</h2>

        {/* Category Tabs */}
        <div className="flex gap-2 mb-4">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                activeCategory === cat.id
                  ? 'bg-black text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            className="w-full pl-11 pr-4 py-3 rounded-xl bg-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-of-blue"
          />
        </div>
      </div>

      {/* Conversations */}
      <div className="px-4 py-2">
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-of-blue" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="font-medium">No messages</p>
            <p className="text-sm mt-1">Start a conversation from a creator's profile</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredConversations.map((conv) => renderConversationCard(conv))}
          </div>
        )}
      </div>
    </div>
  )
}

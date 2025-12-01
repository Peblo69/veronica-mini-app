import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Search, ArrowLeft, Send, Image, Gift, DollarSign, Lock, X, Loader2, Plus, Video, CheckCheck } from 'lucide-react'
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

interface MessagesPageProps {
  user: User
  selectedConversationId?: string | null
  onConversationOpened?: () => void
  onChatStateChange?: (isOpen: boolean) => void
  onProfileClick?: (user: User) => void
}

export default function MessagesPage({ user, selectedConversationId, onConversationOpened, onChatStateChange, onProfileClick }: MessagesPageProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showActions, setShowActions] = useState(false)
  const [showGifts, setShowGifts] = useState(false)
  const [showTip, setShowTip] = useState(false)
  const [tipAmount, setTipAmount] = useState('')
  const [gifts, setGifts] = useState<GiftType[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [viewportHeight, setViewportHeight] = useState('100dvh')

  // iOS viewport height fix
  useEffect(() => {
    if (activeConversation) {
      const updateHeight = () => {
        if (window.visualViewport) {
          setViewportHeight(`${window.visualViewport.height}px`)
        } else {
          setViewportHeight(`${window.innerHeight}px`)
        }
      }
      
      updateHeight()
      window.visualViewport?.addEventListener('resize', updateHeight)
      window.addEventListener('resize', updateHeight)
      
      return () => {
        window.visualViewport?.removeEventListener('resize', updateHeight)
        window.removeEventListener('resize', updateHeight)
      }
    }
  }, [activeConversation])

  // Load conversations
  useEffect(() => {
    loadConversations()
    loadGifts()
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

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !activeConversation || sending) return

    setSending(true)
    const msg = await sendMessage(activeConversation.id, user.telegram_id, newMessage.trim())
    if (msg) {
      setMessages(prev => [...prev, msg])
      setNewMessage('')
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
      // Refresh messages to show unlocked content
      loadMessages(activeConversation!.id)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !activeConversation) {
      console.log('[Chat] No file or conversation:', { file: !!file, conv: !!activeConversation })
      return
    }

    const mediaType = getMediaType(file)
    console.log('[Chat] File selected:', { name: file.name, type: file.type, size: file.size, mediaType })

    if (mediaType === 'unknown' || mediaType === 'audio') {
      console.log('[Chat] Invalid media type:', mediaType)
      alert('Please select an image or video file')
      return
    }

    setSending(true)

    try {
      console.log('[Chat] Starting upload to messages bucket...')
      const result = await uploadMessageMedia(file, user.telegram_id)
      console.log('[Chat] Upload result:', result)

      if (result.error) {
        console.error('[Chat] Upload error:', result.error)
        alert('Upload failed: ' + result.error)
      } else if (result.url) {
        console.log('[Chat] Upload success, sending message with URL:', result.url)
        const msg = await sendMediaMessage(activeConversation.id, user.telegram_id, result.url, mediaType)
        console.log('[Chat] Message created:', msg)

        if (msg) {
          setMessages(prev => [...prev, msg])
        } else {
          console.error('[Chat] Failed to create message')
          alert('Failed to send media message')
        }
      } else {
        console.error('[Chat] No URL returned from upload')
        alert('Upload completed but no URL returned')
      }
    } catch (err) {
      console.error('[Chat] Exception during upload:', err)
      alert('Upload error: ' + (err as Error).message)
    }

    setSending(false)
    e.target.value = ''
  }

  const handleSendVoice = async (blob: Blob, duration: number) => {
    if (!activeConversation) return

    const result = await uploadVoiceMessage(blob, user.telegram_id, duration)

    if (result.error) {
      alert('Voice upload failed: ' + result.error)
    } else if (result.url) {
      const msg = await sendMediaMessage(activeConversation.id, user.telegram_id, result.url, 'voice')
      if (msg) {
        setMessages(prev => [...prev, msg])
      }
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

  const filteredConversations = conversations.filter(c =>
    c.other_user?.username?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.other_user?.first_name?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Chat view - Full screen overlay
    if (activeConversation) {
    return (
      <div 
        className="fixed inset-0 z-[100] flex flex-col bg-[#F8FAFC] overflow-hidden"
        style={{ height: viewportHeight }}
      >
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Header - Sticky at top */}
        <div className="shrink-0 bg-white border-b border-gray-100 shadow-sm safe-area-top relative z-50">
          <div className="flex items-center gap-3 px-3 py-2 h-14">
            <button 
              onClick={(e) => { 
                e.stopPropagation();
                setActiveConversation(null); 
                onChatStateChange?.(false); 
              }} 
              className="p-1.5 hover:bg-gray-100 rounded-full transition-colors -ml-1 relative z-10"
            >
              <ArrowLeft className="w-5 h-5 text-gray-800" />
            </button>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                if (activeConversation.other_user) {
                  onProfileClick?.(activeConversation.other_user);
                }
              }}
              className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-70 transition-opacity text-left relative z-10 cursor-pointer"
            >
              <div className="relative shrink-0">
                <img
                  src={activeConversation.other_user?.avatar_url || `https://i.pravatar.cc/150?u=${activeConversation.other_user?.telegram_id}`}
                  alt=""
                  className="w-9 h-9 rounded-full object-cover"
                />
                {/* Online indicator */}
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
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 overscroll-none">
          {messages.map((msg, index) => {
            const isOwn = msg.sender_id === user.telegram_id
            const isPPVLocked = msg.is_ppv && !msg.ppv_unlocked_by?.includes(user.telegram_id) && !isOwn
            const showAvatar = !isOwn && (index === messages.length - 1 || messages[index + 1]?.sender_id !== msg.sender_id)

            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className={`flex items-end gap-1.5 ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                {!isOwn && (
                  <div className="w-6 flex-shrink-0 pb-0.5">
                    {showAvatar && (
                      <img
                        src={activeConversation.other_user?.avatar_url || `https://i.pravatar.cc/150?u=${activeConversation.other_user?.telegram_id}`}
                        alt=""
                        className="w-6 h-6 rounded-full object-cover"
                      />
                    )}
                  </div>
                )}

                <div
                  className={`max-w-[78%] px-3 py-1.5 relative group ${
                    isOwn
                      ? 'bg-of-blue text-white rounded-2xl rounded-br-sm'
                      : 'bg-white text-gray-800 rounded-2xl rounded-bl-sm shadow-sm'
                  } ${msg.message_type === 'text' || msg.message_type === 'voice' ? '' : '!p-0 !bg-transparent !shadow-none !rounded-xl overflow-hidden'}`}
                >
                  {/* Gift message */}
                  {msg.message_type === 'gift' && msg.gift && (
                    <div className={`text-center py-2 px-3 rounded-2xl ${isOwn ? 'bg-of-blue' : 'bg-white shadow-sm'}`}>
                      <div className="w-8 h-8 mx-auto bg-gradient-to-tr from-pink-400 to-rose-500 rounded-lg flex items-center justify-center mb-1">
                        <Gift className="w-4 h-4 text-white" />
                      </div>
                      <p className={`font-semibold text-xs ${isOwn ? 'text-white' : 'text-gray-800'}`}>
                        {msg.gift.name}
                      </p>
                      <div className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium mt-0.5 ${isOwn ? 'bg-white/20 text-white' : 'bg-pink-50 text-pink-600'}`}>
                        {msg.gift.price} tokens
                      </div>
                    </div>
                  )}

                  {/* Tip message */}
                  {msg.message_type === 'tip' && (
                    <div className={`text-center py-2 px-3 rounded-2xl ${isOwn ? 'bg-of-blue' : 'bg-white shadow-sm'}`}>
                      <div className="w-8 h-8 mx-auto bg-gradient-to-tr from-green-400 to-emerald-500 rounded-full flex items-center justify-center mb-1">
                        <DollarSign className="w-4 h-4 text-white" />
                      </div>
                      <p className={`font-semibold text-xs ${isOwn ? 'text-white' : 'text-gray-800'}`}>
                        Tip
                      </p>
                      <div className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-0.5 ${isOwn ? 'bg-white/20 text-white' : 'bg-green-50 text-green-600'}`}>
                        ${msg.tip_amount}
                      </div>
                    </div>
                  )}

                  {/* PPV message */}
                  {msg.message_type === 'ppv' && (
                    <div className="min-w-[160px] max-w-[200px] rounded-xl overflow-hidden bg-black">
                      {isPPVLocked ? (
                        <div className="text-center py-3 bg-black/60 backdrop-blur-sm">
                          <div className="w-8 h-8 mx-auto bg-white/20 rounded-full flex items-center justify-center mb-1.5">
                            <Lock className="w-4 h-4 text-white" />
                          </div>
                          <p className="text-[10px] font-medium mb-1.5 text-white/80">Exclusive</p>
                          <button
                            onClick={() => handleUnlockPPV(msg.id)}
                            className="bg-white text-black px-3 py-1 rounded-full text-[10px] font-bold"
                          >
                            Unlock ${msg.ppv_price}
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-xl overflow-hidden">
                          {msg.media_url && (
                            msg.media_url.match(/\.(mp4|webm|mov)$/i) ? (
                              <video src={msg.media_url} controls className="w-full max-h-[200px] object-cover block" />
                            ) : (
                              <img src={msg.media_url} alt="" className="w-full max-h-[200px] object-cover block" />
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Image message */}
                  {msg.message_type === 'image' && msg.media_url && (
                    <div className="rounded-xl overflow-hidden max-w-[200px]">
                      <img
                        src={msg.media_url}
                        alt=""
                        className="w-full max-h-[240px] object-cover block rounded-xl"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.onerror = null;
                          target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120"><rect fill="%231f2937" width="160" height="120" rx="12"/><text fill="%236b7280" font-size="10" x="50%" y="50%" text-anchor="middle" dy=".3em">Failed</text></svg>';
                        }}
                      />
                    </div>
                  )}

                  {/* Video message */}
                  {msg.message_type === 'video' && msg.media_url && (
                    <div className="rounded-xl overflow-hidden max-w-[200px] bg-black">
                      <video
                        src={msg.media_url}
                        controls
                        controlsList="nodownload"
                        playsInline
                        muted
                        preload="metadata"
                        className="w-full max-h-[240px] object-contain block rounded-xl"
                        onError={(e) => {
                          const target = e.target as HTMLVideoElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent && !parent.querySelector('.video-error')) {
                            const errorDiv = document.createElement('div');
                            errorDiv.className = 'video-error flex items-center justify-center h-[120px] text-gray-400 text-xs bg-gray-900 rounded-xl';
                            errorDiv.textContent = 'Video unavailable';
                            parent.appendChild(errorDiv);
                          }
                        }}
                      />
                    </div>
                  )}

                  {/* Regular text/media */}
                  {msg.message_type === 'text' && (
                    <>
                      {msg.content?.match(/^https?:\/\/.*\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i) ? (
                        <div className="rounded-xl overflow-hidden max-w-[200px]">
                          {msg.content.match(/\.(mp4|webm)$/i) ? (
                            <video src={msg.content} controls controlsList="nodownload" playsInline muted className="w-full max-h-[240px] object-contain block rounded-xl bg-black" />
                          ) : (
                            <img src={msg.content} alt="" className="w-full max-h-[240px] object-cover block rounded-xl" />
                          )}
                        </div>
                      ) : (
                        <div className="flex items-end gap-1">
                          <p className="text-[14px] leading-tight whitespace-pre-wrap">{msg.content}</p>
                          <span className={`text-[10px] shrink-0 flex items-center gap-0.5 ${isOwn ? 'text-white/60' : 'text-gray-400'}`}>
                            {formatTime(msg.created_at)}
                            {isOwn && (
                              msg.is_read ? (
                                <CheckCheck className="w-3.5 h-3.5 text-blue-300" />
                              ) : (
                                <CheckCheck className="w-3.5 h-3.5 opacity-60" />
                              )
                            )}
                          </span>
                        </div>
                      )}
                    </>
                  )}

                  {/* Voice message */}
                  {(msg.message_type === 'voice' || msg.media_url?.match(/\.(webm|ogg|mp3|wav)$/i)) && msg.media_url && (
                    <div className={`flex items-center gap-1.5 min-w-[120px] ${isOwn ? 'text-white' : 'text-gray-800'}`}>
                      <span className="text-sm">🎤</span>
                      <audio src={msg.media_url} controls className="h-7 w-full accent-current opacity-90 scale-[0.85] origin-left" />
                    </div>
                  )}

                  {/* Time & ticks for non-text bubbles */}
                  {msg.message_type !== 'text' && (
                    <div className={`flex items-center justify-end gap-0.5 mt-0.5 ${isOwn ? 'text-white/60' : 'text-gray-400'}`}>
                      <span className="text-[10px]">{formatTime(msg.created_at)}</span>
                      {isOwn && (
                        msg.is_read ? (
                          <CheckCheck className="w-3.5 h-3.5 text-blue-300" />
                        ) : (
                          <CheckCheck className="w-3.5 h-3.5 opacity-60" />
                        )
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })}
          <div ref={messagesEndRef} className="h-4" />
        </div>

        {/* Actions Menu */}
        <AnimatePresence>
          {showActions && (
            <>
            <div className="absolute inset-0 z-[101]" onClick={() => setShowActions(false)} />
            <motion.div
               initial={{ opacity: 0, scale: 0.9, y: 10 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.9, y: 10 }}
               className="absolute bottom-20 left-4 bg-white rounded-xl shadow-lg border border-gray-100 p-1 z-[102] flex flex-col gap-0.5"
            >
              <button onClick={() => { fileInputRef.current?.click(); setShowActions(false); }} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors w-full text-left">
                <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center text-blue-500"><Image className="w-3 h-3" /></div>
                <span className="font-medium text-gray-700 text-xs">Photo</span>
              </button>
              <button onClick={() => { fileInputRef.current?.click(); setShowActions(false); }} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors w-full text-left">
                <div className="w-6 h-6 rounded-full bg-purple-50 flex items-center justify-center text-purple-500"><Video className="w-3 h-3" /></div>
                <span className="font-medium text-gray-700 text-xs">Video</span>
              </button>
              <button onClick={() => { setShowGifts(true); setShowActions(false); }} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors w-full text-left">
                <div className="w-6 h-6 rounded-full bg-pink-50 flex items-center justify-center text-pink-500"><Gift className="w-3 h-3" /></div>
                <span className="font-medium text-gray-700 text-xs">Gift</span>
              </button>
              <button onClick={() => { setShowTip(true); setShowActions(false); }} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors w-full text-left">
                <div className="w-6 h-6 rounded-full bg-green-50 flex items-center justify-center text-green-500"><DollarSign className="w-3 h-3" /></div>
                <span className="font-medium text-gray-700 text-xs">Tip</span>
              </button>
            </motion.div>
            </>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showGifts && (
            <motion.div
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl rounded-t-[2rem] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t border-white/50 z-[100] max-h-[60vh] overflow-hidden flex flex-col"
            >
              <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white/50">
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
                      className="flex flex-col items-center p-4 rounded-2xl bg-gray-50 border border-gray-100 hover:border-pink-300 hover:bg-pink-50 hover:shadow-md transition-all group relative overflow-hidden"
                    >
                      <div className="w-12 h-12 bg-gradient-to-br from-pink-100 to-rose-100 rounded-xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform shadow-inner">
                         <Gift className="w-6 h-6 text-pink-500" />
                      </div>
                      <span className="text-sm font-bold text-gray-800 mb-1">{gift.name}</span>
                      <span className="text-xs font-medium text-pink-600 bg-white px-2 py-0.5 rounded-full shadow-sm border border-pink-100">
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
              className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl rounded-t-[2rem] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border-t border-white/50 z-[100] p-6"
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
                    className={`flex-1 py-3 rounded-xl font-bold text-lg transition-all shadow-sm border ${
                      tipAmount === String(amount) 
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white border-transparent shadow-green-500/30 scale-105' 
                        : 'bg-white text-gray-700 border-gray-200 hover:border-green-500 hover:text-green-600'
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
                    placeholder="Custom amount"
                    className="w-full pl-8 pr-4 py-3.5 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 font-bold text-gray-800"
                  />
                </div>
                <button
                  onClick={handleSendTip}
                  disabled={!tipAmount || sending}
                  className="px-8 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Tip'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input - At bottom of flex container */}
        <div className="shrink-0 bg-[#F8FAFC] border-t border-gray-100 px-3 py-2 pb-[max(8px,env(safe-area-inset-bottom))]">
          <div className="bg-white rounded-full p-1 flex items-end gap-1.5 shadow-sm border border-gray-100">
            <button
              onClick={() => setShowActions(!showActions)}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 ${showActions ? 'bg-gray-200 rotate-45' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`}
            >
              <Plus className="w-5 h-5" />
            </button>

            <div className="flex-1 py-1">
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder="Message..."
                rows={1}
                className="w-full px-1 py-0.5 bg-transparent text-[15px] focus:outline-none text-gray-800 placeholder:text-gray-400 resize-none max-h-20"
                style={{ minHeight: '22px' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = Math.min(target.scrollHeight, 80) + 'px';
                }}
              />
            </div>

            <div className="shrink-0 flex items-center justify-center">
              {newMessage.trim() ? (
                <button
                  onClick={handleSendMessage}
                  disabled={sending}
                  className="w-9 h-9 bg-of-blue rounded-full text-white flex items-center justify-center disabled:opacity-50"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 ml-0.5" />
                  )}
                </button>
              ) : (
                <div className="w-9 h-9 flex items-center justify-center">
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
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">Messages</h2>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search messages..."
          className="w-full pl-10 pr-4 py-2.5 rounded-full bg-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-of-blue"
        />
      </div>

      {loading ? (
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-of-blue" />
        </div>
      ) : filteredConversations.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>No messages yet</p>
          <p className="text-sm mt-1">Start a conversation from a creator's profile</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredConversations.map((conv, index) => (
            <motion.button
              key={conv.id}
              className="card p-3 flex items-center gap-3 w-full text-left"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => setActiveConversation(conv)}
            >
              <div className="relative">
                <img
                  src={conv.other_user?.avatar_url || `https://i.pravatar.cc/150?u=${conv.other_user?.telegram_id}`}
                  alt=""
                  className="w-14 h-14 rounded-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-semibold">
                    {conv.other_user?.first_name || conv.other_user?.username || 'User'}
                  </span>
                  {conv.other_user?.is_verified && (
                    <CheckCircle className="w-4 h-4 text-of-blue fill-of-blue" />
                  )}
                </div>
                <p className="text-sm text-gray-500 truncate">
                  {conv.last_message_preview || 'Start a conversation'}
                </p>
              </div>
              <div className="text-right">
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
          ))}
        </div>
      )}
    </div>
  )
}

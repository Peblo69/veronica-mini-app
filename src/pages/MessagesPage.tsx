import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Search, ArrowLeft, Send, Image, Gift, DollarSign, Lock, X, Loader2 } from 'lucide-react'
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
}

export default function MessagesPage({ user, selectedConversationId, onConversationOpened }: MessagesPageProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showGifts, setShowGifts] = useState(false)
  const [showTip, setShowTip] = useState(false)
  const [tipAmount, setTipAmount] = useState('')
  const [gifts, setGifts] = useState<GiftType[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    if (!file || !activeConversation) return

    const mediaType = getMediaType(file)
    if (mediaType === 'unknown') return

    setSending(true)
    const result = await uploadMessageMedia(file, user.telegram_id)

    if (result.error) {
      alert('Upload failed: ' + result.error)
    } else if (result.url) {
      const msg = await sendMessage(activeConversation.id, user.telegram_id, result.url)
      if (msg) {
        setMessages(prev => [...prev, msg])
      }
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

  // Chat view
  if (activeConversation) {
    return (
      <div className="flex flex-col h-[calc(100vh-120px)]">
        {/* Hidden file input */}
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b bg-white">
          <button onClick={() => setActiveConversation(null)}>
            <ArrowLeft className="w-6 h-6" />
          </button>
          <img
            src={activeConversation.other_user?.avatar_url || `https://i.pravatar.cc/150?u=${activeConversation.other_user?.telegram_id}`}
            alt=""
            className="w-10 h-10 rounded-full object-cover"
          />
          <div className="flex-1">
            <div className="flex items-center gap-1">
              <span className="font-semibold">{activeConversation.other_user?.first_name || activeConversation.other_user?.username}</span>
              {activeConversation.other_user?.is_verified && (
                <CheckCircle className="w-4 h-4 text-of-blue fill-of-blue" />
              )}
            </div>
            <p className="text-xs text-gray-500">
              {activeConversation.other_user?.is_creator ? 'Creator' : 'User'}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {messages.map((msg) => {
            const isOwn = msg.sender_id === user.telegram_id
            const isPPVLocked = msg.is_ppv && !msg.ppv_unlocked_by?.includes(user.telegram_id) && !isOwn

            return (
              <div
                key={msg.id}
                className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                    isOwn
                      ? 'bg-of-blue text-white rounded-br-sm'
                      : 'bg-white text-gray-800 rounded-bl-sm shadow-sm'
                  }`}
                >
                  {/* Gift message */}
                  {msg.message_type === 'gift' && msg.gift && (
                    <div className="text-center py-2">
                      <div className="text-3xl mb-1">🎁</div>
                      <p className={`font-medium ${isOwn ? 'text-white' : 'text-gray-800'}`}>
                        {msg.gift.name}
                      </p>
                      <p className={`text-xs ${isOwn ? 'text-blue-100' : 'text-gray-500'}`}>
                        {msg.gift.price} tokens
                      </p>
                    </div>
                  )}

                  {/* Tip message */}
                  {msg.message_type === 'tip' && (
                    <div className="text-center py-2">
                      <div className="text-3xl mb-1">💰</div>
                      <p className={`font-medium ${isOwn ? 'text-white' : 'text-gray-800'}`}>
                        Tip: ${msg.tip_amount}
                      </p>
                    </div>
                  )}

                  {/* PPV message */}
                  {msg.message_type === 'ppv' && (
                    <div>
                      {isPPVLocked ? (
                        <div className="text-center py-4">
                          <Lock className="w-8 h-8 mx-auto mb-2 opacity-70" />
                          <p className="text-sm mb-2">Exclusive Content</p>
                          <button
                            onClick={() => handleUnlockPPV(msg.id)}
                            className="bg-white text-of-blue px-4 py-1.5 rounded-full text-sm font-medium"
                          >
                            Unlock for ${msg.ppv_price}
                          </button>
                        </div>
                      ) : (
                        <div>
                          {msg.media_url && (
                            msg.media_url.match(/\.(mp4|webm|mov)$/i) ? (
                              <video src={msg.media_url} controls className="rounded-lg max-w-full" />
                            ) : (
                              <img src={msg.media_url} alt="" className="rounded-lg max-w-full" />
                            )
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Regular text/media */}
                  {msg.message_type === 'text' && (
                    <>
                      {msg.content?.match(/^https?:\/\/.*\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i) ? (
                        msg.content.match(/\.(mp4|webm)$/i) ? (
                          <video src={msg.content} controls className="rounded-lg max-w-full" />
                        ) : (
                          <img src={msg.content} alt="" className="rounded-lg max-w-full" />
                        )
                      ) : (
                        <p className="text-sm">{msg.content}</p>
                      )}
                    </>
                  )}

                  {/* Voice message */}
                  {(msg.message_type === 'voice' || msg.media_url?.match(/\.(webm|ogg|mp3|wav)$/i)) && msg.media_url && (
                    <div className="flex items-center gap-2 min-w-[150px]">
                      <audio src={msg.media_url} controls className="h-8 max-w-[200px]" />
                    </div>
                  )}

                  <p className={`text-[10px] mt-1 ${isOwn ? 'text-blue-100' : 'text-gray-400'}`}>
                    {formatTime(msg.created_at)}
                  </p>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Gift picker modal */}
        <AnimatePresence>
          {showGifts && (
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="absolute bottom-20 left-0 right-0 bg-white rounded-t-3xl shadow-2xl p-4 max-h-[50vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold">Send a Gift</h3>
                <button onClick={() => setShowGifts(false)}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {gifts.map((gift) => (
                  <button
                    key={gift.id}
                    onClick={() => handleSendGift(gift)}
                    className="flex flex-col items-center p-3 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <div className="text-3xl mb-1">🎁</div>
                    <span className="text-xs font-medium">{gift.name}</span>
                    <span className="text-[10px] text-gray-500">{gift.price}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tip modal */}
        <AnimatePresence>
          {showTip && (
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 100 }}
              className="absolute bottom-20 left-0 right-0 bg-white rounded-t-3xl shadow-2xl p-4"
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold">Send a Tip</h3>
                <button onClick={() => setShowTip(false)}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex gap-2 mb-4">
                {[5, 10, 25, 50].map(amount => (
                  <button
                    key={amount}
                    onClick={() => setTipAmount(String(amount))}
                    className={`flex-1 py-2 rounded-lg font-medium ${
                      tipAmount === String(amount) ? 'bg-of-blue text-white' : 'bg-gray-100'
                    }`}
                  >
                    ${amount}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  placeholder="Custom amount"
                  className="flex-1 px-4 py-2 rounded-lg border focus:outline-none focus:border-of-blue"
                />
                <button
                  onClick={handleSendTip}
                  disabled={!tipAmount || sending}
                  className="btn-subscribe px-6"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input */}
        <div className="p-3 bg-white border-t">
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 hover:bg-gray-100 rounded-full"
            >
              <Image className="w-5 h-5 text-gray-500" />
            </button>
            <button
              onClick={() => setShowGifts(true)}
              className="p-2 hover:bg-gray-100 rounded-full"
            >
              <Gift className="w-5 h-5 text-gray-500" />
            </button>
            <button
              onClick={() => setShowTip(true)}
              className="p-2 hover:bg-gray-100 rounded-full"
            >
              <DollarSign className="w-5 h-5 text-gray-500" />
            </button>
            <VoiceRecorder onSend={handleSendVoice} disabled={sending} />
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Message..."
              className="flex-1 px-4 py-2 rounded-full bg-gray-100 text-sm focus:outline-none"
            />
            <button
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || sending}
              className="p-2 bg-of-blue rounded-full text-white disabled:opacity-50"
            >
              {sending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
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

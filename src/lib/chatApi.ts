import { supabase } from './supabase'
import type { User } from './api'

// ============================================
// CHAT TYPES
// ============================================

export interface Conversation {
  id: string
  participant_1: number
  participant_2: number
  last_message_at: string
  last_message_preview: string
  participant_1_unread: number
  participant_2_unread: number
  created_at: string
  // Joined data
  other_user?: User
  unread_count?: number
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: number
  content: string | null
  message_type: 'text' | 'image' | 'video' | 'voice' | 'gift' | 'tip' | 'ppv'
  media_url: string | null
  media_thumbnail: string | null
  is_ppv: boolean
  ppv_price: number
  ppv_unlocked_by: number[]
  gift_id: string | null
  tip_amount: number | null
  is_read: boolean
  is_deleted: boolean
  created_at: string
  client_message_id?: string | null
  reply_to_id?: string | null
  // Joined data
  sender?: User
  gift?: Gift
  reply_to?: Message | null
}

export interface Gift {
  id: string
  name: string
  description: string
  price: number
  animation_url: string | null
  image_url: string | null
  category: string
  is_animated: boolean
}

async function ensureMessagingAllowed(conversationId: string, senderId: number): Promise<void> {
  const { data: conversation } = await supabase
    .from('conversations')
    .select('participant_1, participant_2')
    .eq('id', conversationId)
    .single()

  if (!conversation) return

  const receiverId =
    conversation.participant_1 === senderId ? conversation.participant_2 : conversation.participant_1

  if (!receiverId || receiverId === senderId) {
    return
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('allow_messages_from')
    .eq('user_id', receiverId)
    .single()

  const preference = (settings?.allow_messages_from || 'everyone') as
    | 'everyone'
    | 'followers'
    | 'subscribers'
    | 'nobody'

  let allowed = true
  if (preference === 'nobody') {
    allowed = false
  } else if (preference === 'followers') {
    const { data } = await supabase
      .from('follows')
      .select('id')
      .eq('follower_id', senderId)
      .eq('following_id', receiverId)
      .limit(1)
    allowed = Boolean(data && data.length)
  } else if (preference === 'subscribers') {
    const { data } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('subscriber_id', senderId)
      .eq('creator_id', receiverId)
      .eq('is_active', true)
      .limit(1)
    allowed = Boolean(data && data.length)
  }

  if (!allowed) {
    let reason = 'This user is not accepting new messages.'
    if (preference === 'followers') {
      reason = 'This user only allows messages from followers.'
    } else if (preference === 'subscribers') {
      reason = 'This user only allows messages from subscribers.'
    }
    throw new Error(reason)
  }
}

// ============================================
// CONVERSATIONS API
// ============================================

// Get all conversations for a user
export async function getConversations(userId: number): Promise<Conversation[]> {
  const { data } = await supabase
    .from('conversations')
    .select('*')
    .or(`participant_1.eq.${userId},participant_2.eq.${userId}`)
    .order('last_message_at', { ascending: false })

  if (!data) return []

  // Get other user details for each conversation
  const otherUserIds = data.map(c =>
    c.participant_1 === userId ? c.participant_2 : c.participant_1
  )

  const { data: users } = await supabase
    .from('users')
    .select('*')
    .in('telegram_id', otherUserIds)

  const usersMap = new Map(users?.map(u => [u.telegram_id, u]) || [])

  return data.map(conv => ({
    ...conv,
    other_user: usersMap.get(
      conv.participant_1 === userId ? conv.participant_2 : conv.participant_1
    ),
    unread_count: conv.participant_1 === userId
      ? conv.participant_1_unread
      : conv.participant_2_unread
  }))
}

// Get or create conversation between two users
export async function getOrCreateConversation(userId1: number, userId2: number): Promise<Conversation | null> {
  // Ensure consistent ordering
  const [p1, p2] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1]

  // Check existing
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('participant_1', p1)
    .eq('participant_2', p2)
    .single()

  if (existing) return existing

  // Create new
  const { data: newConv } = await supabase
    .from('conversations')
    .insert({
      participant_1: p1,
      participant_2: p2
    })
    .select()
    .single()

  return newConv
}

// ============================================
// MESSAGES API
// ============================================

// Get messages for a conversation
export async function getMessages(conversationId: string, limit = 50): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*, sender:users!sender_id(*), gift:gifts(*)')
    .eq('conversation_id', conversationId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[getMessages] Error:', error)
    return []
  }

  if (!data) return []

  const messages = data.reverse() as Message[]
  console.log('[getMessages] Loaded', messages.length, 'messages')

  // Fetch reply_to messages for any messages that have reply_to_id
  const replyToIds = messages
    .filter(m => m.reply_to_id)
    .map(m => m.reply_to_id as string)

  console.log('[getMessages] Messages with reply_to_id:', replyToIds.length)

  if (replyToIds.length > 0) {
    const { data: replyMessages, error: replyError } = await supabase
      .from('messages')
      .select('*, sender:users!sender_id(*)')
      .in('id', replyToIds)

    if (replyError) {
      console.error('[getMessages] Reply fetch error:', replyError)
    }

    if (replyMessages) {
      console.log('[getMessages] Fetched', replyMessages.length, 'reply messages')
      const replyMap = new Map(replyMessages.map(m => [m.id, m]))
      for (const msg of messages) {
        if (msg.reply_to_id) {
          msg.reply_to = replyMap.get(msg.reply_to_id) as Message | undefined
          console.log('[getMessages] Set reply_to for message', msg.id, ':', msg.reply_to?.content?.slice(0, 20))
        }
      }
    }
  }

  return messages
}

// Send a text message
export async function sendMessage(
  conversationId: string,
  senderId: number,
  content: string,
  clientMessageId?: string,
  replyToId?: string
): Promise<Message | null> {
  await ensureMessagingAllowed(conversationId, senderId)

  const insertData: Record<string, unknown> = {
    conversation_id: conversationId,
    sender_id: senderId,
    client_message_id: clientMessageId,
    content,
    message_type: 'text'
  }

  // Only add reply_to_id if provided
  if (replyToId) {
    insertData.reply_to_id = replyToId
  }

  const { data, error } = await supabase
    .from('messages')
    .insert(insertData)
    .select('*, sender:users!sender_id(*)')
    .single()

  if (error) {
    console.error('Send message error:', error)
    return null
  }

  await updateConversationLastMessage(conversationId, senderId, content)

  return data as Message
}

// Send media message
export async function sendMediaMessage(
  conversationId: string,
  senderId: number,
  mediaUrl: string,
  type: 'image' | 'video' | 'voice',
  thumbnailUrl?: string,
  _clientMessageId?: string
): Promise<Message | null> {
  await ensureMessagingAllowed(conversationId, senderId)

  console.log('[ChatApi] sendMediaMessage:', { conversationId, senderId, mediaUrl, type })

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      message_type: type,
      media_url: mediaUrl,
      media_thumbnail: thumbnailUrl
    })
    .select('*, sender:users!sender_id(*)')
    .single()

  if (error) {
    console.error('[ChatApi] sendMediaMessage error:', error)
    return null
  }

  console.log('[ChatApi] sendMediaMessage success:', data)

  const preview = type === 'image' ? '📷 Photo' : type === 'video' ? '🎥 Video' : '🎤 Voice'
  await updateConversationLastMessage(conversationId, senderId, preview)

  return data as Message
}

// Send PPV message
export async function sendPPVMessage(
  conversationId: string,
  senderId: number,
  mediaUrl: string,
  _mediaType: 'image' | 'video',
  price: number,
  thumbnailUrl?: string,
  _clientMessageId?: string
): Promise<Message | null> {
  await ensureMessagingAllowed(conversationId, senderId)

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      message_type: 'ppv',
      media_url: mediaUrl,
      media_thumbnail: thumbnailUrl,
      is_ppv: true,
      ppv_price: price,
      ppv_unlocked_by: []
    })
    .select('*, sender:users!sender_id(*)')
    .single()

  if (error) return null

  await updateConversationLastMessage(conversationId, senderId, `🔒 PPV - $${price}`)

  return data as Message
}

// Send gift
export async function sendGift(
  conversationId: string,
  senderId: number,
  giftId: string,
  giftPrice: number
): Promise<{ message: Message | null, error: string | null }> {
  try {
    await ensureMessagingAllowed(conversationId, senderId)
  } catch (err) {
    return { message: null, error: (err as Error).message || 'Messaging not allowed' }
  }

  // Check balance
  const { data: user } = await supabase
    .from('users')
    .select('balance')
    .eq('telegram_id', senderId)
    .single()

  if (!user || user.balance < giftPrice) {
    return { message: null, error: 'Insufficient balance' }
  }

  // Get gift info
  const { data: gift } = await supabase
    .from('gifts')
    .select('name')
    .eq('id', giftId)
    .single()

  // Create message
  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      message_type: 'gift',
      gift_id: giftId
    })
    .select('*, sender:users!sender_id(*), gift:gifts(*)')
    .single()

  if (error) return { message: null, error: error.message }

  // Deduct from sender
  await supabase
    .from('users')
    .update({ balance: user.balance - giftPrice })
    .eq('telegram_id', senderId)

  // Get receiver and add to their balance (90%)
  const { data: conv } = await supabase
    .from('conversations')
    .select('participant_1, participant_2')
    .eq('id', conversationId)
    .single()

  if (conv) {
    const receiverId = conv.participant_1 === senderId ? conv.participant_2 : conv.participant_1
    await supabase.rpc('add_to_balance', {
      user_telegram_id: receiverId,
      amount_to_add: Math.floor(giftPrice * 0.9)
    })
  }

  await updateConversationLastMessage(conversationId, senderId, `🎁 ${gift?.name || 'Gift'}`)

  return { message: message as Message, error: null }
}

// Send tip
export async function sendTip(
  conversationId: string,
  senderId: number,
  amount: number
): Promise<{ message: Message | null, error: string | null }> {
  try {
    await ensureMessagingAllowed(conversationId, senderId)
  } catch (err) {
    return { message: null, error: (err as Error).message || 'Messaging not allowed' }
  }

  // Check balance
  const { data: user } = await supabase
    .from('users')
    .select('balance')
    .eq('telegram_id', senderId)
    .single()

  if (!user || user.balance < amount) {
    return { message: null, error: 'Insufficient balance' }
  }

  // Create message
  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      message_type: 'tip',
      tip_amount: amount
    })
    .select('*, sender:users!sender_id(*)')
    .single()

  if (error) return { message: null, error: error.message }

  // Deduct from sender
  await supabase
    .from('users')
    .update({ balance: user.balance - amount })
    .eq('telegram_id', senderId)

  // Add to receiver (90%)
  const { data: conv } = await supabase
    .from('conversations')
    .select('participant_1, participant_2')
    .eq('id', conversationId)
    .single()

  if (conv) {
    const receiverId = conv.participant_1 === senderId ? conv.participant_2 : conv.participant_1
    await supabase.rpc('add_to_balance', {
      user_telegram_id: receiverId,
      amount_to_add: Math.floor(amount * 0.9)
    })
  }

  await updateConversationLastMessage(conversationId, senderId, `💰 Tip - $${amount}`)

  return { message: message as Message, error: null }
}

// Unlock PPV content
export async function unlockPPV(
  messageId: string,
  userId: number
): Promise<{ success: boolean, error: string | null }> {
  // Get message
  const { data: message } = await supabase
    .from('messages')
    .select('ppv_price, ppv_unlocked_by, sender_id')
    .eq('id', messageId)
    .single()

  if (!message) return { success: false, error: 'Message not found' }

  // Check if already unlocked
  if (message.ppv_unlocked_by?.includes(userId)) {
    return { success: true, error: null }
  }

  // Check balance
  const { data: user } = await supabase
    .from('users')
    .select('balance')
    .eq('telegram_id', userId)
    .single()

  if (!user || user.balance < message.ppv_price) {
    return { success: false, error: 'Insufficient balance' }
  }

  // Unlock
  const newUnlockedBy = [...(message.ppv_unlocked_by || []), userId]
  await supabase
    .from('messages')
    .update({ ppv_unlocked_by: newUnlockedBy })
    .eq('id', messageId)

  // Deduct balance
  await supabase
    .from('users')
    .update({ balance: user.balance - message.ppv_price })
    .eq('telegram_id', userId)

  // Add to creator (90%)
  await supabase.rpc('add_to_balance', {
    user_telegram_id: message.sender_id,
    amount_to_add: Math.floor(message.ppv_price * 0.9)
  })

  return { success: true, error: null }
}

// Mark messages as read
export async function markMessagesRead(conversationId: string, userId: number) {
  // Mark messages as read
  await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('conversation_id', conversationId)
    .neq('sender_id', userId)

  // Update conversation unread count
  const { data: conv } = await supabase
    .from('conversations')
    .select('participant_1, participant_2')
    .eq('id', conversationId)
    .single()

  if (conv) {
    const updateField = conv.participant_1 === userId ? 'participant_1_unread' : 'participant_2_unread'
    await supabase
      .from('conversations')
      .update({ [updateField]: 0 })
      .eq('id', conversationId)
  }
}

// Helper: Update conversation last message
async function updateConversationLastMessage(
  conversationId: string,
  senderId: number,
  preview: string
) {
  const { data: conv } = await supabase
    .from('conversations')
    .select('participant_1, participant_2, participant_1_unread, participant_2_unread')
    .eq('id', conversationId)
    .single()

  if (!conv) return

  const receiverUnreadField = conv.participant_1 === senderId ? 'participant_2_unread' : 'participant_1_unread'
  const senderUnreadField = conv.participant_1 === senderId ? 'participant_1_unread' : 'participant_2_unread'
  const receiverCurrentUnread = receiverUnreadField === 'participant_2_unread'
    ? conv.participant_2_unread
    : conv.participant_1_unread

  await supabase
    .from('conversations')
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: preview.substring(0, 100),
      [receiverUnreadField]: receiverCurrentUnread + 1,
      [senderUnreadField]: 0
    })
    .eq('id', conversationId)
}

// ============================================
// GIFTS API
// ============================================

// Get all available gifts
export async function getGifts(): Promise<Gift[]> {
  const { data } = await supabase
    .from('gifts')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')

  return (data || []) as Gift[]
}

// ============================================
// MESSAGE REACTIONS API
// ============================================

export interface MessageReaction {
  id: string
  message_id: string
  user_id: number
  emoji: string
  created_at: string
}

// Get reactions for messages
export async function getMessageReactions(messageIds: string[]): Promise<Map<string, MessageReaction[]>> {
  if (messageIds.length === 0) return new Map()

  console.log('[getMessageReactions] Fetching reactions for', messageIds.length, 'messages')

  const { data, error } = await supabase
    .from('message_reactions')
    .select('*')
    .in('message_id', messageIds)

  if (error) {
    console.error('[getMessageReactions] Error:', error)
    return new Map()
  }

  console.log('[getMessageReactions] Found', data?.length || 0, 'reactions')

  const reactionsMap = new Map<string, MessageReaction[]>()

  if (data) {
    for (const reaction of data) {
      const existing = reactionsMap.get(reaction.message_id) || []
      existing.push(reaction as MessageReaction)
      reactionsMap.set(reaction.message_id, existing)
    }
  }

  return reactionsMap
}

// Add reaction to message
export async function addReaction(
  messageId: string,
  userId: number,
  emoji: string
): Promise<{ success: boolean; error: string | null }> {
  console.log('[addReaction] Adding reaction:', { messageId, userId, emoji })

  try {
    // Check if reaction already exists (don't use .single() - it throws on no results)
    const { data: existingList, error: checkError } = await supabase
      .from('message_reactions')
      .select('id')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('emoji', emoji)
      .limit(1)

    if (checkError) {
      console.error('[addReaction] Check error:', checkError)
      return { success: false, error: checkError.message }
    }

    const existing = existingList?.[0]
    console.log('[addReaction] Existing reaction:', existing)

    if (existing) {
      // Remove existing reaction (toggle off)
      console.log('[addReaction] Removing existing reaction:', existing.id)
      const { error } = await supabase
        .from('message_reactions')
        .delete()
        .eq('id', existing.id)

      if (error) console.error('[addReaction] Delete error:', error)
      return { success: !error, error: error?.message || null }
    }

    // Add new reaction
    console.log('[addReaction] Inserting new reaction')
    const { data: insertedData, error } = await supabase
      .from('message_reactions')
      .insert({
        message_id: messageId,
        user_id: userId,
        emoji
      })
      .select()

    if (error) {
      console.error('[addReaction] Insert error:', error)
    } else {
      console.log('[addReaction] Inserted:', insertedData)
    }

    return { success: !error, error: error?.message || null }
  } catch (err) {
    console.error('[addReaction] Exception:', err)
    return { success: false, error: (err as Error).message }
  }
}

// Remove reaction from message
export async function removeReaction(
  messageId: string,
  userId: number,
  emoji: string
): Promise<{ success: boolean; error: string | null }> {
  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji)

  return { success: !error, error: error?.message || null }
}

// ============================================
// DELETE MESSAGE API
// ============================================

// Soft delete a message
export async function deleteMessage(
  messageId: string,
  userId: number
): Promise<{ success: boolean; error: string | null }> {
  try {
    // Check if user is the sender
    const { data: messageList } = await supabase
      .from('messages')
      .select('sender_id')
      .eq('id', messageId)
      .limit(1)

    const message = messageList?.[0]

    if (!message) {
      return { success: false, error: 'Message not found' }
    }

    if (message.sender_id !== userId) {
      return { success: false, error: 'You can only delete your own messages' }
    }

    const { error } = await supabase
      .from('messages')
      .update({ is_deleted: true })
      .eq('id', messageId)

    return { success: !error, error: error?.message || null }
  } catch (err) {
    console.error('deleteMessage error:', err)
    return { success: false, error: (err as Error).message }
  }
}

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================

// Subscribe to new messages in a conversation
export function subscribeToMessages(
  conversationId: string,
  onMessage: (message: Message) => void
) {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`
      },
      async (payload) => {
        // Fetch full message with relations
        const { data } = await supabase
          .from('messages')
          .select('*, sender:users!sender_id(*), gift:gifts(*)')
          .eq('id', payload.new.id)
          .single()

        if (data) {
          onMessage(data as Message)
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

// Subscribe to conversation updates
export function subscribeToConversations(
  userId: number,
  onUpdate: (conversation: Conversation) => void
) {
  const channel = supabase
    .channel(`conversations:${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'conversations'
      },
      async (payload) => {
        const conv = payload.new as any
        if (conv.participant_1 === userId || conv.participant_2 === userId) {
          // Fetch with user data
          const otherId = conv.participant_1 === userId ? conv.participant_2 : conv.participant_1
          const { data: otherUser } = await supabase
            .from('users')
            .select('*')
            .eq('telegram_id', otherId)
            .single()

          onUpdate({
            ...conv,
            other_user: otherUser,
            unread_count: conv.participant_1 === userId
              ? conv.participant_1_unread
              : conv.participant_2_unread
          })
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

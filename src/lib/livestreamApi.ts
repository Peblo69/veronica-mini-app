import { supabase } from './supabase'
import type { User } from './api'
import { processLivestreamTicket, processTip, type PaymentResult } from './payments'

// ============================================
// LIVESTREAM TYPES
// ============================================

export interface Livestream {
  id: string
  creator_id: number
  title: string
  description: string | null
  thumbnail_url: string | null
  status: 'scheduled' | 'live' | 'ended'
  scheduled_at: string | null
  started_at: string | null
  ended_at: string | null
  is_private: boolean
  entry_price: number
  room_name: string | null
  agora_channel: string | null
  viewer_count: number
  peak_viewers: number
  total_gifts_received: number
  total_tips_received: number
  created_at: string
  creator?: User
}

export interface LivestreamMessage {
  id: string
  livestream_id: string
  user_id: number
  content: string | null
  message_type: 'chat' | 'gift' | 'tip' | 'system'
  gift_id: string | null
  tip_amount: number | null
  is_pinned: boolean
  created_at: string
  user?: User
  gift?: {
    name: string
    price: number
  }
}

export interface LivestreamAccessState {
  can_watch: boolean
  requires_ticket: boolean
  has_ticket: boolean
  requires_subscription: boolean
  has_subscription: boolean
  entry_price: number
  is_creator: boolean
  reason?: string
}

// Agora App ID
export const AGORA_APP_ID = '81e67142488042efa6a00af94095db5e'

// ============================================
// STREAMING LIMITS
// ============================================

const DAILY_LIMIT_MINUTES = 60

export async function getRemainingStreamMinutes(userId: number): Promise<number> {
  const { data } = await supabase
    .from('streaming_usage')
    .select('minutes_used')
    .eq('user_id', userId)
    .eq('date', new Date().toISOString().split('T')[0])
    .single()

  if (!data) return DAILY_LIMIT_MINUTES
  return Math.max(0, DAILY_LIMIT_MINUTES - data.minutes_used)
}

export async function addStreamingMinutes(userId: number, minutes: number): Promise<number> {
  const today = new Date().toISOString().split('T')[0]

  const { data: existing } = await supabase
    .from('streaming_usage')
    .select('minutes_used')
    .eq('user_id', userId)
    .eq('date', today)
    .single()

  if (existing) {
    const newTotal = existing.minutes_used + minutes
    await supabase
      .from('streaming_usage')
      .update({ minutes_used: newTotal, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('date', today)
    return newTotal
  } else {
    await supabase
      .from('streaming_usage')
      .insert({ user_id: userId, date: today, minutes_used: minutes })
    return minutes
  }
}

// ============================================
// LIVESTREAM CRUD
// ============================================

export async function createLivestream(
  creatorId: number,
  title: string,
  options?: {
    description?: string
    is_private?: boolean
    entry_price?: number
    thumbnail_url?: string | null
  }
): Promise<Livestream | null> {
  // Generate unique channel name
  const channelName = `live_${creatorId}_${Date.now()}`

  const { data, error } = await supabase
    .from('livestreams')
    .insert({
      creator_id: creatorId,
      title,
      description: options?.description,
      is_private: options?.is_private || false,
      entry_price: options?.entry_price || 0,
      thumbnail_url: options?.thumbnail_url || null,
      agora_channel: channelName,
      room_name: channelName,
      status: 'live',
      started_at: new Date().toISOString()
    })
    .select('*, creator:users!creator_id(*)')
    .single()

  if (error) {
    console.error('Create livestream error:', error)
    return null
  }

  return data as Livestream
}

export async function endLivestream(livestreamId: string): Promise<boolean> {
  const { error } = await supabase
    .from('livestreams')
    .update({
      status: 'ended',
      ended_at: new Date().toISOString()
    })
    .eq('id', livestreamId)

  return !error
}

export async function getLivestreams(): Promise<Livestream[]> {
  const { data } = await supabase
    .from('livestreams')
    .select('*, creator:users!creator_id(*)')
    .eq('status', 'live')
    .order('started_at', { ascending: false })

  return (data || []) as Livestream[]
}

export async function getLivestream(id: string): Promise<Livestream | null> {
  const { data } = await supabase
    .from('livestreams')
    .select('*, creator:users!creator_id(*)')
    .eq('id', id)
    .single()

  return data as Livestream | null
}

export async function getCreatorLivestream(creatorId: number): Promise<Livestream | null> {
  const { data } = await supabase
    .from('livestreams')
    .select('*, creator:users!creator_id(*)')
    .eq('creator_id', creatorId)
    .eq('status', 'live')
    .single()

  return data as Livestream | null
}

export async function getLivestreamAccess(
  livestreamOrId: Livestream | string,
  userId: number
): Promise<LivestreamAccessState> {
  let stream: Livestream | null = null

  if (typeof livestreamOrId === 'string') {
    stream = await getLivestream(livestreamOrId)
  } else {
    stream = livestreamOrId
  }

  if (!stream) {
    return {
      can_watch: false,
      requires_ticket: false,
      has_ticket: false,
      requires_subscription: false,
      has_subscription: false,
      entry_price: 0,
      is_creator: false,
      reason: 'This stream is no longer available.'
    }
  }

  const isCreator = stream.creator_id === userId
  const isLive = stream.status === 'live'
  const requiresSubscription = Boolean(stream.is_private) && !isCreator
  const requiresTicket = (stream.entry_price || 0) > 0 && !isCreator

  let hasSubscription = false
  if (requiresSubscription) {
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('subscriber_id', userId)
      .eq('creator_id', stream.creator_id)
      .eq('is_active', true)
      .limit(1)

    hasSubscription = Boolean(subscription && subscription.length > 0)
  }

  let hasTicket = false
  if (requiresTicket) {
    const { data: ticket } = await supabase
      .from('livestream_tickets')
      .select('id')
      .eq('livestream_id', stream.id)
      .eq('user_id', userId)
      .limit(1)

    hasTicket = Boolean(ticket && ticket.length > 0)
  }

  let reason: string | undefined
  if (!isLive && !isCreator) {
    reason = 'This stream is not live right now.'
  } else if (requiresSubscription && !hasSubscription) {
    reason = 'Subscribe to watch this stream.'
  } else if (requiresTicket && !hasTicket) {
    reason = `Unlock this stream for ${stream.entry_price} tokens.`
  }

  const canWatch = isCreator
    ? true
    : isLive && (!requiresSubscription || hasSubscription) && (!requiresTicket || hasTicket)

  return {
    can_watch: canWatch,
    requires_ticket: requiresTicket,
    has_ticket: hasTicket,
    requires_subscription: requiresSubscription,
    has_subscription: hasSubscription || isCreator,
    entry_price: stream.entry_price || 0,
    is_creator: isCreator,
    reason
  }
}

export async function purchaseLivestreamTicket(livestreamId: string, userId: number): Promise<PaymentResult> {
  const stream = await getLivestream(livestreamId)

  if (!stream) {
    return { success: false, error: 'Livestream not found.' }
  }

  return processLivestreamTicket(userId, stream.creator_id, stream.id, stream.entry_price || 0)
}

// ============================================
// VIEWER TRACKING
// ============================================

export async function joinLivestream(livestreamId: string, userId: number): Promise<boolean> {
  // Add viewer
  await supabase
    .from('livestream_viewers')
    .upsert({
      livestream_id: livestreamId,
      user_id: userId,
      joined_at: new Date().toISOString(),
      is_currently_watching: true
    })

  // Update viewer count
  const { data: viewers } = await supabase
    .from('livestream_viewers')
    .select('id')
    .eq('livestream_id', livestreamId)
    .eq('is_currently_watching', true)

  const count = viewers?.length || 0

  // Update stream with new count and peak
  const { data: stream } = await supabase
    .from('livestreams')
    .select('peak_viewers')
    .eq('id', livestreamId)
    .single()

  await supabase
    .from('livestreams')
    .update({
      viewer_count: count,
      peak_viewers: Math.max(stream?.peak_viewers || 0, count)
    })
    .eq('id', livestreamId)

  return true
}

export async function leaveLivestream(livestreamId: string, userId: number): Promise<void> {
  await supabase
    .from('livestream_viewers')
    .update({
      is_currently_watching: false,
      left_at: new Date().toISOString()
    })
    .eq('livestream_id', livestreamId)
    .eq('user_id', userId)

  // Update viewer count
  const { data: viewers } = await supabase
    .from('livestream_viewers')
    .select('id')
    .eq('livestream_id', livestreamId)
    .eq('is_currently_watching', true)

  await supabase
    .from('livestreams')
    .update({ viewer_count: viewers?.length || 0 })
    .eq('id', livestreamId)
}

// ============================================
// LIVESTREAM CHAT
// ============================================

export async function getLivestreamMessages(livestreamId: string, limit = 100): Promise<LivestreamMessage[]> {
  const { data } = await supabase
    .from('livestream_messages')
    .select('*, user:users!user_id(*), gift:gifts(*)')
    .eq('livestream_id', livestreamId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(limit)

  return (data || []) as LivestreamMessage[]
}

export async function sendLivestreamMessage(
  livestreamId: string,
  userId: number,
  content: string
): Promise<LivestreamMessage | null> {
  const { data, error } = await supabase
    .from('livestream_messages')
    .insert({
      livestream_id: livestreamId,
      user_id: userId,
      content,
      message_type: 'chat'
    })
    .select('*, user:users!user_id(*)')
    .single()

  if (error) return null
  return data as LivestreamMessage
}

export async function sendLivestreamGift(
  livestreamId: string,
  userId: number,
  giftId: string,
  giftPrice: number
): Promise<{ message: LivestreamMessage | null; error: string | null }> {
  // Use Stars flow (processTip with referenceType tip)
  const stream = await getLivestream(livestreamId)
  if (!stream) {
    return { message: null, error: 'Stream not found' }
  }

  const payResult = await processTip(userId, stream.creator_id, giftPrice, 'stars')
  if (!payResult.success) {
    return { message: null, error: payResult.error || 'Gift payment failed' }
  }

  // Create chat message noting the gift
  const { data: gift } = await supabase
    .from('gifts')
    .select('name, price')
    .eq('id', giftId)
    .single()

  const { data: message, error } = await supabase
    .from('livestream_messages')
    .insert({
      livestream_id: livestreamId,
      user_id: userId,
      content: `sent ${gift?.name || 'a gift'}`,
      message_type: 'gift',
      gift_id: giftId
    })
    .select('*, user:users!user_id(*), gift:gifts(*)')
    .single()

  if (error) return { message: null, error: error.message }

  // Track totals
  await supabase
    .from('livestreams')
    .update({
      total_gifts_received: (stream.total_gifts_received || 0) + (gift?.price || giftPrice)
    })
    .eq('id', livestreamId)

  return { message: message as LivestreamMessage, error: null }
}

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================

export function subscribeToLivestreamMessages(
  livestreamId: string,
  onMessage: (message: LivestreamMessage) => void
) {
  const channel = supabase
    .channel(`livestream_messages:${livestreamId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'livestream_messages',
        filter: `livestream_id=eq.${livestreamId}`
      },
      async (payload) => {
        const { data } = await supabase
          .from('livestream_messages')
          .select('*, user:users!user_id(*), gift:gifts(*)')
          .eq('id', payload.new.id)
          .single()

        if (data) {
          onMessage(data as LivestreamMessage)
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export function subscribeToViewerCount(
  livestreamId: string,
  onUpdate: (count: number) => void
) {
  const channel = supabase
    .channel(`livestream_viewers:${livestreamId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'livestreams',
        filter: `id=eq.${livestreamId}`
      },
      (payload: any) => {
        onUpdate(payload.new.viewer_count || 0)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

export function subscribeToLivestreams(onUpdate: (streams: Livestream[]) => void) {
  const channel = supabase
    .channel('livestreams:lobby')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'livestreams'
      },
      async (payload: any) => {
        const eventType = payload.eventType
        const newStatus = payload.new?.status
        const oldStatus = payload.old?.status

        const statusChanged =
          eventType === 'DELETE' ||
          (eventType === 'INSERT' && newStatus === 'live') ||
          (eventType === 'UPDATE' && (newStatus === 'live' || oldStatus === 'live'))

        if (!statusChanged) return

        const streams = await getLivestreams()
        onUpdate(streams)
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

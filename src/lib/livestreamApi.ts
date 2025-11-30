import { supabase } from './supabase'
import type { User } from './api'

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
  // Check balance
  const { data: user } = await supabase
    .from('users')
    .select('balance')
    .eq('telegram_id', userId)
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

  // Deduct from sender
  await supabase
    .from('users')
    .update({ balance: user.balance - giftPrice })
    .eq('telegram_id', userId)

  // Add to creator (90%)
  const { data: stream } = await supabase
    .from('livestreams')
    .select('creator_id, total_gifts_received')
    .eq('id', livestreamId)
    .single()

  if (stream) {
    await supabase.rpc('add_to_balance', {
      user_telegram_id: stream.creator_id,
      amount_to_add: Math.floor(giftPrice * 0.9)
    })

    // Update stream gift total
    await supabase
      .from('livestreams')
      .update({ total_gifts_received: (stream.total_gifts_received || 0) + giftPrice })
      .eq('id', livestreamId)
  }

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

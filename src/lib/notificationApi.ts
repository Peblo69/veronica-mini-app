import { supabase } from './supabase'
import type { User } from './api'

// ============================================
// NOTIFICATION TYPES
// ============================================

export type NotificationType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'subscription'
  | 'tip'
  | 'gift'
  | 'message'
  | 'livestream'
  | 'system'

export interface Notification {
  id: string
  user_id: number
  from_user_id?: number
  type: NotificationType
  content?: string
  reference_id?: string
  reference_type?: string
  is_read: boolean
  created_at: string
  from_user?: User
}

// ============================================
// GET NOTIFICATIONS
// ============================================

export async function getNotifications(userId: number, limit = 50): Promise<Notification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*, from_user:users!from_user_id(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Get notifications error:', error)
    return []
  }

  return (data || []) as Notification[]
}

// ============================================
// GET UNREAD COUNT
// ============================================

export async function getUnreadCount(userId: number): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  if (error) {
    console.error('Get unread count error:', error)
    return 0
  }

  return count || 0
}

// ============================================
// MARK AS READ
// ============================================

export async function markNotificationRead(notificationId: string): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)

  return !error
}

export async function markAllNotificationsRead(userId: number): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)

  return !error
}

// ============================================
// CREATE NOTIFICATION
// ============================================

export async function createNotification(
  userId: number,
  type: NotificationType,
  options?: {
    fromUserId?: number
    content?: string
    referenceId?: string
    referenceType?: string
  }
): Promise<Notification | null> {
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      from_user_id: options?.fromUserId,
      type,
      content: options?.content,
      reference_id: options?.referenceId,
      reference_type: options?.referenceType
    })
    .select('*, from_user:users!from_user_id(*)')
    .single()

  if (error) {
    console.error('Create notification error:', error)
    return null
  }

  return data as Notification
}

// ============================================
// NOTIFICATION CONTENT HELPERS
// ============================================

export function getNotificationContent(notification: Notification): string {
  const { type, content } = notification

  if (content) return content

  switch (type) {
    case 'like':
      return 'liked your post'
    case 'comment':
      return 'commented on your post'
    case 'follow':
      return 'started following you'
    case 'subscription':
      return 'subscribed to your content'
    case 'tip':
      return 'sent you a tip'
    case 'gift':
      return 'sent you a gift'
    case 'message':
      return 'sent you a message'
    case 'livestream':
      return 'started a livestream'
    case 'system':
      return 'System notification'
    default:
      return 'interacted with you'
  }
}

// ============================================
// REALTIME SUBSCRIPTION
// ============================================

export function subscribeToNotifications(
  userId: number,
  onNotification: (notification: Notification) => void
) {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      },
      async (payload) => {
        // Fetch full notification with user data
        const { data } = await supabase
          .from('notifications')
          .select('*, from_user:users!from_user_id(*)')
          .eq('id', payload.new.id)
          .single()

        if (data) {
          onNotification(data as Notification)
        }
      }
    )
    .subscribe()

  return () => {
    supabase.removeChannel(channel)
  }
}

// ============================================
// DELETE NOTIFICATION
// ============================================

export async function deleteNotification(notificationId: string): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId)

  return !error
}

export async function clearAllNotifications(userId: number): Promise<boolean> {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', userId)

  return !error
}

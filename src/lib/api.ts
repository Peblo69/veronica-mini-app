import { supabase } from './supabase'

// ============================================
// USER API
// ============================================

export interface User {
  telegram_id: number
  username?: string
  first_name?: string
  last_name?: string
  balance: number
  is_creator: boolean
  bio?: string
  avatar_url?: string
  cover_url?: string
  is_verified: boolean
  subscription_price: number
  followers_count: number
  following_count: number
  posts_count: number
  likes_received: number
}

export interface Post {
  id: number
  creator_id: number
  content?: string
  media_url?: string
  media_type: string
  visibility: 'public' | 'followers' | 'subscribers'
  is_nsfw: boolean
  unlock_price: number
  likes_count: number
  comments_count: number
  created_at: string
  creator?: User
  liked?: boolean
}

// Get or create user from Telegram data
export async function getOrCreateUser(telegramUser: any): Promise<User | null> {
  const { data: existing } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramUser.id)
    .single()

  if (existing) {
    return existing as User
  }

  // Create new user
  const { data: newUser, error } = await supabase
    .from('users')
    .insert({
      telegram_id: telegramUser.id,
      username: telegramUser.username,
      first_name: telegramUser.first_name,
      last_name: telegramUser.last_name,
      avatar_url: telegramUser.photo_url,
      balance: 50, // Welcome bonus
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating user:', error)
    return null
  }
  return newUser as User
}

// Get user by ID
export async function getUser(telegramId: number): Promise<User | null> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single()
  return data as User | null
}

// Update user profile
export async function updateProfile(telegramId: number, updates: Partial<User>) {
  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('telegram_id', telegramId)
  return !error
}

// ============================================
// CREATORS / FEED API
// ============================================

// Get feed posts
export async function getFeed(userId: number, limit = 20): Promise<Post[]> {
  const { data } = await supabase
    .from('posts')
    .select('*, creator:users!creator_id(*)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!data) return []

  // Check which posts user has liked
  const { data: userLikes } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', userId)

  const likedPostIds = new Set(userLikes?.map(l => l.post_id) || [])

  return data.map(post => ({
    ...post,
    liked: likedPostIds.has(post.id)
  })) as Post[]
}

// Get creator posts
export async function getCreatorPosts(creatorId: number, userId: number): Promise<Post[]> {
  const { data } = await supabase
    .from('posts')
    .select('*')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })

  if (!data) return []

  const { data: userLikes } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', userId)

  const likedPostIds = new Set(userLikes?.map(l => l.post_id) || [])

  return data.map(post => ({
    ...post,
    liked: likedPostIds.has(post.id)
  })) as Post[]
}

// Get suggested creators
export async function getSuggestedCreators(limit = 10): Promise<User[]> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('is_creator', true)
    .order('followers_count', { ascending: false })
    .limit(limit)
  return (data || []) as User[]
}

// ============================================
// POSTS API
// ============================================

// Create post
export async function createPost(creatorId: number, content: string, mediaUrl?: string, isPremium = false) {
  const { data, error } = await supabase
    .from('posts')
    .insert({
      creator_id: creatorId,
      content,
      media_url: mediaUrl,
      is_premium: isPremium,
    })
    .select()
    .single()
  return { data, error }
}

// Like post
export async function likePost(userId: number, postId: number) {
  const { error } = await supabase
    .from('likes')
    .insert({ user_id: userId, post_id: postId })
  
  if (!error) {
    await supabase.rpc('increment_likes', { post_id: postId })
  }
  return !error
}

// Unlike post
export async function unlikePost(userId: number, postId: number) {
  const { error } = await supabase
    .from('likes')
    .delete()
    .eq('user_id', userId)
    .eq('post_id', postId)
  return !error
}

// ============================================
// FOLLOWS / SUBSCRIPTIONS API
// ============================================

// Follow user
export async function followUser(followerId: number, followingId: number) {
  const { error } = await supabase
    .from('follows')
    .insert({ follower_id: followerId, following_id: followingId })
  return !error
}

// Unfollow user
export async function unfollowUser(followerId: number, followingId: number) {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
  return !error
}

// Check if following
export async function isFollowing(followerId: number, followingId: number): Promise<boolean> {
  const { data } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .single()
  return !!data
}

// Subscribe to creator
export async function subscribeToCreator(subscriberId: number, creatorId: number, price: number) {
  const { error } = await supabase
    .from('subscriptions')
    .insert({
      subscriber_id: subscriberId,
      creator_id: creatorId,
      price_paid: price,
    })
  return !error
}

// Check if subscribed
export async function isSubscribed(subscriberId: number, creatorId: number): Promise<boolean> {
  const { data } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('subscriber_id', subscriberId)
    .eq('creator_id', creatorId)
    .eq('is_active', true)
    .single()
  return !!data
}

// ============================================
// NOTIFICATIONS API
// ============================================

export interface Notification {
  id: number
  type: string
  from_user_id?: number
  content?: string
  is_read: boolean
  created_at: string
  from_user?: User
}

// Get notifications
export async function getNotifications(userId: number, limit = 20): Promise<Notification[]> {
  const { data } = await supabase
    .from('notifications')
    .select('*, from_user:users!from_user_id(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data || []) as Notification[]
}

// Mark notifications as read
export async function markNotificationsRead(userId: number) {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
}

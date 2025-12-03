import { supabase } from './supabase'
import { deleteFile } from './storage'

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
  media_thumbnail?: string | null
  media_type: string
  visibility: 'public' | 'followers' | 'subscribers'
  is_nsfw: boolean
  unlock_price: number
  likes_count: number
  comments_count: number
  created_at: string
  creator?: User
  liked?: boolean
  saved?: boolean
  can_view?: boolean
  is_purchased?: boolean
  is_following?: boolean
  is_subscribed?: boolean
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

// Get feed posts with visibility checks
export async function getFeed(userId: number, limit = 20): Promise<Post[]> {
  const { data } = await supabase
    .from('posts')
    .select('*, creator:users!creator_id(*)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!data) return []

  // Get post IDs for counting actual likes
  const postIds = data.map(p => p.id)

  // Get user's likes, saves, purchases, and actual like counts in parallel
  const [likesRes, savesRes, purchasesRes, allLikesRes] = await Promise.all([
    supabase.from('likes').select('post_id').eq('user_id', userId),
    supabase.from('saved_posts').select('post_id').eq('user_id', userId),
    supabase.from('content_purchases').select('post_id').eq('user_id', userId),
    supabase.from('likes').select('post_id').in('post_id', postIds)
  ])

  const likedPostIds = new Set(likesRes.data?.map(l => l.post_id) || [])
  const savedPostIds = new Set(savesRes.data?.map(s => s.post_id) || [])

  // Count actual likes per post
  const actualLikesCount = new Map<number, number>()
  allLikesRes.data?.forEach(l => {
    actualLikesCount.set(l.post_id, (actualLikesCount.get(l.post_id) || 0) + 1)
  })
  const purchasedPostIds = new Set(purchasesRes.data?.map(p => p.post_id) || [])

  // Get unique creator IDs
  const creatorIds = [...new Set(data.map(p => p.creator_id))]

  // Get user relationships with all creators
  const [followsRes, subsRes] = await Promise.all([
    supabase.from('follows').select('following_id').eq('follower_id', userId).in('following_id', creatorIds),
    supabase.from('subscriptions').select('creator_id').eq('subscriber_id', userId).eq('is_active', true).in('creator_id', creatorIds)
  ])

  const followingIds = new Set(followsRes.data?.map(f => f.following_id) || [])
  const subscribedIds = new Set(subsRes.data?.map(s => s.creator_id) || [])

  return data.map(post => {
    const isFollowing = followingIds.has(post.creator_id)
    const isSubscribed = subscribedIds.has(post.creator_id)
    const isPurchased = purchasedPostIds.has(post.id)

    return {
      ...post,
      likes_count: actualLikesCount.get(post.id) || 0,
      liked: likedPostIds.has(post.id),
      saved: savedPostIds.has(post.id),
      is_purchased: isPurchased,
      is_following: isFollowing,
      is_subscribed: isSubscribed,
      can_view: canViewPost(post as Post, userId, isFollowing, isSubscribed, isPurchased)
    }
  }) as Post[]
}

// Get creator posts
export async function getCreatorPosts(creatorId: number, userId: number): Promise<Post[]> {
  const { data } = await supabase
    .from('posts')
    .select('*')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })

  if (!data) return []

  const postIds = data.map(p => p.id)

  // Get user likes and actual like counts
  const [userLikesRes, allLikesRes] = await Promise.all([
    supabase.from('likes').select('post_id').eq('user_id', userId),
    supabase.from('likes').select('post_id').in('post_id', postIds)
  ])

  const likedPostIds = new Set(userLikesRes.data?.map(l => l.post_id) || [])

  // Count actual likes per post
  const actualLikesCount = new Map<number, number>()
  allLikesRes.data?.forEach(l => {
    actualLikesCount.set(l.post_id, (actualLikesCount.get(l.post_id) || 0) + 1)
  })

  return data.map(post => ({
    ...post,
    likes_count: actualLikesCount.get(post.id) || 0,
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

// Get video posts for Explore/Reels
export async function getVideoPosts(userId: number, limit = 50, offset = 0): Promise<Post[]> {
  const { data } = await supabase
    .from('posts')
    .select('*, creator:users!creator_id(*)')
    .eq('media_type', 'video')
    .eq('visibility', 'public')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (!data) return []

  const postIds = data.map(p => p.id)

  // Get user's likes
  const { data: likesData } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds)

  const likedPostIds = new Set(likesData?.map(l => l.post_id) || [])

  return data.map(post => ({
    ...post,
    liked: likedPostIds.has(post.id),
    can_view: true
  })) as Post[]
}

// ============================================
// POSTS API
// ============================================

// Create post
export interface CreatePostData {
  content: string
  media_url?: string
  media_type?: 'image' | 'video' | 'text'
  visibility?: 'public' | 'followers' | 'subscribers'
  is_nsfw?: boolean
  unlock_price?: number
}

export async function createPost(creatorId: number, postData: CreatePostData) {
  // Determine media type from URL if not provided
  let mediaType = postData.media_type || 'text'
  if (postData.media_url && !postData.media_type) {
    if (postData.media_url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      mediaType = 'image'
    } else if (postData.media_url.match(/\.(mp4|webm|mov)$/i)) {
      mediaType = 'video'
    }
  }

  const { data, error } = await supabase
    .from('posts')
    .insert({
      creator_id: creatorId,
      content: postData.content,
      media_url: postData.media_url,
      media_type: mediaType,
      visibility: postData.visibility || 'public',
      is_nsfw: postData.is_nsfw || false,
      unlock_price: postData.unlock_price || 0,
    })
    .select()
    .single()

  // Update post count
  if (!error) {
    await supabase.rpc('increment_posts', { creator_id: creatorId })
  }

  return { data, error }
}

// Edit post
export async function editPost(postId: number, creatorId: number, updates: Partial<CreatePostData>) {
  const { data, error } = await supabase
    .from('posts')
    .update({
      content: updates.content,
      visibility: updates.visibility,
      is_nsfw: updates.is_nsfw,
      unlock_price: updates.unlock_price,
      updated_at: new Date().toISOString()
    })
    .eq('id', postId)
    .eq('creator_id', creatorId)
    .select()
    .single()

  return { data, error }
}

// Helper to extract storage path from Supabase URL
function extractStoragePath(url: string, bucket: string): string | null {
  try {
    // Handle different URL formats:
    // Public: https://xxx.supabase.co/storage/v1/object/public/posts/123/file.jpg
    // Signed: https://xxx.supabase.co/storage/v1/object/sign/posts/123/file.jpg?token=...
    const patterns = [
      new RegExp(`/storage/v1/object/(?:public|sign)/${bucket}/(.+?)(?:\\?|$)`),
      new RegExp(`/${bucket}/(.+?)(?:\\?|$)`)
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match && match[1]) {
        return decodeURIComponent(match[1])
      }
    }
    return null
  } catch (e) {
    console.error('Failed to extract storage path:', e)
    return null
  }
}

// Delete post
export async function deletePost(postId: number, creatorId: number) {
  // Ensure proper types
  const pid = Number(postId)
  const cid = Number(creatorId)

  console.log('Deleting post:', { postId: pid, creatorId: cid })

  // First, get the post to retrieve media_url for storage cleanup
  const { data: post, error: fetchError } = await supabase
    .from('posts')
    .select('media_url')
    .eq('id', pid)
    .single()

  if (fetchError) {
    console.error('Failed to fetch post:', fetchError)
    return { success: false, error: { message: `Post not found: ${fetchError.message}` } }
  }

  // Delete media from storage if exists
  if (post?.media_url) {
    const storagePath = extractStoragePath(post.media_url, 'posts')
    if (storagePath) {
      console.log('Deleting media from storage:', storagePath)
      const deleted = await deleteFile('posts', storagePath)
      if (!deleted) {
        console.warn('Failed to delete media from storage, continuing with post deletion')
      } else {
        console.log('Media deleted from storage successfully')
      }
    }
  }

  // Delete related records first (in case foreign keys don't have CASCADE)
  console.log('Cleaning up related records...')

  // Delete likes for this post
  await supabase.from('likes').delete().eq('post_id', pid)

  // Delete saved_posts for this post
  await supabase.from('saved_posts').delete().eq('post_id', pid)

  // Delete content_purchases for this post
  await supabase.from('content_purchases').delete().eq('post_id', pid)

  // Delete comments for this post
  await supabase.from('comments').delete().eq('post_id', pid)

  console.log('Related records cleaned up, deleting post...')

  // Delete the post record
  let { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', pid)
    .eq('creator_id', cid)

  // If that fails, try without creator_id check (for admin or if types mismatch)
  if (error) {
    console.warn('Delete with creator_id failed, trying without:', error)
    const result = await supabase
      .from('posts')
      .delete()
      .eq('id', pid)
    error = result.error
  }

  if (error) {
    console.error('Delete post error:', error)
    return { success: false, error }
  }

  // Try to decrement post count (ignore errors)
  try {
    await supabase.rpc('decrement_posts', { creator_id: cid })
  } catch (e) {
    console.warn('Failed to decrement posts count:', e)
  }

  return { success: true, error: null }
}

// Get single post
export async function getPost(postId: number): Promise<Post | null> {
  const { data } = await supabase
    .from('posts')
    .select('*, creator:users!creator_id(*)')
    .eq('id', postId)
    .single()

  return data as Post | null
}

// Like post
export async function likePost(userId: number, postId: number) {
  const { error } = await supabase
    .from('likes')
    .insert({ user_id: userId, post_id: postId })
  
  if (!error) {
    await supabase.rpc('increment_likes', { p_post_id: postId })
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

  if (!error) {
    await supabase.rpc('decrement_likes', { p_post_id: postId })
  }
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

  if (!error) {
    // Update follower's following_count
    await supabase.rpc('increment_following', { user_id: followerId })
    // Update followed user's followers_count
    await supabase.rpc('increment_followers', { user_id: followingId })
  }
  return !error
}

// Unfollow user
export async function unfollowUser(followerId: number, followingId: number) {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId)

  if (!error) {
    // Update follower's following_count
    await supabase.rpc('decrement_following', { user_id: followerId })
    // Update followed user's followers_count
    await supabase.rpc('decrement_followers', { user_id: followingId })
  }
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

// ============================================
// CONTENT VISIBILITY API
// ============================================

// Get user relationship with creator (following/subscribed)
export async function getUserRelationship(userId: number, creatorId: number) {
  const [followData, subData] = await Promise.all([
    supabase
      .from('follows')
      .select('id')
      .eq('follower_id', userId)
      .eq('following_id', creatorId)
      .single(),
    supabase
      .from('subscriptions')
      .select('id')
      .eq('subscriber_id', userId)
      .eq('creator_id', creatorId)
      .eq('is_active', true)
      .single()
  ])

  return {
    is_following: !!followData.data,
    is_subscribed: !!subData.data
  }
}

// Check if user can view a post
export function canViewPost(
  post: Post,
  userId: number,
  isFollowing: boolean,
  isSubscribed: boolean,
  isPurchased: boolean
): boolean {
  // Own post
  if (post.creator_id === userId) return true

  // Public non-NSFW posts
  if (post.visibility === 'public' && !post.is_nsfw && post.unlock_price === 0) {
    return true
  }

  // Pay-to-unlock requires purchase
  if (post.unlock_price > 0 && !isPurchased) {
    return false
  }

  // NSFW requires subscription
  if (post.is_nsfw && !isSubscribed) {
    return false
  }

  // Subscribers-only
  if (post.visibility === 'subscribers' && !isSubscribed) {
    return false
  }

  // Followers-only (followers OR subscribers)
  if (post.visibility === 'followers' && !isFollowing && !isSubscribed) {
    return false
  }

  return true
}

// Save/bookmark post
export async function savePost(userId: number, postId: number) {
  const { error } = await supabase
    .from('saved_posts')
    .insert({ user_id: userId, post_id: postId })
  return !error
}

// Unsave post
export async function unsavePost(userId: number, postId: number) {
  const { error } = await supabase
    .from('saved_posts')
    .delete()
    .eq('user_id', userId)
    .eq('post_id', postId)
  return !error
}

// Get saved posts
export async function getSavedPosts(userId: number): Promise<Post[]> {
  const { data } = await supabase
    .from('saved_posts')
    .select(`
      post_id,
      posts!inner (
        *,
        creator:users!posts_creator_id_fkey (
          telegram_id, first_name, last_name, username, avatar_url, is_verified, is_creator
        )
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (!data) return []

  return data.map((item: any) => ({
    ...item.posts,
    saved: true,
    can_view: true
  }))
}

// Purchase content
export async function purchaseContent(userId: number, postId: number, amount: number) {
  // Deduct from balance
  const { data: user } = await supabase
    .from('users')
    .select('balance')
    .eq('telegram_id', userId)
    .single()

  if (!user || user.balance < amount) {
    return { success: false, error: 'Insufficient balance' }
  }

  // Create purchase record
  const { error: purchaseError } = await supabase
    .from('content_purchases')
    .insert({
      user_id: userId,
      post_id: postId,
      amount: amount
    })

  if (purchaseError) {
    return { success: false, error: purchaseError.message }
  }

  // Deduct balance
  await supabase
    .from('users')
    .update({ balance: user.balance - amount })
    .eq('telegram_id', userId)

  // Add to creator balance (90% share)
  const { data: post } = await supabase
    .from('posts')
    .select('creator_id')
    .eq('id', postId)
    .single()

  if (post) {
    await supabase.rpc('add_to_balance', {
      user_telegram_id: post.creator_id,
      amount_to_add: amount * 0.9
    })
  }

  return { success: true }
}

// Check if user purchased content
export async function hasPurchased(userId: number, postId: number): Promise<boolean> {
  const { data } = await supabase
    .from('content_purchases')
    .select('id')
    .eq('user_id', userId)
    .eq('post_id', postId)
    .single()
  return !!data
}

// ============================================
// DATA SYNC UTILITIES
// ============================================

// Sync all posts' likes_count with actual likes from likes table
export async function syncAllLikesCounts(): Promise<boolean> {
  const { data: posts } = await supabase
    .from('posts')
    .select('id')

  if (!posts) return false

  for (const post of posts) {
    const { count } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', post.id)

    await supabase
      .from('posts')
      .update({ likes_count: count || 0 })
      .eq('id', post.id)
  }

  return true
}

// Get actual likes count for a post
export async function getActualLikesCount(postId: number): Promise<number> {
  const { count } = await supabase
    .from('likes')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', postId)
  return count || 0
}

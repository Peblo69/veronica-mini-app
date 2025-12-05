import { supabase, removeChannel, type RealtimeChannel } from './supabase'
import { deleteFile } from './storage'
import { toast } from './toast'

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
  media_urls?: string[]  // Array for multiple images/videos
  media_thumbnail?: string | null
  media_thumbnail_urls?: (string | null)[] | null
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

export interface CreatorPostsResult {
  posts: Post[]
  relationship: {
    is_following: boolean
    is_subscribed: boolean
  }
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
export async function getCreatorPosts(creatorId: number, userId: number): Promise<CreatorPostsResult> {
  const { data } = await supabase
    .from('posts')
    .select('*, creator:users!creator_id(*)')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })

  if (!data) {
    return {
      posts: [],
      relationship: {
        is_following: false,
        is_subscribed: false
      }
    }
  }

  const postIds = data.map(p => p.id)

  const [userLikesRes, allLikesRes, purchasesRes, relationship] = await Promise.all([
    supabase.from('likes').select('post_id').eq('user_id', userId).in('post_id', postIds),
    supabase.from('likes').select('post_id').in('post_id', postIds),
    supabase.from('content_purchases').select('post_id').eq('user_id', userId).in('post_id', postIds),
    getUserRelationship(userId, creatorId)
  ])

  const likedPostIds = new Set(userLikesRes.data?.map(l => l.post_id) || [])
  const purchasedPostIds = new Set(purchasesRes.data?.map(p => p.post_id) || [])

  const actualLikesCount = new Map<number, number>()
  allLikesRes.data?.forEach(like => {
    actualLikesCount.set(like.post_id, (actualLikesCount.get(like.post_id) || 0) + 1)
  })

  const posts = data.map(post => {
    const isPurchased = purchasedPostIds.has(post.id)
    const isFollowing = relationship.is_following
    const isSubscribed = relationship.is_subscribed

    return {
      ...post,
      likes_count: actualLikesCount.get(post.id) || 0,
      liked: likedPostIds.has(post.id),
      is_purchased: isPurchased,
      is_following: isFollowing,
      is_subscribed: isSubscribed,
      can_view: canViewPost(post as Post, userId, isFollowing, isSubscribed, isPurchased)
    }
  }) as Post[]

  return {
    posts,
    relationship
  }
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
    .eq('unlock_price', 0)
    .or('is_nsfw.is.null,is_nsfw.eq.false')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (!data) return []

  const visiblePosts = data.filter(post => !post.is_hidden)
  const postIds = visiblePosts.map(p => p.id)

  const { data: likesData } = await supabase
    .from('likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds)

  const likedPostIds = new Set(likesData?.map(l => l.post_id) || [])

  return visiblePosts.map(post => ({
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
  media_urls?: string[]  // For multiple images
  media_thumbnail_url?: string
  media_thumbnail_urls?: (string | null)[]
  media_type?: 'image' | 'video' | 'text'
  visibility?: 'public' | 'followers' | 'subscribers'
  is_nsfw?: boolean
  unlock_price?: number
  // Media metadata
  media_width?: number
  media_height?: number
  media_duration?: number  // for videos, in seconds
  media_size_bytes?: number
}

export async function createPost(creatorId: number, postData: CreatePostData) {
  const trimmedContent = (postData.content || '').trim()
  // Determine media type from URL if not provided
  let mediaType = postData.media_type || 'text'
  const firstUrl = postData.media_urls?.[0] || postData.media_url

  if (firstUrl && !postData.media_type) {
    if (firstUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      mediaType = 'image'
    } else if (firstUrl.match(/\.(mp4|webm|mov)$/i)) {
      mediaType = 'video'
    }
  }

  // Build insert data
  const insertData: Record<string, unknown> = {
    creator_id: creatorId,
    content: trimmedContent,
    media_type: mediaType,
    visibility: postData.visibility || 'public',
    is_nsfw: postData.is_nsfw || false,
    unlock_price: postData.unlock_price || 0,
  }

  if (firstUrl) {
    insertData.media_url = firstUrl // First image/video as primary
  }

  if (postData.media_thumbnail_url) {
    insertData.media_thumbnail = postData.media_thumbnail_url
  }

  // Add media_urls array if multiple images
  if (postData.media_urls && postData.media_urls.length > 0) {
    insertData.media_urls = postData.media_urls
  }

  if (postData.media_thumbnail_urls && postData.media_thumbnail_urls.length > 0) {
    insertData.media_thumbnail_urls = postData.media_thumbnail_urls
  }

  // Add media metadata if provided
  if (postData.media_width) insertData.media_width = postData.media_width
  if (postData.media_height) insertData.media_height = postData.media_height
  if (postData.media_duration) insertData.media_duration = postData.media_duration
  if (postData.media_size_bytes) insertData.media_size_bytes = postData.media_size_bytes

  const { data, error } = await supabase
    .from('posts')
    .insert(insertData)
    .select()
    .single()

  if (error) {
    console.error('createPost supabase error:', { error, insertData })
  }

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
      media_thumbnail: updates.media_thumbnail_url,
      media_thumbnail_urls: updates.media_thumbnail_urls,
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
  const { error } = await supabase
    .from('posts')
    .delete()
    .eq('id', pid)
    .eq('creator_id', cid)

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

// Like post (atomic)
export async function likePost(userId: number, postId: number) {
  // Primary: atomic RPC
  const { data, error } = await supabase.rpc('atomic_like_post', {
    p_user_id: userId,
    p_post_id: postId
  })

  if (!error && data) return true

  // Fallback: direct insert + count increment (for cases where RPC is missing)
  console.warn('[likePost] atomic_like_post failed, falling back to direct insert', error)
  const { error: insertError } = await supabase
    .from('likes')
    .insert({ user_id: userId, post_id: postId })

  if (insertError) {
    console.error('Like post error:', insertError)
    toast.error('Failed to like post')
    return false
  }

  // Best-effort count increment
  try {
    await supabase.rpc('increment_likes', { p_post_id: postId })
  } catch {
    // ignore best-effort failure
  }
  return true
}

// Unlike post (atomic)
export async function unlikePost(userId: number, postId: number) {
  const { data, error } = await supabase.rpc('atomic_unlike_post', {
    p_user_id: userId,
    p_post_id: postId
  })

  if (!error && data === true) return true

  // Fallback: direct delete + count decrement
  console.warn('[unlikePost] atomic_unlike_post failed, falling back to direct delete', error)
  const { error: deleteError } = await supabase
    .from('likes')
    .delete()
    .eq('user_id', userId)
    .eq('post_id', postId)

  if (deleteError) {
    console.error('Unlike post error:', deleteError)
    toast.error('Failed to unlike post')
    return false
  }

  try {
    await supabase.rpc('decrement_likes', { p_post_id: postId })
  } catch {
    // ignore best-effort failure
  }
  return true
}

// Get users who liked a post
export async function getPostLikes(postId: number): Promise<User[]> {
  const { data, error } = await supabase
    .from('likes')
    .select(`
      user_id,
      users:user_id (
        telegram_id,
        username,
        first_name,
        last_name,
        avatar_url,
        is_verified,
        is_creator
      )
    `)
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('Error fetching post likes:', error)
    return []
  }

  return (data || []).map((item: any) => item.users).filter(Boolean) as User[]
}

// Get users who commented on a post (unique)
export async function getPostCommenters(postId: number): Promise<User[]> {
  const { data, error } = await supabase
    .from('comments')
    .select(`
      user_id,
      users:user_id (
        telegram_id,
        username,
        first_name,
        last_name,
        avatar_url,
        is_verified,
        is_creator
      )
    `)
    .eq('post_id', postId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching post commenters:', error)
    return []
  }

  // Get unique users (user might have multiple comments)
  const seen = new Set<number>()
  const uniqueUsers: User[] = []
  for (const item of data || []) {
    const user = (item as any).users
    if (user && !seen.has(user.telegram_id)) {
      seen.add(user.telegram_id)
      uniqueUsers.push(user)
    }
  }

  return uniqueUsers
}

// ============================================
// FOLLOWS / SUBSCRIPTIONS API
// ============================================

// Follow user (atomic)
export async function followUser(followerId: number, followingId: number) {
  const { data, error } = await supabase.rpc('atomic_follow_user', {
    p_follower_id: followerId,
    p_following_id: followingId
  })

  if (error) {
    console.error('Follow user error:', error)
    toast.error('Failed to follow user')
    return false
  }

  if (!data) {
    // Already following or trying to follow self
    return false
  }

  toast.success('Following!')
  return true
}

// Unfollow user (atomic)
export async function unfollowUser(followerId: number, followingId: number) {
  const { data, error } = await supabase.rpc('atomic_unfollow_user', {
    p_follower_id: followerId,
    p_following_id: followingId
  })

  if (error) {
    console.error('Unfollow user error:', error)
    toast.error('Failed to unfollow user')
    return false
  }

  return data === true
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

// Search users by username or display name
export async function searchUsers(query: string, limit = 20): Promise<User[]> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(limit)
  return (data || []) as User[]
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

// Save/bookmark post (atomic)
export async function savePost(userId: number, postId: number) {
  const { data, error } = await supabase.rpc('atomic_save_post', {
    p_user_id: userId,
    p_post_id: postId
  })

  if (error) {
    console.error('Save post error:', error)
    toast.error('Failed to save post')
    return false
  }

  return data === true
}

// Unsave post (atomic)
export async function unsavePost(userId: number, postId: number) {
  const { data, error } = await supabase.rpc('atomic_unsave_post', {
    p_user_id: userId,
    p_post_id: postId
  })

  if (error) {
    console.error('Unsave post error:', error)
    toast.error('Failed to unsave post')
    return false
  }

  return data === true
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

  const posts = data.map((item: any) => item.posts as Post)
  const postIds = posts.map(post => post.id)
  const creatorIds = [...new Set(posts.map(post => post.creator_id))]

  const [purchasesRes, followsRes, subsRes] = await Promise.all([
    supabase
      .from('content_purchases')
      .select('post_id')
      .eq('user_id', userId)
      .in('post_id', postIds),
    supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId)
      .in('following_id', creatorIds),
    supabase
      .from('subscriptions')
      .select('creator_id')
      .eq('subscriber_id', userId)
      .eq('is_active', true)
      .in('creator_id', creatorIds)
  ])

  const purchasedPostIds = new Set(purchasesRes.data?.map(p => p.post_id) || [])
  const followingIds = new Set(followsRes.data?.map(f => f.following_id) || [])
  const subscribedIds = new Set(subsRes.data?.map(s => s.creator_id) || [])

  return posts.map(post => {
    const isFollowing = post.creator_id === userId ? true : followingIds.has(post.creator_id)
    const isSubscribed = post.creator_id === userId ? true : subscribedIds.has(post.creator_id)
    const isPurchased = purchasedPostIds.has(post.id)

    return {
      ...post,
      saved: true,
      is_following: isFollowing,
      is_subscribed: isSubscribed,
      is_purchased: isPurchased,
      can_view: canViewPost(post, userId, isFollowing, isSubscribed, isPurchased)
    }
  })
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

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================

export interface FeedRealtimeCallbacks {
  onNewPost?: (post: Post) => void
  onPostUpdated?: (post: Post) => void
  onPostDeleted?: (postId: number) => void
  onLikeAdded?: (postId: number, userId: number) => void
  onLikeRemoved?: (postId: number, userId: number) => void
  onCommentAdded?: (postId: number, commentCount: number) => void
}

/**
 * Subscribe to realtime feed updates (new posts, likes, comments)
 * Returns an unsubscribe function to clean up
 */
export function subscribeToFeedUpdates(
  callbacks: FeedRealtimeCallbacks
): () => void {
  const channels: RealtimeChannel[] = []

  // Subscribe to new posts
  const postsChannel = supabase
    .channel('feed-posts')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'posts',
      },
      async (payload) => {
        // Fetch full post with creator data
        const { data } = await supabase
          .from('posts')
          .select('*, creator:users!creator_id(*)')
          .eq('id', payload.new.id)
          .single()

        if (data && callbacks.onNewPost) {
          callbacks.onNewPost(data as Post)
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'posts',
      },
      async (payload) => {
        const { data } = await supabase
          .from('posts')
          .select('*, creator:users!creator_id(*)')
          .eq('id', payload.new.id)
          .single()

        if (data && callbacks.onPostUpdated) {
          callbacks.onPostUpdated(data as Post)
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'posts',
      },
      (payload) => {
        if (callbacks.onPostDeleted) {
          callbacks.onPostDeleted(payload.old.id)
        }
      }
    )
    .subscribe()

  channels.push(postsChannel)

  // Subscribe to likes
  const likesChannel = supabase
    .channel('feed-likes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'likes',
      },
      (payload) => {
        if (callbacks.onLikeAdded) {
          callbacks.onLikeAdded(payload.new.post_id, payload.new.user_id)
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'likes',
      },
      (payload) => {
        if (callbacks.onLikeRemoved) {
          callbacks.onLikeRemoved(payload.old.post_id, payload.old.user_id)
        }
      }
    )
    .subscribe()

  channels.push(likesChannel)

  // Subscribe to comments (just count changes)
  const commentsChannel = supabase
    .channel('feed-comments')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'comments',
      },
      async (payload) => {
        // Get updated comment count
        const { count } = await supabase
          .from('comments')
          .select('*', { count: 'exact', head: true })
          .eq('post_id', payload.new.post_id)

        if (callbacks.onCommentAdded) {
          callbacks.onCommentAdded(payload.new.post_id, count || 0)
        }
      }
    )
    .subscribe()

  channels.push(commentsChannel)

  // Return cleanup function
  return () => {
    channels.forEach(channel => removeChannel(channel))
  }
}

/**
 * Subscribe to updates for a specific post
 */
export function subscribeToPost(
  postId: number,
  onUpdate: (post: Post) => void
): () => void {
  const channel = supabase
    .channel(`post-${postId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'posts',
        filter: `id=eq.${postId}`,
      },
      async () => {
        const { data } = await supabase
          .from('posts')
          .select('*, creator:users!creator_id(*)')
          .eq('id', postId)
          .single()

        if (data) {
          onUpdate(data as Post)
        }
      }
    )
    .subscribe()

  return () => removeChannel(channel)
}

/**
 * Subscribe to user profile updates
 */
export function subscribeToUserUpdates(
  telegramId: number,
  onUpdate: (user: User) => void
): () => void {
  const channel = supabase
    .channel(`user-${telegramId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
        filter: `telegram_id=eq.${telegramId}`,
      },
      (payload) => {
        onUpdate(payload.new as User)
      }
    )
    .subscribe()

  return () => removeChannel(channel)
}

import { supabase } from './supabase'

export interface Story {
  id: string
  user_id: number
  media_url: string
  media_type: 'image' | 'video'
  thumbnail_url: string | null
  duration: number | null
  view_count: number
  created_at: string
  expires_at: string
  has_viewed?: boolean
  user_first_name?: string
  user_username?: string
  user_avatar_url?: string
  user_is_verified?: boolean
}

export interface StoryView {
  id: number
  story_id: string
  viewer_id: number
  viewed_at: string
}

// Create a new story after uploading media
export async function createStory(
  userId: number,
  mediaUrl: string,
  mediaType: 'image' | 'video',
  thumbnailUrl?: string,
  duration?: number
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('create_story', {
      p_user_id: userId,
      p_media_url: mediaUrl,
      p_media_type: mediaType,
      p_thumbnail_url: thumbnailUrl || null,
      p_duration: duration || null
    })

    if (error) {
      console.error('[Stories] Create error:', error)
      return null
    }

    return data as string
  } catch (err) {
    console.error('[Stories] Create exception:', err)
    return null
  }
}

// Get stories for the user's feed (from followed users)
export async function getFeedStories(viewerId: number): Promise<Story[]> {
  try {
    const { data, error } = await supabase.rpc('get_feed_stories', {
      p_viewer_id: viewerId
    })

    if (error) {
      console.error('[Stories] Get feed error:', error)
      return []
    }

    return (data as Story[]) || []
  } catch (err) {
    console.error('[Stories] Get feed exception:', err)
    return []
  }
}

// Get a user's stories
export async function getUserStories(userId: number): Promise<Story[]> {
  try {
    const { data, error } = await supabase
      .from('stories')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[Stories] Get user stories error:', error)
      return []
    }

    return (data as Story[]) || []
  } catch (err) {
    console.error('[Stories] Get user stories exception:', err)
    return []
  }
}

// Record a view on a story
export async function viewStory(storyId: string, viewerId: number): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('view_story', {
      p_story_id: storyId,
      p_viewer_id: viewerId
    })

    if (error) {
      console.error('[Stories] View error:', error)
      return false
    }

    return data as boolean
  } catch (err) {
    console.error('[Stories] View exception:', err)
    return false
  }
}

// Get viewers of a story (for story owner)
export async function getStoryViewers(storyId: string): Promise<StoryView[]> {
  try {
    const { data, error } = await supabase
      .from('story_views')
      .select(`
        *,
        viewer:users!story_views_viewer_id_fkey(
          telegram_id,
          first_name,
          username,
          avatar_url,
          is_verified
        )
      `)
      .eq('story_id', storyId)
      .order('viewed_at', { ascending: false })

    if (error) {
      console.error('[Stories] Get viewers error:', error)
      return []
    }

    return (data as StoryView[]) || []
  } catch (err) {
    console.error('[Stories] Get viewers exception:', err)
    return []
  }
}

// Delete a story
export async function deleteStory(storyId: string, userId: number): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('stories')
      .delete()
      .eq('id', storyId)
      .eq('user_id', userId)

    if (error) {
      console.error('[Stories] Delete error:', error)
      return false
    }

    return true
  } catch (err) {
    console.error('[Stories] Delete exception:', err)
    return false
  }
}

// Check if user has active stories
export async function hasActiveStories(userId: number): Promise<boolean> {
  try {
    const { count, error } = await supabase
      .from('stories')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())

    if (error) {
      console.error('[Stories] Check active error:', error)
      return false
    }

    return (count || 0) > 0
  } catch (err) {
    console.error('[Stories] Check active exception:', err)
    return false
  }
}

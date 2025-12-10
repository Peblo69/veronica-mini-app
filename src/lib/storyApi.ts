import { supabase } from './supabase'

export async function createStory(userId: number, mediaUrl: string, mediaType: 'image' | 'video', expiresAt?: string) {
  const { error, data } = await supabase
    .from('stories')
    .insert({
      user_id: userId,
      media_url: mediaUrl,
      media_type: mediaType,
      expires_at: expiresAt,
    })
    .select()
    .single()

  return { story: data, error }
}

export async function getActiveStories() {
  try {
    const { data, error } = await supabase
      .from('stories')
      .select('*, user:users!user_id(*)')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('Stories table may not exist:', error.message)
      return { stories: [], error }
    }

    return { stories: data || [], error: null }
  } catch (err) {
    console.warn('Failed to load stories:', err)
    return { stories: [], error: err }
  }
}

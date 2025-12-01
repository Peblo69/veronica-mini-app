-- =====================================================
-- SUPABASE STORAGE BUCKETS SETUP
-- =====================================================

-- Create storage buckets
-- NOTE: messages bucket is now PUBLIC to allow direct URL access for chat media
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('posts', 'posts', true, 104857600, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']),
  ('messages', 'messages', true, 104857600, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm']),
  ('stories', 'stories', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']),
  ('livestreams', 'livestreams', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =====================================================
-- STORAGE POLICIES - AVATARS (Public read, authenticated upload)
-- =====================================================

CREATE POLICY "Avatar images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Anyone can upload an avatar"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Anyone can update their avatar"
ON storage.objects FOR UPDATE
USING (bucket_id = 'avatars');

CREATE POLICY "Anyone can delete avatars"
ON storage.objects FOR DELETE
USING (bucket_id = 'avatars');

-- =====================================================
-- STORAGE POLICIES - POSTS (Public read, authenticated upload)
-- =====================================================

CREATE POLICY "Post media is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'posts');

CREATE POLICY "Anyone can upload post media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'posts');

CREATE POLICY "Anyone can update post media"
ON storage.objects FOR UPDATE
USING (bucket_id = 'posts');

CREATE POLICY "Anyone can delete post media"
ON storage.objects FOR DELETE
USING (bucket_id = 'posts');

-- =====================================================
-- STORAGE POLICIES - MESSAGES (Private)
-- =====================================================

CREATE POLICY "Message media accessible to all"
ON storage.objects FOR SELECT
USING (bucket_id = 'messages');

CREATE POLICY "Anyone can upload message media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'messages');

CREATE POLICY "Anyone can delete message media"
ON storage.objects FOR DELETE
USING (bucket_id = 'messages');

-- =====================================================
-- STORAGE POLICIES - STORIES (Public read)
-- =====================================================

CREATE POLICY "Story media is publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'stories');

CREATE POLICY "Anyone can upload story media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'stories');

CREATE POLICY "Anyone can delete story media"
ON storage.objects FOR DELETE
USING (bucket_id = 'stories');

-- =====================================================
-- STORAGE POLICIES - LIVESTREAMS (Public read)
-- =====================================================

CREATE POLICY "Livestream thumbnails are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'livestreams');

CREATE POLICY "Anyone can upload livestream thumbnails"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'livestreams');

CREATE POLICY "Anyone can delete livestream thumbnails"
ON storage.objects FOR DELETE
USING (bucket_id = 'livestreams');

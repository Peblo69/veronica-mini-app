-- =============================================
-- ATOMIC RPC FUNCTIONS
-- These functions perform multi-step operations atomically
-- Run this in Supabase SQL Editor
-- =============================================

-- =============================================
-- ATOMIC LIKE/UNLIKE POST
-- =============================================

-- Atomic like post (insert like + increment count in one transaction)
CREATE OR REPLACE FUNCTION atomic_like_post(
  p_user_id BIGINT,
  p_post_id BIGINT
) RETURNS BOOLEAN AS $$
DECLARE
  v_already_liked BOOLEAN;
BEGIN
  -- Check if already liked
  SELECT EXISTS(
    SELECT 1 FROM likes WHERE user_id = p_user_id AND post_id = p_post_id
  ) INTO v_already_liked;

  IF v_already_liked THEN
    RETURN FALSE;
  END IF;

  -- Insert like
  INSERT INTO likes (user_id, post_id) VALUES (p_user_id, p_post_id);

  -- Increment likes count
  UPDATE posts SET likes_count = likes_count + 1 WHERE id = p_post_id;

  -- Create notification for post creator (if not self-like)
  INSERT INTO notifications (user_id, from_user_id, type, reference_type, reference_id)
  SELECT creator_id, p_user_id, 'like', 'post', p_post_id::TEXT
  FROM posts
  WHERE id = p_post_id AND creator_id != p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Atomic unlike post
CREATE OR REPLACE FUNCTION atomic_unlike_post(
  p_user_id BIGINT,
  p_post_id BIGINT
) RETURNS BOOLEAN AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Delete like and get count of deleted rows
  DELETE FROM likes WHERE user_id = p_user_id AND post_id = p_post_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN FALSE;
  END IF;

  -- Decrement likes count
  UPDATE posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = p_post_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- ATOMIC FOLLOW/UNFOLLOW USER
-- =============================================

-- Atomic follow user
CREATE OR REPLACE FUNCTION atomic_follow_user(
  p_follower_id BIGINT,
  p_following_id BIGINT
) RETURNS BOOLEAN AS $$
DECLARE
  v_already_following BOOLEAN;
BEGIN
  -- Can't follow yourself
  IF p_follower_id = p_following_id THEN
    RETURN FALSE;
  END IF;

  -- Check if already following
  SELECT EXISTS(
    SELECT 1 FROM follows WHERE follower_id = p_follower_id AND following_id = p_following_id
  ) INTO v_already_following;

  IF v_already_following THEN
    RETURN FALSE;
  END IF;

  -- Insert follow
  INSERT INTO follows (follower_id, following_id) VALUES (p_follower_id, p_following_id);

  -- Update follower's following_count
  UPDATE users SET following_count = following_count + 1 WHERE telegram_id = p_follower_id;

  -- Update followed user's followers_count
  UPDATE users SET followers_count = followers_count + 1 WHERE telegram_id = p_following_id;

  -- Create notification
  INSERT INTO notifications (user_id, from_user_id, type, reference_type, reference_id)
  VALUES (p_following_id, p_follower_id, 'follow', 'user', p_follower_id::TEXT);

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Atomic unfollow user
CREATE OR REPLACE FUNCTION atomic_unfollow_user(
  p_follower_id BIGINT,
  p_following_id BIGINT
) RETURNS BOOLEAN AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Delete follow
  DELETE FROM follows WHERE follower_id = p_follower_id AND following_id = p_following_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN
    RETURN FALSE;
  END IF;

  -- Update follower's following_count
  UPDATE users SET following_count = GREATEST(0, following_count - 1) WHERE telegram_id = p_follower_id;

  -- Update followed user's followers_count
  UPDATE users SET followers_count = GREATEST(0, followers_count - 1) WHERE telegram_id = p_following_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- ATOMIC COMMENT
-- =============================================

-- Atomic add comment (insert + increment count + notification)
CREATE OR REPLACE FUNCTION atomic_add_comment(
  p_user_id BIGINT,
  p_post_id BIGINT,
  p_content TEXT,
  p_reply_to_id BIGINT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  v_comment_id BIGINT;
  v_post_creator BIGINT;
  v_reply_user BIGINT;
BEGIN
  -- Get post creator
  SELECT creator_id INTO v_post_creator FROM posts WHERE id = p_post_id;

  IF v_post_creator IS NULL THEN
    RETURN NULL;
  END IF;

  -- Insert comment
  INSERT INTO comments (user_id, post_id, content, reply_to_id)
  VALUES (p_user_id, p_post_id, p_content, p_reply_to_id)
  RETURNING id INTO v_comment_id;

  -- Update comments count
  UPDATE posts SET comments_count = comments_count + 1 WHERE id = p_post_id;

  -- Create notification for post creator (if not self-comment)
  IF v_post_creator != p_user_id THEN
    INSERT INTO notifications (user_id, from_user_id, type, content, reference_type, reference_id)
    VALUES (v_post_creator, p_user_id, 'comment', LEFT(p_content, 100), 'post', p_post_id::TEXT);
  END IF;

  -- If this is a reply, notify the person being replied to
  IF p_reply_to_id IS NOT NULL THEN
    SELECT user_id INTO v_reply_user FROM comments WHERE id = p_reply_to_id;
    IF v_reply_user IS NOT NULL AND v_reply_user != p_user_id AND v_reply_user != v_post_creator THEN
      INSERT INTO notifications (user_id, from_user_id, type, content, reference_type, reference_id)
      VALUES (v_reply_user, p_user_id, 'comment', 'replied to your comment', 'comment', v_comment_id::TEXT);
    END IF;
  END IF;

  RETURN v_comment_id;
END;
$$ LANGUAGE plpgsql;

-- Atomic delete comment
CREATE OR REPLACE FUNCTION atomic_delete_comment(
  p_user_id BIGINT,
  p_comment_id BIGINT
) RETURNS BOOLEAN AS $$
DECLARE
  v_post_id BIGINT;
  v_comment_user BIGINT;
BEGIN
  -- Get comment info
  SELECT post_id, user_id INTO v_post_id, v_comment_user
  FROM comments WHERE id = p_comment_id;

  IF v_post_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Only allow comment owner to delete
  IF v_comment_user != p_user_id THEN
    RETURN FALSE;
  END IF;

  -- Delete comment
  DELETE FROM comments WHERE id = p_comment_id;

  -- Decrement comments count
  UPDATE posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = v_post_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- ATOMIC SAVE/UNSAVE POST
-- =============================================

CREATE OR REPLACE FUNCTION atomic_save_post(
  p_user_id BIGINT,
  p_post_id BIGINT
) RETURNS BOOLEAN AS $$
BEGIN
  INSERT INTO saved_posts (user_id, post_id)
  VALUES (p_user_id, p_post_id)
  ON CONFLICT (user_id, post_id) DO NOTHING;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION atomic_unsave_post(
  p_user_id BIGINT,
  p_post_id BIGINT
) RETURNS BOOLEAN AS $$
BEGIN
  DELETE FROM saved_posts WHERE user_id = p_user_id AND post_id = p_post_id;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- ATOMIC CREATE POST
-- =============================================

CREATE OR REPLACE FUNCTION atomic_create_post(
  p_creator_id BIGINT,
  p_content TEXT,
  p_media_url TEXT DEFAULT NULL,
  p_media_urls TEXT[] DEFAULT NULL,
  p_media_type TEXT DEFAULT 'text',
  p_media_thumbnail TEXT DEFAULT NULL,
  p_media_thumbnail_urls TEXT[] DEFAULT NULL,
  p_visibility TEXT DEFAULT 'public',
  p_is_nsfw BOOLEAN DEFAULT FALSE,
  p_unlock_price INTEGER DEFAULT 0,
  p_media_width INTEGER DEFAULT NULL,
  p_media_height INTEGER DEFAULT NULL,
  p_media_duration INTEGER DEFAULT NULL,
  p_media_size_bytes BIGINT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  v_post_id BIGINT;
BEGIN
  -- Insert post
  INSERT INTO posts (
    creator_id, content, media_url, media_urls, media_type,
    media_thumbnail, media_thumbnail_urls, visibility, is_nsfw, unlock_price,
    media_width, media_height, media_duration, media_size_bytes
  )
  VALUES (
    p_creator_id, p_content, p_media_url, p_media_urls, p_media_type,
    p_media_thumbnail, p_media_thumbnail_urls, p_visibility, p_is_nsfw, p_unlock_price,
    p_media_width, p_media_height, p_media_duration, p_media_size_bytes
  )
  RETURNING id INTO v_post_id;

  -- Update creator's posts_count
  UPDATE users SET posts_count = posts_count + 1 WHERE telegram_id = p_creator_id;

  RETURN v_post_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- ATOMIC DELETE POST
-- =============================================

CREATE OR REPLACE FUNCTION atomic_delete_post(
  p_user_id BIGINT,
  p_post_id BIGINT
) RETURNS BOOLEAN AS $$
DECLARE
  v_creator_id BIGINT;
BEGIN
  -- Get post creator
  SELECT creator_id INTO v_creator_id FROM posts WHERE id = p_post_id;

  IF v_creator_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Only allow creator to delete
  IF v_creator_id != p_user_id THEN
    RETURN FALSE;
  END IF;

  -- Delete related records
  DELETE FROM likes WHERE post_id = p_post_id;
  DELETE FROM saved_posts WHERE post_id = p_post_id;
  DELETE FROM comments WHERE post_id = p_post_id;
  DELETE FROM content_purchases WHERE post_id = p_post_id;
  DELETE FROM notifications WHERE reference_type = 'post' AND reference_id = p_post_id::TEXT;

  -- Delete post
  DELETE FROM posts WHERE id = p_post_id;

  -- Decrement creator's posts_count
  UPDATE users SET posts_count = GREATEST(0, posts_count - 1) WHERE telegram_id = v_creator_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- ADD MEDIA METADATA COLUMNS IF NOT EXISTS
-- =============================================

DO $$
BEGIN
  -- Add media_width column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'media_width') THEN
    ALTER TABLE posts ADD COLUMN media_width INTEGER;
  END IF;

  -- Add media_height column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'media_height') THEN
    ALTER TABLE posts ADD COLUMN media_height INTEGER;
  END IF;

  -- Add media_duration column if not exists (for videos, in seconds)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'media_duration') THEN
    ALTER TABLE posts ADD COLUMN media_duration INTEGER;
  END IF;

  -- Add media_size_bytes column if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'media_size_bytes') THEN
    ALTER TABLE posts ADD COLUMN media_size_bytes BIGINT;
  END IF;
END $$;

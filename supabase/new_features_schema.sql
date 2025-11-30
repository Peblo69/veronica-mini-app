-- ============================================
-- NEW FEATURES SCHEMA
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. COMMENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  likes_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_created ON comments(created_at DESC);

-- ============================================
-- 2. COMMENT LIKES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS comment_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id);
CREATE INDEX IF NOT EXISTS idx_comment_likes_user ON comment_likes(user_id);

-- ============================================
-- 3. ADD UPDATED_AT TO POSTS
-- ============================================

ALTER TABLE posts
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;

-- ============================================
-- 4. INCREMENT/DECREMENT COMMENTS FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION increment_comments(p_post_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE posts
  SET comments_count = comments_count + 1
  WHERE id = p_post_id;
END;
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_comments(p_post_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE posts
  SET comments_count = GREATEST(0, comments_count - 1)
  WHERE id = p_post_id;
END;
$func$ LANGUAGE plpgsql;

-- ============================================
-- 5. DECREMENT POSTS FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION decrement_posts(creator_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE users
  SET posts_count = GREATEST(0, posts_count - 1)
  WHERE telegram_id = creator_id;
END;
$func$ LANGUAGE plpgsql;

-- ============================================
-- 6. DECREMENT LIKES FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION decrement_likes(p_post_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE posts
  SET likes_count = GREATEST(0, likes_count - 1)
  WHERE id = p_post_id;
END;
$func$ LANGUAGE plpgsql;

-- ============================================
-- 7. RLS POLICIES FOR COMMENTS
-- ============================================

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;

-- Comments policies
DROP POLICY IF EXISTS "Anyone can view comments" ON comments;
CREATE POLICY "Anyone can view comments" ON comments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert comments" ON comments;
CREATE POLICY "Users can insert comments" ON comments
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own comments" ON comments;
CREATE POLICY "Users can update own comments" ON comments
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Users can delete own comments" ON comments;
CREATE POLICY "Users can delete own comments" ON comments
  FOR DELETE USING (true);

-- Comment likes policies
DROP POLICY IF EXISTS "Anyone can view comment likes" ON comment_likes;
CREATE POLICY "Anyone can view comment likes" ON comment_likes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can like comments" ON comment_likes;
CREATE POLICY "Users can like comments" ON comment_likes
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can unlike comments" ON comment_likes;
CREATE POLICY "Users can unlike comments" ON comment_likes
  FOR DELETE USING (true);

-- ============================================
-- 8. REALTIME FOR COMMENTS
-- ============================================

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE comments;
  END IF;
END $do$;

-- ============================================
-- 9. UPDATE MESSAGES TABLE FOR VOICE
-- ============================================

-- Ensure voice_duration column exists
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS voice_duration INTEGER DEFAULT 0;

-- ============================================
-- 10. TRIGGER FOR COMMENT LIKES COUNT
-- ============================================

CREATE OR REPLACE FUNCTION update_comment_likes_count()
RETURNS TRIGGER AS $func$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE comments SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.comment_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_comment_like_update ON comment_likes;
CREATE TRIGGER on_comment_like_update
  AFTER INSERT OR DELETE ON comment_likes
  FOR EACH ROW
  EXECUTE FUNCTION update_comment_likes_count();

-- ============================================
-- 11. TRIGGER FOR POST LIKES DECREMENT
-- ============================================

CREATE OR REPLACE FUNCTION update_post_likes_count()
RETURNS TRIGGER AS $func$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;

    -- Also decrement creator's total likes received
    UPDATE users SET likes_received = GREATEST(0, likes_received - 1)
    WHERE telegram_id = (SELECT creator_id FROM posts WHERE id = OLD.post_id);

    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    -- Also increment creator's total likes received
    UPDATE users SET likes_received = likes_received + 1
    WHERE telegram_id = (SELECT creator_id FROM posts WHERE id = NEW.post_id);

    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_post_like_update ON likes;
CREATE TRIGGER on_post_like_update
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW
  EXECUTE FUNCTION update_post_likes_count();

-- ============================================
-- DONE
-- ============================================

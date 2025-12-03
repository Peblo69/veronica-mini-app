-- ============================================
-- VERONICA MINI APP - COMPLETE REQUIRED SCHEMA
-- Run this ENTIRE file in Supabase SQL Editor
-- Last updated: 2025-12-01
-- ============================================

-- ============================================
-- 1. RPC FUNCTIONS - COUNT UPDATES
-- ============================================

-- Posts count
CREATE OR REPLACE FUNCTION increment_posts(creator_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE users SET posts_count = posts_count + 1 WHERE telegram_id = creator_id;
END;
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_posts(creator_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE users SET posts_count = GREATEST(0, posts_count - 1) WHERE telegram_id = creator_id;
END;
$func$ LANGUAGE plpgsql;

-- Likes count on posts
CREATE OR REPLACE FUNCTION increment_likes(p_post_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE posts SET likes_count = likes_count + 1 WHERE id = p_post_id;
END;
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_likes(p_post_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = p_post_id;
END;
$func$ LANGUAGE plpgsql;

-- Comments count on posts
CREATE OR REPLACE FUNCTION increment_comments(p_post_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE posts SET comments_count = comments_count + 1 WHERE id = p_post_id;
END;
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_comments(p_post_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = p_post_id;
END;
$func$ LANGUAGE plpgsql;

-- Followers count
CREATE OR REPLACE FUNCTION increment_followers(user_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE users SET followers_count = followers_count + 1 WHERE telegram_id = user_id;
END;
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_followers(user_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE users SET followers_count = GREATEST(0, followers_count - 1) WHERE telegram_id = user_id;
END;
$func$ LANGUAGE plpgsql;

-- Following count
CREATE OR REPLACE FUNCTION increment_following(user_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE users SET following_count = following_count + 1 WHERE telegram_id = user_id;
END;
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_following(user_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE users SET following_count = GREATEST(0, following_count - 1) WHERE telegram_id = user_id;
END;
$func$ LANGUAGE plpgsql;

-- Balance management
CREATE OR REPLACE FUNCTION add_to_balance(user_telegram_id BIGINT, amount_to_add DECIMAL)
RETURNS VOID AS $func$
BEGIN
  UPDATE users SET balance = balance + amount_to_add WHERE telegram_id = user_telegram_id;
END;
$func$ LANGUAGE plpgsql;

-- ============================================
-- 2. TRIGGERS - AUTOMATIC COUNT UPDATES
-- ============================================

-- Trigger: Update creator's total likes_received when posts get liked/unliked
CREATE OR REPLACE FUNCTION update_creator_likes_received()
RETURNS TRIGGER AS $func$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE users SET likes_received = GREATEST(0, likes_received - 1)
    WHERE telegram_id = (SELECT creator_id FROM posts WHERE id = OLD.post_id);
    RETURN OLD;
  ELSIF TG_OP = 'INSERT' THEN
    UPDATE users SET likes_received = likes_received + 1
    WHERE telegram_id = (SELECT creator_id FROM posts WHERE id = NEW.post_id);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_post_like_update ON likes;
DROP TRIGGER IF EXISTS on_creator_likes_update ON likes;
CREATE TRIGGER on_creator_likes_update
  AFTER INSERT OR DELETE ON likes
  FOR EACH ROW
  EXECUTE FUNCTION update_creator_likes_received();

-- Trigger: Update comment likes count
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

-- Trigger: Create notification when someone follows
CREATE OR REPLACE FUNCTION create_follow_notification()
RETURNS TRIGGER AS $func$
DECLARE
  should_notify BOOLEAN := COALESCE(
    (SELECT notifications_follows FROM user_settings WHERE user_id = NEW.following_id),
    TRUE
  );
BEGIN
  IF NOT should_notify THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, from_user_id, type, content)
  VALUES (NEW.following_id, NEW.follower_id, 'follow', 'started following you');
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_follow_notification ON follows;
CREATE TRIGGER on_follow_notification
  AFTER INSERT ON follows
  FOR EACH ROW
  EXECUTE FUNCTION create_follow_notification();

-- Trigger: Create notification when someone likes a post
CREATE OR REPLACE FUNCTION create_like_notification()
RETURNS TRIGGER AS $func$
DECLARE
  v_post_creator_id BIGINT;
  should_notify BOOLEAN;
BEGIN
  SELECT creator_id INTO v_post_creator_id FROM posts WHERE id = NEW.post_id;

  IF v_post_creator_id IS NULL OR v_post_creator_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(notifications_likes, TRUE)
    INTO should_notify
    FROM user_settings
    WHERE user_id = v_post_creator_id;

  IF should_notify IS NOT FALSE THEN
    INSERT INTO notifications (user_id, from_user_id, type, content, reference_id, reference_type)
    VALUES (v_post_creator_id, NEW.user_id, 'like', 'liked your post', NEW.post_id::TEXT, 'post');
  END IF;

  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_like_notification ON likes;
CREATE TRIGGER on_like_notification
  AFTER INSERT ON likes
  FOR EACH ROW
  EXECUTE FUNCTION create_like_notification();

-- Enforce DM privacy preferences
CREATE OR REPLACE FUNCTION enforce_message_privacy()
RETURNS TRIGGER AS $func$
DECLARE
  conv RECORD;
  target_user BIGINT;
  preference TEXT;
  allowed BOOLEAN;
BEGIN
  SELECT participant_1, participant_2 INTO conv
  FROM conversations
  WHERE id = NEW.conversation_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF conv.participant_1 = NEW.sender_id THEN
    target_user := conv.participant_2;
  ELSE
    target_user := conv.participant_1;
  END IF;

  IF target_user IS NULL OR target_user = NEW.sender_id THEN
    RETURN NEW;
  END IF;

  SELECT allow_messages_from INTO preference
  FROM user_settings
  WHERE user_id = target_user;

  IF preference IS NULL OR preference = 'everyone' THEN
    RETURN NEW;
  ELSIF preference = 'nobody' THEN
    RAISE EXCEPTION 'User is not accepting messages at this time.';
  ELSIF preference = 'followers' THEN
    SELECT EXISTS (
      SELECT 1 FROM follows
      WHERE follower_id = NEW.sender_id
        AND following_id = target_user
    ) INTO allowed;

    IF NOT allowed THEN
      RAISE EXCEPTION 'User only accepts messages from followers.';
    END IF;
  ELSIF preference = 'subscribers' THEN
    SELECT EXISTS (
      SELECT 1 FROM subscriptions
      WHERE subscriber_id = NEW.sender_id
        AND creator_id = target_user
        AND is_active = TRUE
    ) INTO allowed;

    IF NOT allowed THEN
      RAISE EXCEPTION 'User only accepts messages from subscribers.';
    END IF;
  END IF;

  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_message_privacy ON messages;
CREATE TRIGGER enforce_message_privacy
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION enforce_message_privacy();

-- ============================================
-- 3. TABLE UPDATES - ADD MISSING COLUMNS
-- ============================================

-- Posts table: add updated_at if missing
ALTER TABLE posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_thumbnail TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_thumbnail_urls TEXT[];

-- Messages table: add voice_duration if missing
ALTER TABLE messages ADD COLUMN IF NOT EXISTS voice_duration INTEGER DEFAULT 0;

-- Notifications table: add reference columns if missing
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reference_id TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50);

-- Subscriptions table: add expires_at if missing
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- ============================================
-- 4. COMMENTS TABLE (if not exists)
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

-- ============================================
-- 5. COMMENT LIKES TABLE (if not exists)
-- ============================================

CREATE TABLE IF NOT EXISTS comment_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(comment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comment_likes_comment ON comment_likes(comment_id);

-- ============================================
-- 6. TRANSACTIONS TABLE (if not exists)
-- ============================================

CREATE TABLE IF NOT EXISTS transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  type VARCHAR(50) NOT NULL,
  description TEXT,
  reference_id TEXT,
  reference_type VARCHAR(50),
  status VARCHAR(20) DEFAULT 'completed',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);

-- ============================================
-- 7. ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users policies
DROP POLICY IF EXISTS "Anyone can view users" ON users;
CREATE POLICY "Anyone can view users" ON users FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Users can insert" ON users;
CREATE POLICY "Users can insert" ON users FOR INSERT WITH CHECK (true);

-- Posts policies
DROP POLICY IF EXISTS "Anyone can view posts" ON posts;
CREATE POLICY "Anyone can view posts" ON posts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Creators can insert posts" ON posts;
CREATE POLICY "Creators can insert posts" ON posts FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Creators can update own posts" ON posts;
CREATE POLICY "Creators can update own posts" ON posts FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Creators can delete own posts" ON posts;
CREATE POLICY "Creators can delete own posts" ON posts FOR DELETE USING (true);

-- Likes policies
DROP POLICY IF EXISTS "Anyone can view likes" ON likes;
CREATE POLICY "Anyone can view likes" ON likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can like" ON likes;
CREATE POLICY "Users can like" ON likes FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users can unlike" ON likes;
CREATE POLICY "Users can unlike" ON likes FOR DELETE USING (true);

-- Follows policies
DROP POLICY IF EXISTS "Anyone can view follows" ON follows;
CREATE POLICY "Anyone can view follows" ON follows FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can follow" ON follows;
CREATE POLICY "Users can follow" ON follows FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users can unfollow" ON follows;
CREATE POLICY "Users can unfollow" ON follows FOR DELETE USING (true);

-- Saved posts policies
DROP POLICY IF EXISTS "Anyone can view saved" ON saved_posts;
CREATE POLICY "Anyone can view saved" ON saved_posts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can save" ON saved_posts;
CREATE POLICY "Users can save" ON saved_posts FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users can unsave" ON saved_posts;
CREATE POLICY "Users can unsave" ON saved_posts FOR DELETE USING (true);

-- Comments policies
DROP POLICY IF EXISTS "Anyone can view comments" ON comments;
CREATE POLICY "Anyone can view comments" ON comments FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert comments" ON comments;
CREATE POLICY "Users can insert comments" ON comments FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users can update own comments" ON comments;
CREATE POLICY "Users can update own comments" ON comments FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Users can delete own comments" ON comments;
CREATE POLICY "Users can delete own comments" ON comments FOR DELETE USING (true);

-- Comment likes policies
DROP POLICY IF EXISTS "Anyone can view comment likes" ON comment_likes;
CREATE POLICY "Anyone can view comment likes" ON comment_likes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can like comments" ON comment_likes;
CREATE POLICY "Users can like comments" ON comment_likes FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users can unlike comments" ON comment_likes;
CREATE POLICY "Users can unlike comments" ON comment_likes FOR DELETE USING (true);

-- Notifications policies
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert notifications" ON notifications;
CREATE POLICY "Users can insert notifications" ON notifications FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications" ON notifications FOR DELETE USING (true);

-- Transactions policies
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
CREATE POLICY "Users can view own transactions" ON transactions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert own transactions" ON transactions;
CREATE POLICY "Users can insert own transactions" ON transactions FOR INSERT WITH CHECK (true);

-- Conversations policies
DROP POLICY IF EXISTS "Users can view own conversations" ON conversations;
CREATE POLICY "Users can view own conversations" ON conversations FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert conversations" ON conversations;
CREATE POLICY "Users can insert conversations" ON conversations FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users can update own conversations" ON conversations;
CREATE POLICY "Users can update own conversations" ON conversations FOR UPDATE USING (true);

-- Messages policies
DROP POLICY IF EXISTS "Users can view messages" ON messages;
CREATE POLICY "Users can view messages" ON messages FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can send messages" ON messages;
CREATE POLICY "Users can send messages" ON messages FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users can update own messages" ON messages;
CREATE POLICY "Users can update own messages" ON messages FOR UPDATE USING (true);

-- Subscriptions policies
DROP POLICY IF EXISTS "Anyone can view subscriptions" ON subscriptions;
CREATE POLICY "Anyone can view subscriptions" ON subscriptions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can subscribe" ON subscriptions;
CREATE POLICY "Users can subscribe" ON subscriptions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users can update subscriptions" ON subscriptions;
CREATE POLICY "Users can update subscriptions" ON subscriptions FOR UPDATE USING (true);

-- Content purchases policies (if table exists)
DO $do$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'content_purchases') THEN
    EXECUTE 'ALTER TABLE content_purchases ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Anyone can view purchases" ON content_purchases';
    EXECUTE 'CREATE POLICY "Anyone can view purchases" ON content_purchases FOR SELECT USING (true)';
    EXECUTE 'DROP POLICY IF EXISTS "Users can purchase" ON content_purchases';
    EXECUTE 'CREATE POLICY "Users can purchase" ON content_purchases FOR INSERT WITH CHECK (true)';
  END IF;
END $do$;

-- ============================================
-- 8. REALTIME SUBSCRIPTIONS
-- ============================================

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
END $do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE comments;
  END IF;
END $do$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
  END IF;
END $do$;

-- ============================================
-- DONE! Your database should now be fully configured.
-- ============================================

SELECT 'Schema setup complete!' as status;

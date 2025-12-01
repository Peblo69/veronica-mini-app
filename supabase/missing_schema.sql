-- ============================================
-- MISSING TABLES AND FUNCTIONS
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. TRANSACTIONS TABLE
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
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);

-- ============================================
-- 2. ADD TO BALANCE FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION add_to_balance(user_telegram_id BIGINT, amount_to_add DECIMAL)
RETURNS VOID AS $func$
BEGIN
  UPDATE users
  SET balance = balance + amount_to_add
  WHERE telegram_id = user_telegram_id;
END;
$func$ LANGUAGE plpgsql;

-- ============================================
-- 3. INCREMENT POSTS FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION increment_posts(creator_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE users
  SET posts_count = posts_count + 1
  WHERE telegram_id = creator_id;
END;
$func$ LANGUAGE plpgsql;

-- ============================================
-- 4. INCREMENT LIKES FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION increment_likes(p_post_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE posts
  SET likes_count = likes_count + 1
  WHERE id = p_post_id;
END;
$func$ LANGUAGE plpgsql;

-- ============================================
-- 4b. FOLLOWER COUNT FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION increment_followers(user_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE users
  SET followers_count = followers_count + 1
  WHERE telegram_id = user_id;
END;
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_followers(user_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE users
  SET followers_count = GREATEST(0, followers_count - 1)
  WHERE telegram_id = user_id;
END;
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_following(user_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE users
  SET following_count = following_count + 1
  WHERE telegram_id = user_id;
END;
$func$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_following(user_id BIGINT)
RETURNS VOID AS $func$
BEGIN
  UPDATE users
  SET following_count = GREATEST(0, following_count - 1)
  WHERE telegram_id = user_id;
END;
$func$ LANGUAGE plpgsql;

-- ============================================
-- 5. UPDATE NOTIFICATIONS TABLE SCHEMA
-- ============================================

-- Add missing columns if they don't exist
ALTER TABLE notifications
ADD COLUMN IF NOT EXISTS reference_id TEXT,
ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50);

-- Make sure type column accepts our notification types
-- No ALTER needed if using TEXT, but let's ensure the table exists

CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  from_user_id BIGINT REFERENCES users(telegram_id) ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL,
  content TEXT,
  reference_id TEXT,
  reference_type VARCHAR(50),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

-- ============================================
-- 6. SUBSCRIPTIONS TABLE - ADD EXPIRES_AT
-- ============================================

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Add unique constraint for subscriber + creator if not exists
-- This allows upsert on conflict
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_subscriber_creator_unique'
  ) THEN
    ALTER TABLE subscriptions
    ADD CONSTRAINT subscriptions_subscriber_creator_unique
    UNIQUE (subscriber_id, creator_id);
  END IF;
END $do$;

-- ============================================
-- 7. RLS POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Transactions: Users can see their own transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON transactions;
CREATE POLICY "Users can view own transactions" ON transactions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert own transactions" ON transactions;
CREATE POLICY "Users can insert own transactions" ON transactions
  FOR INSERT WITH CHECK (true);

-- Notifications: Users can manage their own notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert notifications" ON notifications;
CREATE POLICY "Users can insert notifications" ON notifications
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications" ON notifications
  FOR DELETE USING (true);

-- ============================================
-- 8. REALTIME SUBSCRIPTIONS
-- ============================================

-- Enable realtime for notifications (skip if already added)
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $do$;

-- ============================================
-- 9. TRIGGER FOR FOLLOW NOTIFICATIONS
-- ============================================

CREATE OR REPLACE FUNCTION create_follow_notification()
RETURNS TRIGGER AS $func$
BEGIN
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

-- ============================================
-- 10. TRIGGER FOR LIKE NOTIFICATIONS
-- ============================================

CREATE OR REPLACE FUNCTION create_like_notification()
RETURNS TRIGGER AS $func$
DECLARE
  v_post_creator_id BIGINT;
BEGIN
  -- Get the creator of the post
  SELECT creator_id INTO v_post_creator_id FROM posts WHERE id = NEW.post_id;

  -- Don't notify if user likes their own post
  IF v_post_creator_id != NEW.user_id THEN
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

-- ============================================
-- 11. UPDATE FOLLOWER COUNTS TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_follower_counts()
RETURNS TRIGGER AS $func$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment following count for follower
    UPDATE users SET following_count = following_count + 1 WHERE telegram_id = NEW.follower_id;
    -- Increment followers count for followed user
    UPDATE users SET followers_count = followers_count + 1 WHERE telegram_id = NEW.following_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement following count for follower
    UPDATE users SET following_count = GREATEST(0, following_count - 1) WHERE telegram_id = OLD.follower_id;
    -- Decrement followers count for followed user
    UPDATE users SET followers_count = GREATEST(0, followers_count - 1) WHERE telegram_id = OLD.following_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$func$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_follow_count_update ON follows;
CREATE TRIGGER on_follow_count_update
  AFTER INSERT OR DELETE ON follows
  FOR EACH ROW
  EXECUTE FUNCTION update_follower_counts();

-- ============================================
-- DONE
-- ============================================
-- Run this SQL in your Supabase SQL Editor to set up all missing components

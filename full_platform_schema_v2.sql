-- =====================================================
-- VERONICA PLATFORM - COMPLETE DATABASE SCHEMA V2
-- Handles existing tables properly
-- =====================================================

-- First, drop tables that might conflict (in correct order due to dependencies)
DROP TABLE IF EXISTS message_reactions CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS livestream_messages CASCADE;
DROP TABLE IF EXISTS livestream_viewers CASCADE;
DROP TABLE IF EXISTS livestreams CASCADE;
DROP TABLE IF EXISTS story_reactions CASCADE;
DROP TABLE IF EXISTS story_views CASCADE;
DROP TABLE IF EXISTS stories CASCADE;
DROP TABLE IF EXISTS comment_likes CASCADE;
DROP TABLE IF EXISTS post_comments CASCADE;
DROP TABLE IF EXISTS post_media CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS subscription_tiers CASCADE;
DROP TABLE IF EXISTS token_transactions CASCADE;
DROP TABLE IF EXISTS token_packages CASCADE;
DROP TABLE IF EXISTS gifts CASCADE;
DROP TABLE IF EXISTS creator_earnings CASCADE;
DROP TABLE IF EXISTS payouts CASCADE;

-- =====================================================
-- 1. VIRTUAL CURRENCY & GIFTS SYSTEM
-- =====================================================

-- Gift catalog (animated gifts users can send)
CREATE TABLE gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  animation_url TEXT,
  image_url TEXT,
  category TEXT DEFAULT 'standard',
  is_animated BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Token transaction history
CREATE TABLE token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  transaction_type TEXT NOT NULL,
  reference_id UUID,
  reference_type TEXT,
  description TEXT,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Token purchase packages
CREATE TABLE token_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  price_stars INTEGER NOT NULL,
  bonus_tokens INTEGER DEFAULT 0,
  is_popular BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0
);

-- =====================================================
-- 2. REAL-TIME MESSAGING SYSTEM
-- =====================================================

-- Conversations (DM threads between users)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1 BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  participant_2 BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_preview TEXT,
  participant_1_unread INTEGER DEFAULT 0,
  participant_2_unread INTEGER DEFAULT 0,
  is_participant_1_blocked BOOLEAN DEFAULT false,
  is_participant_2_blocked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(participant_1, participant_2)
);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  content TEXT,
  message_type TEXT DEFAULT 'text',
  media_url TEXT,
  media_thumbnail TEXT,
  is_ppv BOOLEAN DEFAULT false,
  ppv_price INTEGER DEFAULT 0,
  ppv_unlocked_by BIGINT[],
  gift_id UUID REFERENCES gifts(id),
  tip_amount INTEGER,
  is_read BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message reactions
CREATE TABLE message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  reaction TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

-- =====================================================
-- 3. LIVESTREAM SYSTEM
-- =====================================================

CREATE TABLE livestreams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  status TEXT DEFAULT 'scheduled',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  is_private BOOLEAN DEFAULT false,
  entry_price INTEGER DEFAULT 0,
  room_name TEXT UNIQUE,
  viewer_count INTEGER DEFAULT 0,
  peak_viewers INTEGER DEFAULT 0,
  total_gifts_received INTEGER DEFAULT 0,
  total_tips_received INTEGER DEFAULT 0,
  recording_url TEXT,
  is_recording_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE livestream_viewers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  livestream_id UUID REFERENCES livestreams(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  watch_duration INTEGER DEFAULT 0,
  is_currently_watching BOOLEAN DEFAULT true,
  UNIQUE(livestream_id, user_id)
);

CREATE TABLE livestream_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  livestream_id UUID REFERENCES livestreams(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  content TEXT,
  message_type TEXT DEFAULT 'chat',
  gift_id UUID REFERENCES gifts(id),
  tip_amount INTEGER,
  is_pinned BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. SUBSCRIPTION SYSTEM
-- =====================================================

CREATE TABLE subscription_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  benefits TEXT[],
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  creator_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  tier_id UUID REFERENCES subscription_tiers(id),
  status TEXT DEFAULT 'active',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  auto_renew BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(subscriber_id, creator_id)
);

-- =====================================================
-- 5. ENHANCED POSTS
-- =====================================================

CREATE TABLE post_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id BIGINT REFERENCES posts(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  width INTEGER,
  height INTEGER,
  duration INTEGER,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id BIGINT REFERENCES posts(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  parent_id UUID REFERENCES post_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  likes_count INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID REFERENCES post_comments(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(comment_id, user_id)
);

-- =====================================================
-- 6. NOTIFICATIONS (update existing or create new)
-- =====================================================

-- Drop and recreate notifications table with proper structure
DROP TABLE IF EXISTS notifications CASCADE;

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  reference_id UUID,
  reference_type TEXT,
  actor_id BIGINT REFERENCES users(telegram_id),
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 7. STORIES SYSTEM
-- =====================================================

CREATE TABLE stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration INTEGER DEFAULT 5,
  visibility TEXT DEFAULT 'public',
  has_poll BOOLEAN DEFAULT false,
  poll_question TEXT,
  poll_options JSONB,
  view_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE story_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(story_id, viewer_id)
);

CREATE TABLE story_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  reaction TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(story_id, user_id)
);

-- =====================================================
-- 8. CREATOR EARNINGS & PAYOUTS
-- =====================================================

CREATE TABLE creator_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_id UUID,
  from_user_id BIGINT REFERENCES users(telegram_id),
  platform_fee INTEGER DEFAULT 0,
  net_amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  payout_method TEXT,
  payout_details JSONB,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 9. INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_conversations_participant1 ON conversations(participant_1, last_message_at DESC);
CREATE INDEX idx_conversations_participant2 ON conversations(participant_2, last_message_at DESC);
CREATE INDEX idx_livestreams_creator ON livestreams(creator_id);
CREATE INDEX idx_livestreams_status ON livestreams(status);
CREATE INDEX idx_livestream_messages_stream ON livestream_messages(livestream_id, created_at DESC);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_stories_creator ON stories(creator_id, created_at DESC);
CREATE INDEX idx_stories_expires ON stories(expires_at);
CREATE INDEX idx_earnings_creator ON creator_earnings(creator_id, created_at DESC);

-- =====================================================
-- 10. REALTIME SUBSCRIPTIONS
-- =====================================================

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE livestream_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- =====================================================
-- 11. DEFAULT DATA - GIFT CATALOG
-- =====================================================

INSERT INTO gifts (name, description, price, category, sort_order) VALUES
  ('Heart', 'Show some love', 5, 'standard', 1),
  ('Fire', 'This is fire!', 10, 'standard', 2),
  ('Star', 'You are a star', 20, 'standard', 3),
  ('Diamond', 'Precious moment', 50, 'premium', 4),
  ('Crown', 'Royalty treatment', 100, 'premium', 5),
  ('Rocket', 'To the moon!', 200, 'premium', 6),
  ('Rose', 'A beautiful rose', 25, 'standard', 7),
  ('Kiss', 'Sending a kiss', 15, 'standard', 8),
  ('Unicorn', 'Magical moment', 150, 'exclusive', 9),
  ('Money Bag', 'Big spender', 500, 'exclusive', 10);

-- =====================================================
-- 12. DEFAULT TOKEN PACKAGES
-- =====================================================

INSERT INTO token_packages (name, tokens, price_stars, bonus_tokens, is_popular, sort_order) VALUES
  ('Starter', 100, 50, 0, false, 1),
  ('Popular', 500, 200, 50, true, 2),
  ('Value', 1000, 350, 150, false, 3),
  ('Premium', 2500, 750, 500, false, 4),
  ('Ultimate', 5000, 1200, 1500, false, 5);

-- =====================================================
-- 13. ROW LEVEL SECURITY POLICIES
-- =====================================================

ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE livestreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE livestream_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;

-- Policies for all tables
CREATE POLICY "Public read gifts" ON gifts FOR SELECT USING (true);
CREATE POLICY "Public read token_packages" ON token_packages FOR SELECT USING (true);

CREATE POLICY "All access token_transactions" ON token_transactions FOR ALL USING (true);
CREATE POLICY "All access conversations" ON conversations FOR ALL USING (true);
CREATE POLICY "All access messages" ON messages FOR ALL USING (true);
CREATE POLICY "All access message_reactions" ON message_reactions FOR ALL USING (true);
CREATE POLICY "All access livestreams" ON livestreams FOR ALL USING (true);
CREATE POLICY "All access livestream_viewers" ON livestream_viewers FOR ALL USING (true);
CREATE POLICY "All access livestream_messages" ON livestream_messages FOR ALL USING (true);
CREATE POLICY "All access subscription_tiers" ON subscription_tiers FOR ALL USING (true);
CREATE POLICY "All access subscriptions" ON subscriptions FOR ALL USING (true);
CREATE POLICY "All access post_media" ON post_media FOR ALL USING (true);
CREATE POLICY "All access post_comments" ON post_comments FOR ALL USING (true);
CREATE POLICY "All access comment_likes" ON comment_likes FOR ALL USING (true);
CREATE POLICY "All access notifications" ON notifications FOR ALL USING (true);
CREATE POLICY "All access stories" ON stories FOR ALL USING (true);
CREATE POLICY "All access story_views" ON story_views FOR ALL USING (true);
CREATE POLICY "All access story_reactions" ON story_reactions FOR ALL USING (true);
CREATE POLICY "All access creator_earnings" ON creator_earnings FOR ALL USING (true);
CREATE POLICY "All access payouts" ON payouts FOR ALL USING (true);

-- Add columns to follows table if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'follows' AND column_name = 'notifications_enabled') THEN
    ALTER TABLE follows ADD COLUMN notifications_enabled BOOLEAN DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'follows' AND column_name = 'is_favorite') THEN
    ALTER TABLE follows ADD COLUMN is_favorite BOOLEAN DEFAULT false;
  END IF;
END $$;

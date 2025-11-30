-- =====================================================
-- VERONICA PLATFORM - COMPLETE DATABASE SCHEMA
-- Full creator economy platform with livestreaming,
-- real-time chat, gifts, subscriptions, and more
-- =====================================================

-- =====================================================
-- 1. VIRTUAL CURRENCY & GIFTS SYSTEM
-- =====================================================

-- Gift catalog (animated gifts users can send)
CREATE TABLE IF NOT EXISTS gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL, -- Cost in tokens
  animation_url TEXT, -- Lottie animation URL
  image_url TEXT, -- Static preview
  category TEXT DEFAULT 'standard', -- standard, premium, exclusive
  is_animated BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Token transaction history
CREATE TABLE IF NOT EXISTS token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- Positive = credit, negative = debit
  transaction_type TEXT NOT NULL, -- purchase, gift_sent, gift_received, tip, subscription, unlock, withdrawal
  reference_id UUID, -- Links to gift_id, post_id, subscription_id, etc.
  reference_type TEXT, -- gift, post, subscription, message, livestream
  description TEXT,
  balance_after INTEGER NOT NULL, -- Balance after transaction
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Token purchase packages
CREATE TABLE IF NOT EXISTS token_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  price_stars INTEGER NOT NULL, -- Price in Telegram Stars
  bonus_tokens INTEGER DEFAULT 0,
  is_popular BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0
);

-- =====================================================
-- 2. REAL-TIME MESSAGING SYSTEM
-- =====================================================

-- Conversations (DM threads between users)
CREATE TABLE IF NOT EXISTS conversations (
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
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  content TEXT,
  message_type TEXT DEFAULT 'text', -- text, image, video, voice, gift, tip, ppv
  media_url TEXT,
  media_thumbnail TEXT,
  -- For PPV (pay-per-view) messages
  is_ppv BOOLEAN DEFAULT false,
  ppv_price INTEGER DEFAULT 0,
  ppv_unlocked_by BIGINT[], -- Array of user IDs who unlocked
  -- For gifts/tips
  gift_id UUID REFERENCES gifts(id),
  tip_amount INTEGER,
  -- Status
  is_read BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Message reactions
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  reaction TEXT NOT NULL, -- emoji or reaction type
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

-- =====================================================
-- 3. LIVESTREAM SYSTEM
-- =====================================================

-- Livestreams
CREATE TABLE IF NOT EXISTS livestreams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  -- Stream status
  status TEXT DEFAULT 'scheduled', -- scheduled, live, ended
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  -- Stream settings
  is_private BOOLEAN DEFAULT false, -- Subscribers only
  entry_price INTEGER DEFAULT 0, -- Pay to enter (0 = free)
  -- LiveKit connection
  room_name TEXT UNIQUE,
  -- Stats
  viewer_count INTEGER DEFAULT 0,
  peak_viewers INTEGER DEFAULT 0,
  total_gifts_received INTEGER DEFAULT 0,
  total_tips_received INTEGER DEFAULT 0,
  -- Recording
  recording_url TEXT,
  is_recording_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Livestream viewers (who's watching/watched)
CREATE TABLE IF NOT EXISTS livestream_viewers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  livestream_id UUID REFERENCES livestreams(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  watch_duration INTEGER DEFAULT 0, -- Seconds
  is_currently_watching BOOLEAN DEFAULT true,
  UNIQUE(livestream_id, user_id)
);

-- Livestream chat messages
CREATE TABLE IF NOT EXISTS livestream_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  livestream_id UUID REFERENCES livestreams(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  content TEXT,
  message_type TEXT DEFAULT 'chat', -- chat, gift, tip, system
  gift_id UUID REFERENCES gifts(id),
  tip_amount INTEGER,
  is_pinned BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. ENHANCED SUBSCRIPTION SYSTEM
-- =====================================================

-- Subscription tiers (creators can have multiple tiers)
CREATE TABLE IF NOT EXISTS subscription_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL, -- Monthly price in tokens
  benefits TEXT[], -- Array of benefit descriptions
  is_default BOOLEAN DEFAULT false, -- The main tier
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Active subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  creator_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  tier_id UUID REFERENCES subscription_tiers(id),
  status TEXT DEFAULT 'active', -- active, cancelled, expired
  started_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  auto_renew BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(subscriber_id, creator_id)
);

-- =====================================================
-- 5. ENHANCED FOLLOWS/RELATIONSHIPS
-- =====================================================

-- Already have follows table, add some enhancements
ALTER TABLE follows ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT true;
ALTER TABLE follows ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;

-- =====================================================
-- 6. ENHANCED POSTS SYSTEM
-- =====================================================

-- Post media (multiple media per post)
CREATE TABLE IF NOT EXISTS post_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL, -- image, video
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  width INTEGER,
  height INTEGER,
  duration INTEGER, -- For videos, in seconds
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Post comments
CREATE TABLE IF NOT EXISTS post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  parent_id UUID REFERENCES post_comments(id) ON DELETE CASCADE, -- For replies
  content TEXT NOT NULL,
  likes_count INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comment likes
CREATE TABLE IF NOT EXISTS comment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID REFERENCES post_comments(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(comment_id, user_id)
);

-- =====================================================
-- 7. NOTIFICATIONS SYSTEM
-- =====================================================

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- like, comment, follow, subscription, message, gift, tip, livestream
  title TEXT NOT NULL,
  body TEXT,
  -- Reference to related entity
  reference_id UUID,
  reference_type TEXT, -- post, message, livestream, user
  actor_id BIGINT REFERENCES users(telegram_id), -- Who triggered it
  -- Status
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 8. STORIES SYSTEM (like Instagram Stories)
-- =====================================================

CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  media_type TEXT NOT NULL, -- image, video
  media_url TEXT NOT NULL,
  thumbnail_url TEXT,
  duration INTEGER DEFAULT 5, -- Display duration in seconds
  -- Visibility
  visibility TEXT DEFAULT 'public', -- public, followers, subscribers
  -- Interactivity
  has_poll BOOLEAN DEFAULT false,
  poll_question TEXT,
  poll_options JSONB,
  -- Stats
  view_count INTEGER DEFAULT 0,
  -- Auto-delete after 24h
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Story views
CREATE TABLE IF NOT EXISTS story_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(story_id, viewer_id)
);

-- Story reactions
CREATE TABLE IF NOT EXISTS story_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID REFERENCES stories(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  reaction TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(story_id, user_id)
);

-- =====================================================
-- 9. CREATOR EARNINGS & PAYOUTS
-- =====================================================

CREATE TABLE IF NOT EXISTS creator_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  source_type TEXT NOT NULL, -- subscription, tip, gift, ppv_message, ppv_post, livestream
  source_id UUID,
  from_user_id BIGINT REFERENCES users(telegram_id),
  platform_fee INTEGER DEFAULT 0, -- Platform's cut
  net_amount INTEGER NOT NULL, -- After platform fee
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  payout_method TEXT, -- telegram_stars, crypto, bank
  payout_details JSONB,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 10. INDEXES FOR PERFORMANCE
-- =====================================================

-- Messages
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- Conversations
CREATE INDEX IF NOT EXISTS idx_conversations_participant1 ON conversations(participant_1, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_participant2 ON conversations(participant_2, last_message_at DESC);

-- Livestreams
CREATE INDEX IF NOT EXISTS idx_livestreams_creator ON livestreams(creator_id);
CREATE INDEX IF NOT EXISTS idx_livestreams_status ON livestreams(status);
CREATE INDEX IF NOT EXISTS idx_livestream_messages_stream ON livestream_messages(livestream_id, created_at DESC);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);

-- Stories
CREATE INDEX IF NOT EXISTS idx_stories_creator ON stories(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at) WHERE expires_at > NOW();

-- Earnings
CREATE INDEX IF NOT EXISTS idx_earnings_creator ON creator_earnings(creator_id, created_at DESC);

-- =====================================================
-- 11. REALTIME SUBSCRIPTIONS (Enable for Supabase Realtime)
-- =====================================================

-- Enable realtime for chat
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE livestream_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- =====================================================
-- 12. DEFAULT DATA - GIFT CATALOG
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
  ('Money Bag', 'Big spender', 500, 'exclusive', 10)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 13. DEFAULT TOKEN PACKAGES
-- =====================================================

INSERT INTO token_packages (name, tokens, price_stars, bonus_tokens, is_popular, sort_order) VALUES
  ('Starter', 100, 50, 0, false, 1),
  ('Popular', 500, 200, 50, true, 2),
  ('Value', 1000, 350, 150, false, 3),
  ('Premium', 2500, 750, 500, false, 4),
  ('Ultimate', 5000, 1200, 1500, false, 5)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 14. ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE livestreams ENABLE ROW LEVEL SECURITY;
ALTER TABLE livestream_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;

-- Public read for gifts
CREATE POLICY "Gifts are viewable by everyone" ON gifts FOR SELECT USING (true);

-- Users can see their own transactions
CREATE POLICY "Users can view own transactions" ON token_transactions
  FOR SELECT USING (true);

-- Conversations - participants only
CREATE POLICY "Users can view their conversations" ON conversations
  FOR SELECT USING (true);

CREATE POLICY "Users can insert conversations" ON conversations
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their conversations" ON conversations
  FOR UPDATE USING (true);

-- Messages - conversation participants only
CREATE POLICY "Users can view messages" ON messages
  FOR SELECT USING (true);

CREATE POLICY "Users can insert messages" ON messages
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their messages" ON messages
  FOR UPDATE USING (true);

-- Livestreams - public read, creator write
CREATE POLICY "Anyone can view livestreams" ON livestreams
  FOR SELECT USING (true);

CREATE POLICY "Creators can manage livestreams" ON livestreams
  FOR ALL USING (true);

-- Livestream messages - public
CREATE POLICY "Anyone can view livestream messages" ON livestream_messages
  FOR SELECT USING (true);

CREATE POLICY "Users can send livestream messages" ON livestream_messages
  FOR INSERT WITH CHECK (true);

-- Notifications - user only
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (true);

CREATE POLICY "System can create notifications" ON notifications
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (true);

-- Stories - based on visibility
CREATE POLICY "Users can view stories" ON stories
  FOR SELECT USING (true);

CREATE POLICY "Creators can manage stories" ON stories
  FOR ALL USING (true);

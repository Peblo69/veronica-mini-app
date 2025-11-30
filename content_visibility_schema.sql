-- =============================================
-- CONTENT VISIBILITY & SOCIAL FEATURES UPDATE
-- Run this in Supabase SQL Editor
-- =============================================

-- Update posts table with visibility tiers
ALTER TABLE posts ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'public';
-- 'public' = everyone can see
-- 'followers' = only followers can see
-- 'subscribers' = only paid subscribers can see

ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_nsfw BOOLEAN DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS unlock_price DECIMAL(10,2) DEFAULT 0;
-- If unlock_price > 0, user must pay to see even if they follow/subscribe

ALTER TABLE posts ADD COLUMN IF NOT EXISTS blur_preview BOOLEAN DEFAULT TRUE;
-- Show blurred preview for locked content

-- Track individual content purchases
CREATE TABLE IF NOT EXISTS content_purchases (
  id SERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

-- Stories feature (like Instagram)
CREATE TABLE IF NOT EXISTS stories (
  id SERIAL PRIMARY KEY,
  creator_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  media_url TEXT NOT NULL,
  media_type VARCHAR(20) DEFAULT 'image', -- image, video
  visibility VARCHAR(20) DEFAULT 'followers', -- public, followers, subscribers
  is_nsfw BOOLEAN DEFAULT FALSE,
  views_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Story views tracking
CREATE TABLE IF NOT EXISTS story_views (
  id SERIAL PRIMARY KEY,
  story_id INTEGER REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(story_id, viewer_id)
);

-- Saved/Bookmarked posts
CREATE TABLE IF NOT EXISTS saved_posts (
  id SERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

-- Update follows table to distinguish follow types
ALTER TABLE follows ADD COLUMN IF NOT EXISTS follow_type VARCHAR(20) DEFAULT 'follow';
-- 'follow' = free follow
-- Subscriptions are tracked in the subscriptions table

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_posts_visibility ON posts(visibility);
CREATE INDEX IF NOT EXISTS idx_posts_creator_visibility ON posts(creator_id, visibility);
CREATE INDEX IF NOT EXISTS idx_posts_nsfw ON posts(is_nsfw);
CREATE INDEX IF NOT EXISTS idx_content_purchases_user ON content_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_creator ON stories(creator_id);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at);

-- Function to check if user can view post
CREATE OR REPLACE FUNCTION can_view_post(viewer_id BIGINT, post_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  post_record RECORD;
  is_following BOOLEAN;
  is_subscribed BOOLEAN;
  has_purchased BOOLEAN;
BEGIN
  -- Get post details
  SELECT * INTO post_record FROM posts WHERE id = post_id;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Creator can always see their own posts
  IF post_record.creator_id = viewer_id THEN RETURN TRUE; END IF;

  -- Public posts are visible to everyone
  IF post_record.visibility = 'public' AND NOT post_record.is_nsfw THEN
    RETURN TRUE;
  END IF;

  -- Check if following
  SELECT EXISTS(
    SELECT 1 FROM follows
    WHERE follower_id = viewer_id AND following_id = post_record.creator_id
  ) INTO is_following;

  -- Check if subscribed
  SELECT EXISTS(
    SELECT 1 FROM subscriptions
    WHERE subscriber_id = viewer_id
    AND creator_id = post_record.creator_id
    AND is_active = TRUE
  ) INTO is_subscribed;

  -- Check if purchased this specific content
  SELECT EXISTS(
    SELECT 1 FROM content_purchases
    WHERE user_id = viewer_id AND post_id = post_record.id
  ) INTO has_purchased;

  -- If unlock_price > 0, must have purchased
  IF post_record.unlock_price > 0 AND NOT has_purchased THEN
    RETURN FALSE;
  END IF;

  -- NSFW content requires subscription
  IF post_record.is_nsfw AND NOT is_subscribed THEN
    RETURN FALSE;
  END IF;

  -- Subscriber-only content
  IF post_record.visibility = 'subscribers' AND NOT is_subscribed THEN
    RETURN FALSE;
  END IF;

  -- Follower content (followers and subscribers can see)
  IF post_record.visibility = 'followers' AND NOT (is_following OR is_subscribed) THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

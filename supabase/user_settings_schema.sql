-- User Settings Schema
-- Run this in your Supabase SQL Editor

-- User Settings Table
CREATE TABLE IF NOT EXISTS user_settings (
  user_id BIGINT PRIMARY KEY REFERENCES users(telegram_id) ON DELETE CASCADE,

  -- Notifications
  notifications_likes BOOLEAN DEFAULT true,
  notifications_comments BOOLEAN DEFAULT true,
  notifications_follows BOOLEAN DEFAULT true,
  notifications_messages BOOLEAN DEFAULT true,
  notifications_subscriptions BOOLEAN DEFAULT true,
  notifications_tips BOOLEAN DEFAULT true,
  email_notifications BOOLEAN DEFAULT false,

  -- Privacy
  show_online_status BOOLEAN DEFAULT true,
  allow_messages_from TEXT DEFAULT 'everyone' CHECK (allow_messages_from IN ('everyone', 'followers', 'subscribers', 'nobody')),
  show_activity_status BOOLEAN DEFAULT true,
  profile_visibility TEXT DEFAULT 'public' CHECK (profile_visibility IN ('public', 'followers_only', 'private')),

  -- Content
  show_nsfw_content BOOLEAN DEFAULT false,
  autoplay_videos BOOLEAN DEFAULT true,
  data_saver_mode BOOLEAN DEFAULT false,
  blur_sensitive_content BOOLEAN DEFAULT true,

  -- Appearance
  theme TEXT DEFAULT 'light' CHECK (theme IN ('light', 'dark', 'system')),
  accent_color TEXT DEFAULT '#0095f6',

  -- Language
  language TEXT DEFAULT 'en',

  -- Creator settings
  default_post_visibility TEXT DEFAULT 'public' CHECK (default_post_visibility IN ('public', 'followers', 'subscribers')),
  watermark_enabled BOOLEAN DEFAULT false,
  auto_message_new_subscribers BOOLEAN DEFAULT false,
  welcome_message TEXT DEFAULT 'Thanks for subscribing!',

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Blocked Users Table
CREATE TABLE IF NOT EXISTS blocked_users (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  blocked_user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, blocked_user_id)
);

-- User Sessions Table (for device management)
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  device_name TEXT,
  device_type TEXT,
  ip_address TEXT,
  location TEXT,
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Data Export Requests
CREATE TABLE IF NOT EXISTS data_export_requests (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  download_url TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Account Deletion Requests
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
  scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_blocked_users_user ON blocked_users(user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_data_exports_user ON data_export_requests(user_id);

-- RLS Policies
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_export_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Allow users to manage their own settings
CREATE POLICY "Users can view own settings" ON user_settings
  FOR SELECT USING (true);

CREATE POLICY "Users can update own settings" ON user_settings
  FOR ALL USING (true);

-- Allow users to manage blocked users
CREATE POLICY "Users can manage blocked users" ON blocked_users
  FOR ALL USING (true);

-- Allow users to view their sessions
CREATE POLICY "Users can manage sessions" ON user_sessions
  FOR ALL USING (true);

-- Allow users to request data exports
CREATE POLICY "Users can request exports" ON data_export_requests
  FOR ALL USING (true);

-- Allow users to request account deletion
CREATE POLICY "Users can request deletion" ON account_deletion_requests
  FOR ALL USING (true);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_user_settings_timestamp ON user_settings;
CREATE TRIGGER update_user_settings_timestamp
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_settings_timestamp();

-- Grant permissions
GRANT ALL ON user_settings TO authenticated;
GRANT ALL ON user_settings TO anon;
GRANT ALL ON blocked_users TO authenticated;
GRANT ALL ON blocked_users TO anon;
GRANT ALL ON user_sessions TO authenticated;
GRANT ALL ON user_sessions TO anon;
GRANT ALL ON data_export_requests TO authenticated;
GRANT ALL ON data_export_requests TO anon;
GRANT ALL ON account_deletion_requests TO authenticated;
GRANT ALL ON account_deletion_requests TO anon;

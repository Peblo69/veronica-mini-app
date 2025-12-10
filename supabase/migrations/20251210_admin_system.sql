-- ============================================
-- ADMIN SYSTEM TABLES
-- Full moderation and management system
-- ============================================

-- Admin users table (who can access admin panel)
CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  role TEXT NOT NULL DEFAULT 'moderator' CHECK (role IN ('super_admin', 'admin', 'moderator')),
  permissions JSONB NOT NULL DEFAULT '{
    "view_users": true,
    "edit_users": false,
    "ban_users": false,
    "delete_posts": false,
    "manage_applications": false,
    "view_messages": false,
    "view_analytics": true,
    "manage_reports": false,
    "post_announcements": false,
    "manage_admins": false
  }'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  created_by BIGINT REFERENCES admin_users(telegram_id)
);

-- Insert super admin (your Telegram ID)
INSERT INTO admin_users (telegram_id, username, role, permissions, is_active)
VALUES (
  7881088777,
  'peblo69',
  'super_admin',
  '{
    "view_users": true,
    "edit_users": true,
    "ban_users": true,
    "delete_posts": true,
    "manage_applications": true,
    "view_messages": true,
    "view_analytics": true,
    "manage_reports": true,
    "post_announcements": true,
    "manage_admins": true
  }'::jsonb,
  true
) ON CONFLICT (telegram_id) DO UPDATE SET
  role = 'super_admin',
  permissions = '{
    "view_users": true,
    "edit_users": true,
    "ban_users": true,
    "delete_posts": true,
    "manage_applications": true,
    "view_messages": true,
    "view_analytics": true,
    "manage_reports": true,
    "post_announcements": true,
    "manage_admins": true
  }'::jsonb,
  is_active = true;

-- User bans table (track all bans with history)
CREATE TABLE IF NOT EXISTS user_bans (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  reason TEXT NOT NULL,
  banned_by BIGINT NOT NULL,
  banned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unbanned_at TIMESTAMPTZ,
  unbanned_by BIGINT,
  is_permanent BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ
);

-- Add is_banned column to users if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_banned') THEN
    ALTER TABLE users ADD COLUMN is_banned BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'banned_reason') THEN
    ALTER TABLE users ADD COLUMN banned_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'banned_at') THEN
    ALTER TABLE users ADD COLUMN banned_at TIMESTAMPTZ;
  END IF;
END $$;

-- Reports table (user reports on content/users)
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  reporter_id BIGINT NOT NULL,
  reported_type TEXT NOT NULL CHECK (reported_type IN ('user', 'post', 'message', 'comment', 'story')),
  reported_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'hate_speech', 'nudity', 'violence', 'scam', 'underage', 'impersonation', 'other')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  reviewed_by BIGINT,
  reviewed_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Flagged content table (AI moderation results)
CREATE TABLE IF NOT EXISTS flagged_content (
  id SERIAL PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type IN ('post', 'message', 'story', 'avatar', 'comment')),
  content_id TEXT NOT NULL,
  user_id BIGINT NOT NULL,
  flag_reason TEXT NOT NULL,
  flag_categories JSONB NOT NULL DEFAULT '{}'::jsonb,
  flag_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  media_url TEXT,
  text_content TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'auto_blocked')),
  reviewed_by BIGINT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Announcements table (platform updates/news)
CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'update', 'maintenance', 'promotion')),
  target_audience TEXT NOT NULL DEFAULT 'all' CHECK (target_audience IN ('all', 'creators', 'subscribers', 'new_users')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_dismissible BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_by BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Admin activity log (audit trail)
CREATE TABLE IF NOT EXISTS admin_activity_log (
  id SERIAL PRIMARY KEY,
  admin_id BIGINT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add hidden fields to posts if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'is_hidden') THEN
    ALTER TABLE posts ADD COLUMN is_hidden BOOLEAN NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'hidden_reason') THEN
    ALTER TABLE posts ADD COLUMN hidden_reason TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'hidden_by') THEN
    ALTER TABLE posts ADD COLUMN hidden_by BIGINT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'posts' AND column_name = 'hidden_at') THEN
    ALTER TABLE posts ADD COLUMN hidden_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_flagged_content_status ON flagged_content(status);
CREATE INDEX IF NOT EXISTS idx_flagged_content_created_at ON flagged_content(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_admin_id ON admin_activity_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_log_created_at ON admin_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_bans_user_id ON user_bans(user_id);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, starts_at, ends_at);

-- Enable realtime for admin tables
ALTER PUBLICATION supabase_realtime ADD TABLE reports;
ALTER PUBLICATION supabase_realtime ADD TABLE flagged_content;
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE admin_activity_log;
ALTER PUBLICATION supabase_realtime ADD TABLE user_bans;

-- Function to auto-set priority on reports based on reason
CREATE OR REPLACE FUNCTION set_report_priority()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.reason IN ('underage', 'violence') THEN
    NEW.priority := 'critical';
  ELSIF NEW.reason IN ('nudity', 'harassment', 'hate_speech') THEN
    NEW.priority := 'high';
  ELSIF NEW.reason IN ('scam', 'impersonation') THEN
    NEW.priority := 'normal';
  ELSE
    NEW.priority := 'low';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_report_priority ON reports;
CREATE TRIGGER trigger_set_report_priority
  BEFORE INSERT ON reports
  FOR EACH ROW
  EXECUTE FUNCTION set_report_priority();

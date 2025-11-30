-- =============================================
-- ADMIN PANEL & AI CONTENT UPDATE
-- Run this in Supabase SQL Editor
-- =============================================

-- Add AI generated field to creator_applications
ALTER TABLE creator_applications ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT FALSE;

-- Admin Users Table (for admin panel access)
CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  username VARCHAR(100),
  role VARCHAR(50) DEFAULT 'admin', -- admin, super_admin, moderator
  permissions JSONB DEFAULT '{"view_users": true, "edit_users": true, "delete_posts": true, "manage_applications": true, "view_messages": false, "view_analytics": true}'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login TIMESTAMPTZ
);

-- Admin Activity Log (audit trail)
CREATE TABLE IF NOT EXISTS admin_activity_log (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER REFERENCES admin_users(id),
  action VARCHAR(100) NOT NULL, -- view_user, edit_user, delete_post, approve_application, etc.
  target_type VARCHAR(50), -- user, post, application, message
  target_id VARCHAR(100), -- ID of the affected record
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add admin notes to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_by INTEGER REFERENCES admin_users(id);

-- Add admin notes to posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hidden_by INTEGER REFERENCES admin_users(id);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

-- Reported content table
CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  reporter_id BIGINT REFERENCES users(telegram_id),
  reported_type VARCHAR(50) NOT NULL, -- user, post, message
  reported_id VARCHAR(100) NOT NULL,
  reason VARCHAR(100) NOT NULL, -- spam, harassment, inappropriate, underage, etc.
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending', -- pending, reviewed, resolved, dismissed
  reviewed_by INTEGER REFERENCES admin_users(id),
  reviewed_at TIMESTAMPTZ,
  action_taken TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Platform statistics (for admin dashboard)
CREATE TABLE IF NOT EXISTS platform_stats (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE DEFAULT CURRENT_DATE,
  total_users INTEGER DEFAULT 0,
  new_users INTEGER DEFAULT 0,
  total_creators INTEGER DEFAULT 0,
  new_creators INTEGER DEFAULT 0,
  total_posts INTEGER DEFAULT 0,
  new_posts INTEGER DEFAULT 0,
  total_transactions INTEGER DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  active_users INTEGER DEFAULT 0, -- users active in last 24h
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_admin_activity_admin ON admin_activity_log(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_created ON admin_activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_users_banned ON users(is_banned);
CREATE INDEX IF NOT EXISTS idx_posts_hidden ON posts(is_hidden);

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION is_admin(check_telegram_id BIGINT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM admin_users
    WHERE telegram_id = check_telegram_id
    AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql;

-- Insert yourself as super admin (REPLACE WITH YOUR TELEGRAM ID)
-- INSERT INTO admin_users (telegram_id, username, role) VALUES (YOUR_TELEGRAM_ID, 'your_username', 'super_admin');

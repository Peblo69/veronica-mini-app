-- =============================================
-- CREATOR APPLICATION SYSTEM
-- Run this in Supabase SQL Editor
-- =============================================

-- Creator Applications Table
CREATE TABLE IF NOT EXISTS creator_applications (
  id SERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,

  -- Personal Info (self-declared)
  legal_name VARCHAR(255) NOT NULL,
  date_of_birth DATE NOT NULL,
  country VARCHAR(100) NOT NULL,
  city VARCHAR(100),

  -- Contact Info
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),

  -- Content Declaration
  content_type VARCHAR(50) NOT NULL, -- 'sfw' or 'nsfw'
  content_categories TEXT[], -- array of categories they'll create
  content_description TEXT,

  -- Social Proof (optional)
  instagram_url VARCHAR(255),
  twitter_url VARCHAR(255),
  tiktok_url VARCHAR(255),
  other_platforms TEXT,

  -- Agreements
  age_confirmed BOOLEAN DEFAULT FALSE,
  terms_accepted BOOLEAN DEFAULT FALSE,
  content_policy_accepted BOOLEAN DEFAULT FALSE,
  payout_terms_accepted BOOLEAN DEFAULT FALSE,

  -- Application Status
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected, requires_info
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by VARCHAR(100),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address VARCHAR(50),
  user_agent TEXT,

  UNIQUE(user_id)
);

-- Content Categories Reference
CREATE TABLE IF NOT EXISTS content_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_nsfw BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE
);

-- Insert default categories
INSERT INTO content_categories (name, description, is_nsfw) VALUES
  ('Lifestyle', 'Daily life, vlogs, behind the scenes', FALSE),
  ('Fitness', 'Workouts, nutrition, health tips', FALSE),
  ('Fashion', 'Outfits, styling, fashion tips', FALSE),
  ('Art', 'Digital art, illustrations, creative work', FALSE),
  ('Music', 'Original music, covers, performances', FALSE),
  ('Gaming', 'Gameplay, reviews, gaming content', FALSE),
  ('Education', 'Tutorials, courses, educational content', FALSE),
  ('Cooking', 'Recipes, cooking tutorials, food content', FALSE),
  ('Travel', 'Travel vlogs, destination guides', FALSE),
  ('Photography', 'Photo shoots, photography tips', FALSE),
  ('Cosplay', 'Costume creation, character portrayals', FALSE),
  ('ASMR', 'Audio content, relaxation', FALSE),
  ('Adult/Explicit', 'Adult-only content (18+)', TRUE)
ON CONFLICT DO NOTHING;

-- Banned Countries (for compliance)
CREATE TABLE IF NOT EXISTS banned_countries (
  id SERIAL PRIMARY KEY,
  country_code VARCHAR(10) NOT NULL,
  country_name VARCHAR(100) NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Creator Terms Acceptance Log
CREATE TABLE IF NOT EXISTS terms_acceptance_log (
  id SERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(telegram_id),
  terms_version VARCHAR(50) NOT NULL,
  accepted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address VARCHAR(50),
  user_agent TEXT
);

-- Update users table to track application status
ALTER TABLE users ADD COLUMN IF NOT EXISTS application_status VARCHAR(50) DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ DEFAULT NULL;

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_creator_applications_status ON creator_applications(status);
CREATE INDEX IF NOT EXISTS idx_creator_applications_user ON creator_applications(user_id);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_creator_applications_updated_at ON creator_applications;
CREATE TRIGGER update_creator_applications_updated_at
  BEFORE UPDATE ON creator_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

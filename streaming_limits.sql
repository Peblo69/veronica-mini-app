-- =====================================================
-- STREAMING TIME LIMITS
-- Track daily streaming usage per user (60 min/day)
-- =====================================================

-- Daily streaming usage tracking
CREATE TABLE IF NOT EXISTS streaming_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  minutes_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_streaming_usage_user_date ON streaming_usage(user_id, date);

-- Enable RLS
ALTER TABLE streaming_usage ENABLE ROW LEVEL SECURITY;

-- Policy
CREATE POLICY "All access streaming_usage" ON streaming_usage FOR ALL USING (true);

-- Function to check remaining streaming time
CREATE OR REPLACE FUNCTION get_remaining_stream_minutes(p_user_id BIGINT)
RETURNS INTEGER AS $$
DECLARE
  used_minutes INTEGER;
  daily_limit INTEGER := 60;
BEGIN
  SELECT COALESCE(minutes_used, 0) INTO used_minutes
  FROM streaming_usage
  WHERE user_id = p_user_id AND date = CURRENT_DATE;

  IF used_minutes IS NULL THEN
    RETURN daily_limit;
  END IF;

  RETURN GREATEST(0, daily_limit - used_minutes);
END;
$$ LANGUAGE plpgsql;

-- Function to add streaming minutes
CREATE OR REPLACE FUNCTION add_streaming_minutes(p_user_id BIGINT, p_minutes INTEGER)
RETURNS INTEGER AS $$
DECLARE
  new_total INTEGER;
BEGIN
  INSERT INTO streaming_usage (user_id, date, minutes_used)
  VALUES (p_user_id, CURRENT_DATE, p_minutes)
  ON CONFLICT (user_id, date)
  DO UPDATE SET
    minutes_used = streaming_usage.minutes_used + p_minutes,
    updated_at = NOW();

  SELECT minutes_used INTO new_total
  FROM streaming_usage
  WHERE user_id = p_user_id AND date = CURRENT_DATE;

  RETURN new_total;
END;
$$ LANGUAGE plpgsql;

-- Add Agora UID to users (needed for video streaming)
ALTER TABLE users ADD COLUMN IF NOT EXISTS agora_uid INTEGER;

-- Update livestreams table with Agora channel
ALTER TABLE livestreams ADD COLUMN IF NOT EXISTS agora_channel TEXT;
ALTER TABLE livestreams ADD COLUMN IF NOT EXISTS agora_token TEXT;

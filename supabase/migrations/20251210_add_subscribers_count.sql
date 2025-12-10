-- Add subscribers_count column to users table
-- This tracks how many subscribers each creator has

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'subscribers_count') THEN
    ALTER TABLE users ADD COLUMN subscribers_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Create index for faster queries on subscribers_count
CREATE INDEX IF NOT EXISTS idx_users_subscribers_count ON users(subscribers_count DESC);

-- Create function to update subscribers_count when subscriptions change
CREATE OR REPLACE FUNCTION update_subscribers_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment subscribers_count for the creator
    UPDATE users
    SET subscribers_count = subscribers_count + 1
    WHERE telegram_id = NEW.creator_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement subscribers_count for the creator
    UPDATE users
    SET subscribers_count = GREATEST(0, subscribers_count - 1)
    WHERE telegram_id = OLD.creator_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on subscriptions table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscriptions') THEN
    DROP TRIGGER IF EXISTS trigger_update_subscribers_count ON subscriptions;
    CREATE TRIGGER trigger_update_subscribers_count
      AFTER INSERT OR DELETE ON subscriptions
      FOR EACH ROW
      EXECUTE FUNCTION update_subscribers_count();
  END IF;
END $$;

-- Backfill existing subscribers_count from subscriptions table (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subscriptions') THEN
    UPDATE users u
    SET subscribers_count = COALESCE((
      SELECT COUNT(*)
      FROM subscriptions s
      WHERE s.creator_id = u.telegram_id
        AND (s.expires_at IS NULL OR s.expires_at > NOW())
    ), 0);
  END IF;
END $$;

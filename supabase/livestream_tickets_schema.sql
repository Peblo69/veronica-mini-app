-- ============================================
-- LIVESTREAM TICKETS (ENTRY PAYWALL)
-- Run inside the Supabase SQL editor before enabling pay-per-view livestreams.
-- ============================================

CREATE TABLE IF NOT EXISTS livestream_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  livestream_id UUID REFERENCES livestreams(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(telegram_id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(livestream_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_livestream_tickets_stream ON livestream_tickets(livestream_id);
CREATE INDEX IF NOT EXISTS idx_livestream_tickets_user ON livestream_tickets(user_id);

ALTER TABLE livestream_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All access livestream tickets select" ON livestream_tickets;
CREATE POLICY "All access livestream tickets select" ON livestream_tickets
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "All access livestream tickets insert" ON livestream_tickets;
CREATE POLICY "All access livestream tickets insert" ON livestream_tickets
  FOR INSERT WITH CHECK (true);

-- Optional: add to realtime if you want automatic ticket dashboards
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'livestream_tickets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE livestream_tickets;
  END IF;
END $$;

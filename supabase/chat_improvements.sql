-- ============================================
-- CHAT STABILITY IMPROVEMENTS
-- Run this in Supabase SQL editor.
-- Adds client-side identifiers so the web app can
-- de-duplicate optimistic messages reliably.
-- ============================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS client_message_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_message_id
  ON messages(client_message_id)
  WHERE client_message_id IS NOT NULL;

-- Migration: Chat Request System
-- Description: Add pending_approval_from column to conversations for chat request functionality
-- New chats are pending until the receiver approves them

-- Add pending_approval_from column to conversations
-- NULL = approved/accepted, telegram_id = pending approval from that user
ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS pending_approval_from BIGINT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN conversations.pending_approval_from IS 'User ID who needs to approve this chat. NULL means approved.';

-- Create index for faster filtering of pending requests
CREATE INDEX IF NOT EXISTS idx_conversations_pending_approval
ON conversations(pending_approval_from)
WHERE pending_approval_from IS NOT NULL;

-- For existing conversations, set pending_approval_from to NULL (they are all approved)
-- This is already the default, but explicit for clarity
UPDATE conversations SET pending_approval_from = NULL WHERE pending_approval_from IS NULL;

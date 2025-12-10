-- Add poll and gradient fields to posts table

-- Post type (thought, poll, question)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS post_type TEXT DEFAULT 'thought';

-- Poll fields
ALTER TABLE posts ADD COLUMN IF NOT EXISTS poll_options JSONB DEFAULT NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS poll_votes JSONB DEFAULT NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS poll_total_votes INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS poll_ends_at TIMESTAMPTZ DEFAULT NULL;

-- Background gradient for styled text posts
ALTER TABLE posts ADD COLUMN IF NOT EXISTS background_gradient TEXT DEFAULT NULL;

-- Create table to track poll votes per user
CREATE TABLE IF NOT EXISTS poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  option_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_poll_votes_post_id ON poll_votes(post_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_user_id ON poll_votes(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_post_type ON posts(post_type);

-- RLS for poll_votes
ALTER TABLE poll_votes ENABLE ROW LEVEL SECURITY;

-- Anyone can view poll votes
CREATE POLICY "Anyone can view poll votes" ON poll_votes
  FOR SELECT USING (true);

-- Anyone can insert their own vote
CREATE POLICY "Users can vote on polls" ON poll_votes
  FOR INSERT WITH CHECK (true);

-- Users can only delete their own votes
CREATE POLICY "Users can delete own votes" ON poll_votes
  FOR DELETE USING (true);

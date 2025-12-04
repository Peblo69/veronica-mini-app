-- =============================================
-- PAYMENT SYSTEM TABLES FOR TELEGRAM STARS
-- Run this in Supabase SQL Editor
-- =============================================

-- Wallets table - tracks user balances
CREATE TABLE IF NOT EXISTS wallets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  stars_balance INTEGER DEFAULT 0,  -- Telegram Stars balance (pending withdrawal)
  total_earned INTEGER DEFAULT 0,   -- Total stars ever earned
  total_spent INTEGER DEFAULT 0,    -- Total stars ever spent
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Stars transactions table - all payment records
CREATE TABLE IF NOT EXISTS stars_transactions (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('unlock', 'tip', 'subscription', 'gift', 'dm_unlock', 'withdrawal', 'refund')),
  from_user_id BIGINT REFERENCES users(telegram_id),  -- null for system/withdrawals
  to_user_id BIGINT REFERENCES users(telegram_id),    -- null for platform fees
  amount INTEGER NOT NULL,           -- Amount in Telegram Stars
  platform_fee INTEGER DEFAULT 0,    -- 15% platform cut
  creator_amount INTEGER DEFAULT 0,  -- 85% creator receives
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  payment_method TEXT DEFAULT 'telegram_stars',
  telegram_payment_charge_id TEXT,   -- For refunds
  reference_type TEXT,               -- 'post', 'message', 'subscription', etc.
  reference_id TEXT,                 -- ID of the referenced item
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Post purchases - track who unlocked what
CREATE TABLE IF NOT EXISTS post_purchases (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(telegram_id),
  post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  transaction_id BIGINT REFERENCES stars_transactions(id),
  amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

-- Tips - track tips sent to creators
CREATE TABLE IF NOT EXISTS tips (
  id BIGSERIAL PRIMARY KEY,
  from_user_id BIGINT NOT NULL REFERENCES users(telegram_id),
  to_user_id BIGINT NOT NULL REFERENCES users(telegram_id),
  transaction_id BIGINT REFERENCES stars_transactions(id),
  amount INTEGER NOT NULL,
  message TEXT,
  post_id BIGINT REFERENCES posts(id),  -- Optional: tip on a specific post
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pending invoices - track invoices before payment
CREATE TABLE IF NOT EXISTS pending_invoices (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(telegram_id),
  invoice_type TEXT NOT NULL,  -- 'unlock', 'tip', 'subscription'
  amount INTEGER NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  to_user_id BIGINT REFERENCES users(telegram_id),
  metadata JSONB DEFAULT '{}',
  invoice_link TEXT,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_stars_transactions_from_user ON stars_transactions(from_user_id);
CREATE INDEX IF NOT EXISTS idx_stars_transactions_to_user ON stars_transactions(to_user_id);
CREATE INDEX IF NOT EXISTS idx_stars_transactions_status ON stars_transactions(status);
CREATE INDEX IF NOT EXISTS idx_stars_transactions_type ON stars_transactions(type);
CREATE INDEX IF NOT EXISTS idx_post_purchases_user ON post_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_post_purchases_post ON post_purchases(post_id);
CREATE INDEX IF NOT EXISTS idx_tips_to_user ON tips(to_user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);

-- Function to create wallet on user creation
CREATE OR REPLACE FUNCTION create_user_wallet()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO wallets (user_id) VALUES (NEW.telegram_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create wallet
DROP TRIGGER IF EXISTS trigger_create_wallet ON users;
CREATE TRIGGER trigger_create_wallet
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_wallet();

-- Create wallets for existing users
INSERT INTO wallets (user_id)
SELECT telegram_id FROM users
ON CONFLICT (user_id) DO NOTHING;

-- Function to process completed payment
CREATE OR REPLACE FUNCTION process_stars_payment(
  p_transaction_id BIGINT,
  p_telegram_charge_id TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_transaction stars_transactions%ROWTYPE;
BEGIN
  -- Get transaction
  SELECT * INTO v_transaction FROM stars_transactions WHERE id = p_transaction_id;

  IF NOT FOUND OR v_transaction.status != 'pending' THEN
    RETURN FALSE;
  END IF;

  -- Update transaction
  UPDATE stars_transactions
  SET status = 'completed',
      telegram_payment_charge_id = p_telegram_charge_id
  WHERE id = p_transaction_id;

  -- Update creator's wallet (add 85%)
  IF v_transaction.to_user_id IS NOT NULL THEN
    UPDATE wallets
    SET stars_balance = stars_balance + v_transaction.creator_amount,
        total_earned = total_earned + v_transaction.creator_amount,
        updated_at = NOW()
    WHERE user_id = v_transaction.to_user_id;
  END IF;

  -- Update buyer's spending stats
  IF v_transaction.from_user_id IS NOT NULL THEN
    UPDATE wallets
    SET total_spent = total_spent + v_transaction.amount,
        updated_at = NOW()
    WHERE user_id = v_transaction.from_user_id;
  END IF;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

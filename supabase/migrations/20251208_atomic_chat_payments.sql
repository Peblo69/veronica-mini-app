-- =============================================
-- ATOMIC CHAT PAYMENT FUNCTIONS
-- These functions prevent race conditions in chat payments
-- Run this in Supabase SQL Editor
-- =============================================

-- =============================================
-- ATOMIC SEND GIFT
-- Checks balance, deducts from sender, adds to receiver in one transaction
-- =============================================

CREATE OR REPLACE FUNCTION atomic_send_gift(
  p_sender_id BIGINT,
  p_receiver_id BIGINT,
  p_gift_price INTEGER,
  p_creator_percent INTEGER DEFAULT 90
) RETURNS JSON AS $$
DECLARE
  v_sender_balance DECIMAL;
  v_creator_amount INTEGER;
BEGIN
  -- Lock sender row for update to prevent race conditions
  SELECT balance INTO v_sender_balance
  FROM users
  WHERE telegram_id = p_sender_id
  FOR UPDATE;

  IF v_sender_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sender not found');
  END IF;

  IF v_sender_balance < p_gift_price THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- Calculate creator amount
  v_creator_amount := FLOOR(p_gift_price * p_creator_percent / 100);

  -- Deduct from sender
  UPDATE users
  SET balance = balance - p_gift_price
  WHERE telegram_id = p_sender_id;

  -- Add to receiver
  UPDATE users
  SET balance = balance + v_creator_amount
  WHERE telegram_id = p_receiver_id;

  RETURN json_build_object(
    'success', true,
    'deducted', p_gift_price,
    'credited', v_creator_amount
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- ATOMIC SEND TIP
-- Checks balance, deducts from sender, adds to receiver in one transaction
-- =============================================

CREATE OR REPLACE FUNCTION atomic_send_tip(
  p_sender_id BIGINT,
  p_receiver_id BIGINT,
  p_tip_amount INTEGER,
  p_creator_percent INTEGER DEFAULT 90
) RETURNS JSON AS $$
DECLARE
  v_sender_balance DECIMAL;
  v_creator_amount INTEGER;
BEGIN
  -- Lock sender row for update to prevent race conditions
  SELECT balance INTO v_sender_balance
  FROM users
  WHERE telegram_id = p_sender_id
  FOR UPDATE;

  IF v_sender_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Sender not found');
  END IF;

  IF v_sender_balance < p_tip_amount THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- Calculate creator amount
  v_creator_amount := FLOOR(p_tip_amount * p_creator_percent / 100);

  -- Deduct from sender
  UPDATE users
  SET balance = balance - p_tip_amount
  WHERE telegram_id = p_sender_id;

  -- Add to receiver
  UPDATE users
  SET balance = balance + v_creator_amount
  WHERE telegram_id = p_receiver_id;

  RETURN json_build_object(
    'success', true,
    'deducted', p_tip_amount,
    'credited', v_creator_amount
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- ATOMIC UNLOCK PPV
-- Checks balance, checks if already unlocked, deducts, adds to creator,
-- and updates ppv_unlocked_by array atomically
-- =============================================

CREATE OR REPLACE FUNCTION atomic_unlock_ppv(
  p_user_id BIGINT,
  p_message_id UUID,
  p_creator_percent INTEGER DEFAULT 90
) RETURNS JSON AS $$
DECLARE
  v_user_balance DECIMAL;
  v_ppv_price INTEGER;
  v_ppv_unlocked_by BIGINT[];
  v_sender_id BIGINT;
  v_creator_amount INTEGER;
BEGIN
  -- Lock user row for update to prevent race conditions
  SELECT balance INTO v_user_balance
  FROM users
  WHERE telegram_id = p_user_id
  FOR UPDATE;

  IF v_user_balance IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'User not found');
  END IF;

  -- Get message info and lock for update
  SELECT ppv_price, ppv_unlocked_by, sender_id
  INTO v_ppv_price, v_ppv_unlocked_by, v_sender_id
  FROM messages
  WHERE id = p_message_id
  FOR UPDATE;

  IF v_ppv_price IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Message not found');
  END IF;

  -- Check if already unlocked
  IF v_ppv_unlocked_by IS NOT NULL AND p_user_id = ANY(v_ppv_unlocked_by) THEN
    RETURN json_build_object('success', true, 'already_unlocked', true);
  END IF;

  -- Check balance
  IF v_user_balance < v_ppv_price THEN
    RETURN json_build_object('success', false, 'error', 'Insufficient balance');
  END IF;

  -- Calculate creator amount
  v_creator_amount := FLOOR(v_ppv_price * p_creator_percent / 100);

  -- Deduct from buyer
  UPDATE users
  SET balance = balance - v_ppv_price
  WHERE telegram_id = p_user_id;

  -- Add to creator
  UPDATE users
  SET balance = balance + v_creator_amount
  WHERE telegram_id = v_sender_id;

  -- Update ppv_unlocked_by array
  UPDATE messages
  SET ppv_unlocked_by = array_append(COALESCE(ppv_unlocked_by, ARRAY[]::BIGINT[]), p_user_id)
  WHERE id = p_message_id;

  RETURN json_build_object(
    'success', true,
    'deducted', v_ppv_price,
    'credited', v_creator_amount
  );
END;
$$ LANGUAGE plpgsql;

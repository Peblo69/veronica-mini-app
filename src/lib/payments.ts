import { supabase } from './supabase'

// ============================================
// TELEGRAM STARS PAYMENT INTEGRATION
// ============================================

// Telegram WebApp interface
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        openInvoice: (url: string, callback?: (status: string) => void) => void
        showPopup: (params: {
          title?: string
          message: string
          buttons?: Array<{ type?: string; text?: string; id?: string }>
        }, callback?: (buttonId: string) => void) => void
        showAlert: (message: string, callback?: () => void) => void
        showConfirm: (message: string, callback?: (confirmed: boolean) => void) => void
        MainButton: {
          text: string
          show: () => void
          hide: () => void
          onClick: (callback: () => void) => void
          offClick: (callback: () => void) => void
        }
      }
    }
  }
}

export type PaymentMethod = 'tokens' | 'stars'

export interface PaymentResult {
  success: boolean
  error?: string
  transactionId?: string
}

// ============================================
// TOKEN PAYMENTS (In-App Currency)
// ============================================

export async function payWithTokens(
  userId: number,
  amount: number,
  description: string
): Promise<PaymentResult> {
  // Check balance
  const { data: user } = await supabase
    .from('users')
    .select('balance')
    .eq('telegram_id', userId)
    .single()

  if (!user || user.balance < amount) {
    return { success: false, error: 'Insufficient token balance' }
  }

  // Deduct balance
  const { error } = await supabase
    .from('users')
    .update({ balance: user.balance - amount })
    .eq('telegram_id', userId)

  if (error) {
    return { success: false, error: error.message }
  }

  // Record transaction
  const { data: transaction } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      amount: -amount,
      type: 'payment',
      description,
      status: 'completed'
    })
    .select()
    .single()

  return {
    success: true,
    transactionId: transaction?.id
  }
}

// ============================================
// TELEGRAM STARS PAYMENTS
// ============================================

// Note: Telegram Stars payments require a backend to create invoices
// This is a client-side helper that opens the invoice URL
export function openTelegramStarsPayment(
  invoiceUrl: string,
  onSuccess: () => void,
  onFailed: () => void
): void {
  const tg = window.Telegram?.WebApp

  if (!tg) {
    onFailed()
    return
  }

  tg.openInvoice(invoiceUrl, (status) => {
    if (status === 'paid') {
      onSuccess()
    } else {
      onFailed()
    }
  })
}

// Show payment method selection popup
export function showPaymentMethodPopup(
  amount: number,
  userBalance: number,
  onSelect: (method: PaymentMethod | null) => void
): void {
  const tg = window.Telegram?.WebApp

  if (!tg) {
    // Fallback: tokens only
    onSelect('tokens')
    return
  }

  const canPayWithTokens = userBalance >= amount
  const message = canPayWithTokens
    ? `Pay ${amount} tokens from your balance?`
    : `You need ${amount} tokens. Your balance: ${userBalance}`

  if (canPayWithTokens) {
    tg.showConfirm(message, (confirmed) => {
      onSelect(confirmed ? 'tokens' : null)
    })
  } else {
    tg.showAlert(`Insufficient balance. You need ${amount} tokens but have ${userBalance}.`)
    onSelect(null)
  }
}

// ============================================
// SUBSCRIPTION PAYMENT
// ============================================

export async function processSubscriptionPayment(
  subscriberId: number,
  creatorId: number,
  price: number
): Promise<PaymentResult> {
  // Free subscription
  if (price === 0) {
    const { error } = await supabase
      .from('subscriptions')
      .upsert({
        subscriber_id: subscriberId,
        creator_id: creatorId,
        price_paid: 0,
        is_active: true,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
      }, {
        onConflict: 'subscriber_id,creator_id'
      })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  }

  // Paid subscription with tokens
  const paymentResult = await payWithTokens(
    subscriberId,
    price,
    `Subscription to creator ${creatorId}`
  )

  if (!paymentResult.success) {
    return paymentResult
  }

  // Create/update subscription
  const { error: subError } = await supabase
    .from('subscriptions')
    .upsert({
      subscriber_id: subscriberId,
      creator_id: creatorId,
      price_paid: price,
      is_active: true,
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }, {
      onConflict: 'subscriber_id,creator_id'
    })

  if (subError) {
    // Refund tokens if subscription failed
    await supabase.rpc('add_to_balance', {
      user_telegram_id: subscriberId,
      amount_to_add: price
    })
    return { success: false, error: subError.message }
  }

  // Pay creator (90% share)
  await supabase.rpc('add_to_balance', {
    user_telegram_id: creatorId,
    amount_to_add: Math.floor(price * 0.9)
  })

  // Create notification for creator
  await supabase.from('notifications').insert({
    user_id: creatorId,
    from_user_id: subscriberId,
    type: 'subscription',
    content: 'subscribed to you!'
  })

  return { success: true, transactionId: paymentResult.transactionId }
}

// ============================================
// CONTENT PURCHASE PAYMENT
// ============================================

export async function processContentPurchase(
  userId: number,
  postId: number,
  creatorId: number,
  price: number
): Promise<PaymentResult> {
  // Pay with tokens
  const paymentResult = await payWithTokens(
    userId,
    price,
    `Content unlock for post ${postId}`
  )

  if (!paymentResult.success) {
    return paymentResult
  }

  // Record purchase
  const { error: purchaseError } = await supabase
    .from('content_purchases')
    .insert({
      user_id: userId,
      post_id: postId,
      amount: price
    })

  if (purchaseError) {
    // Refund
    await supabase.rpc('add_to_balance', {
      user_telegram_id: userId,
      amount_to_add: price
    })
    return { success: false, error: purchaseError.message }
  }

  // Pay creator (90%)
  await supabase.rpc('add_to_balance', {
    user_telegram_id: creatorId,
    amount_to_add: Math.floor(price * 0.9)
  })

  return { success: true, transactionId: paymentResult.transactionId }
}

// ============================================
// TIP PAYMENT
// ============================================

export async function processTip(
  senderId: number,
  recipientId: number,
  amount: number
): Promise<PaymentResult> {
  const paymentResult = await payWithTokens(
    senderId,
    amount,
    `Tip to user ${recipientId}`
  )

  if (!paymentResult.success) {
    return paymentResult
  }

  // Pay recipient (95% for tips)
  await supabase.rpc('add_to_balance', {
    user_telegram_id: recipientId,
    amount_to_add: Math.floor(amount * 0.95)
  })

  // Create notification
  await supabase.from('notifications').insert({
    user_id: recipientId,
    from_user_id: senderId,
    type: 'tip',
    content: `sent you a $${amount} tip!`
  })

  return { success: true, transactionId: paymentResult.transactionId }
}

// ============================================
// TOKEN PURCHASE (Top-up)
// ============================================

export async function addTokensToBalance(
  userId: number,
  amount: number,
  source: 'purchase' | 'bonus' | 'refund' = 'purchase'
): Promise<PaymentResult> {
  const { error } = await supabase.rpc('add_to_balance', {
    user_telegram_id: userId,
    amount_to_add: amount
  })

  if (error) {
    return { success: false, error: error.message }
  }

  // Record transaction
  const { data: transaction } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      amount: amount,
      type: source,
      description: `Added ${amount} tokens`,
      status: 'completed'
    })
    .select()
    .single()

  return { success: true, transactionId: transaction?.id }
}

// ============================================
// GET USER BALANCE
// ============================================

export async function getUserBalance(userId: number): Promise<number> {
  const { data } = await supabase
    .from('users')
    .select('balance')
    .eq('telegram_id', userId)
    .single()

  return data?.balance || 0
}

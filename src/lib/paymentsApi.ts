/**
 * Telegram Stars Payment API
 *
 * This module handles all payment operations using Telegram Stars.
 * - Post unlocks (locked/premium content)
 * - Tips to creators
 * - Wallet management
 */

const PAYMENTS_API_URL = import.meta.env.VITE_SUPABASE_URL + '/functions/v1/payments'

interface PaymentResponse {
  success?: boolean
  invoice_link?: string
  amount?: number
  transaction_id?: string
  error?: string
}

interface Wallet {
  id: string
  user_id: number
  stars_balance: number
  total_earned: number
  total_spent: number
  created_at: string
  updated_at: string
}

interface Transaction {
  id: string
  type: 'unlock' | 'tip' | 'subscription' | 'gift' | 'dm_unlock' | 'withdrawal' | 'refund'
  from_user_id: number | null
  to_user_id: number | null
  amount: number
  platform_fee: number
  creator_amount: number
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  payment_method: string
  telegram_payment_charge_id: string | null
  reference_type: string | null
  reference_id: string | null
  metadata: Record<string, any>
  created_at: string
}

async function callPaymentsApi(body: Record<string, any>): Promise<any> {
  const response = await fetch(PAYMENTS_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  return response.json()
}

/**
 * Create an invoice to unlock a locked post
 */
export async function createUnlockInvoice(
  userId: number,
  postId: number
): Promise<PaymentResponse> {
  return callPaymentsApi({
    action: 'create_unlock_invoice',
    user_id: userId,
    post_id: postId,
  })
}

/**
 * Create an invoice to send a tip
 */
export async function createTipInvoice(
  userId: number,
  toUserId: number,
  amount: number,
  message?: string,
  postId?: number
): Promise<PaymentResponse> {
  return callPaymentsApi({
    action: 'create_tip_invoice',
    user_id: userId,
    to_user_id: toUserId,
    amount,
    message,
    post_id: postId,
  })
}

/**
 * Get user's wallet info
 */
export async function getWallet(userId: number): Promise<{ wallet?: Wallet; error?: string }> {
  return callPaymentsApi({
    action: 'get_wallet',
    user_id: userId,
  })
}

/**
 * Get user's transaction history
 */
export async function getTransactions(
  userId: number
): Promise<{ transactions?: Transaction[]; error?: string }> {
  return callPaymentsApi({
    action: 'get_transactions',
    user_id: userId,
  })
}

/**
 * Check if user has purchased a post
 */
export async function checkPurchase(
  userId: number,
  postId: number
): Promise<{ purchased: boolean }> {
  return callPaymentsApi({
    action: 'check_purchase',
    user_id: userId,
    post_id: postId,
  })
}

/**
 * Open Telegram Stars payment dialog
 * Uses the TWA SDK to open the invoice
 */
export function openInvoice(
  invoiceLink: string,
  onSuccess?: () => void,
  onFailed?: () => void,
  onPending?: () => void
): void {
  const WebApp = (window as any).Telegram?.WebApp

  if (!WebApp) {
    console.error('Telegram WebApp not available')
    onFailed?.()
    return
  }

  WebApp.openInvoice(invoiceLink, (status: string) => {
    console.log('Invoice status:', status)

    switch (status) {
      case 'paid':
        onSuccess?.()
        break
      case 'cancelled':
      case 'failed':
        onFailed?.()
        break
      case 'pending':
        onPending?.()
        break
      default:
        console.log('Unknown invoice status:', status)
    }
  })
}

/**
 * Full flow to unlock a post with payment
 */
export async function unlockPostWithPayment(
  userId: number,
  postId: number,
  onSuccess?: () => void,
  onFailed?: (error: string) => void
): Promise<void> {
  try {
    const result = await createUnlockInvoice(userId, postId)

    if (result.error) {
      onFailed?.(result.error)
      return
    }

    if (!result.invoice_link) {
      onFailed?.('Failed to create invoice')
      return
    }

    openInvoice(
      result.invoice_link,
      onSuccess,
      () => onFailed?.('Payment was cancelled'),
      () => console.log('Payment pending...')
    )
  } catch (err) {
    console.error('Unlock payment error:', err)
    onFailed?.('An error occurred')
  }
}

/**
 * Full flow to send a tip with payment
 */
export async function sendTipWithPayment(
  userId: number,
  toUserId: number,
  amount: number,
  message?: string,
  postId?: number,
  onSuccess?: () => void,
  onFailed?: (error: string) => void
): Promise<void> {
  try {
    const result = await createTipInvoice(userId, toUserId, amount, message, postId)

    if (result.error) {
      onFailed?.(result.error)
      return
    }

    if (!result.invoice_link) {
      onFailed?.('Failed to create invoice')
      return
    }

    openInvoice(
      result.invoice_link,
      onSuccess,
      () => onFailed?.('Payment was cancelled'),
      () => console.log('Payment pending...')
    )
  } catch (err) {
    console.error('Tip payment error:', err)
    onFailed?.('An error occurred')
  }
}

// Export types
export type { PaymentResponse, Wallet, Transaction }

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Answer pre-checkout query
async function answerPreCheckoutQuery(queryId: string, ok: boolean, errorMessage?: string) {
  try {
    const body: any = {
      pre_checkout_query_id: queryId,
      ok,
    }
    if (!ok && errorMessage) {
      body.error_message = errorMessage
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/answerPreCheckoutQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await response.json()
    console.log('Pre-checkout answer:', data)
    return data.ok
  } catch (err) {
    console.error('Error answering pre-checkout:', err)
    return false
  }
}

// Send notification to user
async function sendMessage(chatId: number, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      }),
    })
  } catch (err) {
    console.error('Error sending message:', err)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let update: any
  try {
    update = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  console.log('Received webhook update:', JSON.stringify(update))

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  // =============================================
  // Handle pre_checkout_query (MUST respond within 10 seconds)
  // =============================================
  if (update.pre_checkout_query) {
    const query = update.pre_checkout_query
    console.log('Pre-checkout query:', query)

    try {
      const payload = JSON.parse(query.invoice_payload)
      const { transaction_id } = payload

      // Verify transaction exists and is pending
      const { data: transaction } = await supabase
        .from('stars_transactions')
        .select('*')
        .eq('id', transaction_id)
        .eq('status', 'pending')
        .single()

      if (!transaction) {
        await answerPreCheckoutQuery(query.id, false, 'Transaction not found or already processed')
        return new Response('OK')
      }

      // All good, approve the payment
      await answerPreCheckoutQuery(query.id, true)

    } catch (err) {
      console.error('Error processing pre-checkout:', err)
      await answerPreCheckoutQuery(query.id, false, 'Payment processing error')
    }

    return new Response('OK')
  }

  // =============================================
  // Handle successful_payment
  // =============================================
  if (update.message?.successful_payment) {
    const payment = update.message.successful_payment
    const userId = update.message.from.id
    console.log('Successful payment:', payment)

    try {
      const payload = JSON.parse(payment.invoice_payload)
      const { type, transaction_id, post_id, to_user_id, message } = payload

      // Get transaction
      const { data: transaction, error: txError } = await supabase
        .from('stars_transactions')
        .select('*')
        .eq('id', transaction_id)
        .single()

      if (txError || !transaction) {
        console.error('Transaction not found:', transaction_id)
        return new Response('OK')
      }

      if (transaction.status === 'completed') {
        console.log('Transaction already completed:', transaction_id)
        return new Response('OK')
      }

      // Update transaction to completed
      await supabase
        .from('stars_transactions')
        .update({
          status: 'completed',
          telegram_payment_charge_id: payment.telegram_payment_charge_id,
        })
        .eq('id', transaction_id)

      // Update creator's wallet
      if (transaction.to_user_id) {
        const { data: wallet } = await supabase
          .from('wallets')
          .select('*')
          .eq('user_id', transaction.to_user_id)
          .single()

        if (wallet) {
          await supabase
            .from('wallets')
            .update({
              stars_balance: wallet.stars_balance + transaction.creator_amount,
              total_earned: wallet.total_earned + transaction.creator_amount,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', transaction.to_user_id)
        } else {
          // Create wallet if doesn't exist
          await supabase
            .from('wallets')
            .insert({
              user_id: transaction.to_user_id,
              stars_balance: transaction.creator_amount,
              total_earned: transaction.creator_amount,
            })
        }
      }

      // Update buyer's stats
      if (transaction.from_user_id) {
        const { data: buyerWallet } = await supabase
          .from('wallets')
          .select('*')
          .eq('user_id', transaction.from_user_id)
          .single()

        if (buyerWallet) {
          await supabase
            .from('wallets')
            .update({
              total_spent: buyerWallet.total_spent + transaction.amount,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', transaction.from_user_id)
        }
      }

      // Handle specific payment types
      if (type === 'unlock' && post_id) {
        // Record post purchase
        await supabase
          .from('post_purchases')
          .insert({
            user_id: userId,
            post_id: Number(post_id),
            transaction_id,
            amount: transaction.amount,
          })
          .single()

        // Send confirmation to buyer
        await sendMessage(userId, `Payment successful! You've unlocked the post. Open the app to view it.`)

        // Notify creator
        if (transaction.to_user_id) {
          const { data: buyer } = await supabase
            .from('users')
            .select('username, first_name')
            .eq('telegram_id', userId)
            .single()

          const buyerName = buyer?.first_name || buyer?.username || 'Someone'
          await sendMessage(
            transaction.to_user_id,
            `${buyerName} just unlocked your post for ${transaction.amount} Stars! You earned ${transaction.creator_amount} Stars.`
          )
        }
      }

      if (type === 'tip') {
        // Record tip
        await supabase
          .from('tips')
          .insert({
            from_user_id: userId,
            to_user_id: transaction.to_user_id,
            transaction_id,
            amount: transaction.amount,
            message: message || null,
            post_id: post_id ? Number(post_id) : null,
          })

        // Send confirmation to tipper
        await sendMessage(userId, `Tip sent successfully! Thank you for supporting the creator.`)

        // Notify creator
        if (transaction.to_user_id) {
          const { data: tipper } = await supabase
            .from('users')
            .select('username, first_name')
            .eq('telegram_id', userId)
            .single()

          const tipperName = tipper?.first_name || tipper?.username || 'Someone'
          let tipMessage = `${tipperName} sent you a tip of ${transaction.amount} Stars!`
          if (message) {
            tipMessage += `\n\nMessage: "${message}"`
          }
          tipMessage += `\n\nYou earned ${transaction.creator_amount} Stars.`

          await sendMessage(transaction.to_user_id, tipMessage)
        }
      }

      // Clean up pending invoice
      await supabase
        .from('pending_invoices')
        .delete()
        .eq('user_id', userId)
        .eq('metadata->>transaction_id', transaction_id)

    } catch (err) {
      console.error('Error processing successful payment:', err)
    }

    return new Response('OK')
  }

  // Ignore other update types
  return new Response('OK')
})

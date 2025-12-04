import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''

const PLATFORM_FEE_PERCENT = 15 // 15% platform fee

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders },
  })
}

// Create Telegram invoice link using Bot API
async function createInvoiceLink(
  title: string,
  description: string,
  payload: string,
  amount: number // in Stars
): Promise<string | null> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        payload,
        provider_token: '', // Empty for Stars
        currency: 'XTR',    // Telegram Stars
        prices: [{ label: title, amount }],
      }),
    })

    const data = await response.json()
    if (data.ok && data.result) {
      return data.result
    }
    console.error('Telegram API error:', data)
    return null
  } catch (err) {
    console.error('Error creating invoice:', err)
    return null
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  let body: {
    action: string
    user_id: number
    post_id?: number
    to_user_id?: number
    amount?: number
    message?: string
  }

  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const { action, user_id } = body
  if (!action || !user_id) {
    return jsonResponse({ error: 'Missing action or user_id' }, 400)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  // =============================================
  // ACTION: Create invoice to unlock a post
  // =============================================
  if (action === 'create_unlock_invoice') {
    const { post_id } = body
    if (!post_id) {
      return jsonResponse({ error: 'Missing post_id' }, 400)
    }

    // Get post info
    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, creator_id, unlock_price, content, creator:users!posts_creator_id_fkey(username, first_name)')
      .eq('id', post_id)
      .single()

    if (postError || !post) {
      return jsonResponse({ error: 'Post not found' }, 404)
    }

    if (post.unlock_price <= 0) {
      return jsonResponse({ error: 'Post is not locked' }, 400)
    }

    // Check if already purchased
    const { data: existing } = await supabase
      .from('post_purchases')
      .select('id')
      .eq('user_id', user_id)
      .eq('post_id', post_id)
      .single()

    if (existing) {
      return jsonResponse({ error: 'Already purchased' }, 400)
    }

    const amount = Math.ceil(post.unlock_price) // Stars amount
    const platformFee = Math.ceil(amount * PLATFORM_FEE_PERCENT / 100)
    const creatorAmount = amount - platformFee

    const creatorName = post.creator?.first_name || post.creator?.username || 'Creator'
    const title = `Unlock ${creatorName}'s Post`
    const description = `Unlock exclusive content from ${creatorName}`

    // Create transaction record
    const { data: transaction, error: txError } = await supabase
      .from('stars_transactions')
      .insert({
        type: 'unlock',
        from_user_id: user_id,
        to_user_id: post.creator_id,
        amount,
        platform_fee: platformFee,
        creator_amount: creatorAmount,
        status: 'pending',
        reference_type: 'post',
        reference_id: String(post_id),
      })
      .select()
      .single()

    if (txError) {
      console.error('Transaction error:', txError)
      return jsonResponse({ error: 'Failed to create transaction' }, 500)
    }

    // Create payload for Telegram (we'll use this to identify the payment)
    const payload = JSON.stringify({
      type: 'unlock',
      transaction_id: transaction.id,
      post_id,
      user_id,
    })

    // Create invoice link
    const invoiceLink = await createInvoiceLink(title, description, payload, amount)
    if (!invoiceLink) {
      // Cleanup failed transaction
      await supabase.from('stars_transactions').delete().eq('id', transaction.id)
      return jsonResponse({ error: 'Failed to create invoice' }, 500)
    }

    // Store pending invoice
    await supabase.from('pending_invoices').insert({
      user_id,
      invoice_type: 'unlock',
      amount,
      reference_type: 'post',
      reference_id: String(post_id),
      to_user_id: post.creator_id,
      invoice_link: invoiceLink,
      metadata: { transaction_id: transaction.id },
    })

    return jsonResponse({
      success: true,
      invoice_link: invoiceLink,
      amount,
      transaction_id: transaction.id,
    })
  }

  // =============================================
  // ACTION: Create invoice for tip
  // =============================================
  if (action === 'create_tip_invoice') {
    const { to_user_id, amount, message, post_id } = body

    if (!to_user_id || !amount || amount < 1) {
      return jsonResponse({ error: 'Missing to_user_id or invalid amount' }, 400)
    }

    // Get creator info
    const { data: creator, error: creatorError } = await supabase
      .from('users')
      .select('telegram_id, username, first_name')
      .eq('telegram_id', to_user_id)
      .single()

    if (creatorError || !creator) {
      return jsonResponse({ error: 'Creator not found' }, 404)
    }

    const platformFee = Math.ceil(amount * PLATFORM_FEE_PERCENT / 100)
    const creatorAmount = amount - platformFee

    const creatorName = creator.first_name || creator.username || 'Creator'
    const title = `Tip ${amount} Stars to ${creatorName}`
    const description = message || `Send a tip to ${creatorName}`

    // Create transaction record
    const { data: transaction, error: txError } = await supabase
      .from('stars_transactions')
      .insert({
        type: 'tip',
        from_user_id: user_id,
        to_user_id,
        amount,
        platform_fee: platformFee,
        creator_amount: creatorAmount,
        status: 'pending',
        reference_type: post_id ? 'post' : 'profile',
        reference_id: post_id ? String(post_id) : String(to_user_id),
        metadata: { message },
      })
      .select()
      .single()

    if (txError) {
      console.error('Transaction error:', txError)
      return jsonResponse({ error: 'Failed to create transaction' }, 500)
    }

    const payload = JSON.stringify({
      type: 'tip',
      transaction_id: transaction.id,
      to_user_id,
      user_id,
      post_id,
      message,
    })

    const invoiceLink = await createInvoiceLink(title, description, payload, amount)
    if (!invoiceLink) {
      await supabase.from('stars_transactions').delete().eq('id', transaction.id)
      return jsonResponse({ error: 'Failed to create invoice' }, 500)
    }

    await supabase.from('pending_invoices').insert({
      user_id,
      invoice_type: 'tip',
      amount,
      reference_type: 'tip',
      reference_id: String(to_user_id),
      to_user_id,
      invoice_link: invoiceLink,
      metadata: { transaction_id: transaction.id, message, post_id },
    })

    return jsonResponse({
      success: true,
      invoice_link: invoiceLink,
      amount,
      transaction_id: transaction.id,
    })
  }

  // =============================================
  // ACTION: Get user wallet
  // =============================================
  if (action === 'get_wallet') {
    const { data: wallet, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user_id)
      .single()

    if (error) {
      // Create wallet if doesn't exist
      const { data: newWallet, error: createError } = await supabase
        .from('wallets')
        .insert({ user_id })
        .select()
        .single()

      if (createError) {
        return jsonResponse({ error: 'Failed to get wallet' }, 500)
      }
      return jsonResponse({ wallet: newWallet })
    }

    return jsonResponse({ wallet })
  }

  // =============================================
  // ACTION: Get transaction history
  // =============================================
  if (action === 'get_transactions') {
    const { data: transactions, error } = await supabase
      .from('stars_transactions')
      .select('*')
      .or(`from_user_id.eq.${user_id},to_user_id.eq.${user_id}`)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return jsonResponse({ error: 'Failed to get transactions' }, 500)
    }

    return jsonResponse({ transactions })
  }

  // =============================================
  // ACTION: Check if post is purchased
  // =============================================
  if (action === 'check_purchase') {
    const { post_id } = body
    if (!post_id) {
      return jsonResponse({ error: 'Missing post_id' }, 400)
    }

    const { data: purchase } = await supabase
      .from('post_purchases')
      .select('id')
      .eq('user_id', user_id)
      .eq('post_id', post_id)
      .single()

    return jsonResponse({ purchased: !!purchase })
  }

  return jsonResponse({ error: 'Unknown action' }, 400)
})

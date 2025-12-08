// deno-lint-ignore-file no-explicit-any
// Confirm Stars payment: mark order completed, grant entitlements, post ledger.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PLATFORM_FEE_PERCENT (optional)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const defaultFeePercent = Number(Deno.env.get('PLATFORM_FEE_PERCENT') ?? 15)

const supabase = createClient(supabaseUrl, serviceRoleKey)

function json(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function getPlatformFeePercent() {
  const { data } = await supabase
    .from('platform_settings')
    .select('platform_fee_percent')
    .eq('id', 1)
    .single()
  return data?.platform_fee_percent ?? defaultFeePercent
}

async function addLedger(order: any) {
  const entries = []
  // User pays (debit)
  entries.push({
    order_id: order.id,
    user_id: order.user_id,
    amount: -order.amount,
    role: 'user',
    description: `${order.reference_type} payment`,
  })
  // Creator gets net
  if (order.creator_id && order.net > 0) {
    entries.push({
      order_id: order.id,
      user_id: order.creator_id,
      amount: order.net,
      role: 'creator',
      description: `${order.reference_type} earnings`,
    })
  }
  // Platform fee
  if (order.fee > 0) {
    entries.push({
      order_id: order.id,
      user_id: order.creator_id || order.user_id,
      amount: order.fee,
      role: 'platform',
      description: 'Platform fee',
    })
  }
  await supabase.from('ledger_entries').insert(entries)
}

async function updateWallets(order: any) {
  if (order.creator_id && order.net > 0) {
    await supabase.rpc('add_to_balance', {
      user_telegram_id: order.creator_id,
      amount_to_add: order.net,
    })
  }
}

async function grantEntitlement(order: any) {
  // Minimal: mark purchases/subs in existing tables
  if (order.reference_type === 'subscription') {
    await supabase.from('subscriptions').upsert({
      subscriber_id: order.user_id,
      creator_id: order.creator_id,
      is_active: true,
      price_paid: order.amount,
      expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    }, { onConflict: 'subscriber_id,creator_id' })
  }
  if (order.reference_type === 'unlock') {
    await supabase.from('content_purchases').insert({
      user_id: order.user_id,
      post_id: Number(order.reference_id),
      amount: order.amount,
    })
  }
  // Tips/livestreams can be extended similarly
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const payload = await req.json() as { orderId: number; providerPaymentId?: string }
    if (!payload.orderId) return json({ error: 'orderId required' }, 400)

    // Fetch order
    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', payload.orderId)
      .single()

    if (!order) return json({ error: 'Order not found' }, 404)
    if (order.status === 'completed') return json({ ok: true, message: 'Already completed' })

    const feePercent = await getPlatformFeePercent()
    const fee = Math.round((order.amount * feePercent) / 100)
    const net = Math.max(0, order.amount - fee)

    // Mark completed
    const { error: updError } = await supabase
      .from('orders')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        provider_payment_id: payload.providerPaymentId || order.provider_payment_id,
        fee,
        net,
      })
      .eq('id', order.id)
    if (updError) throw updError

    // Ledger + wallets + entitlement
    await addLedger({ ...order, fee, net })
    await updateWallets({ ...order, fee, net })
    await grantEntitlement({ ...order, fee, net })

    return json({ ok: true })
  } catch (e: any) {
    return json({ error: e?.message || 'Confirm error' }, 500)
  }
})

// deno-lint-ignore-file no-explicit-any
// Create a Stars order and return invoice URL.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_PROVIDER_TOKEN, PLATFORM_FEE_PERCENT (optional)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const providerToken = Deno.env.get('TELEGRAM_PROVIDER_TOKEN') ?? ''
const defaultFeePercent = Number(Deno.env.get('PLATFORM_FEE_PERCENT') ?? 15)

const supabase = createClient(supabaseUrl, serviceRoleKey)

function json(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

type CreateOrderPayload = {
  userId: number
  creatorId?: number
  referenceType: 'subscription' | 'unlock' | 'tip' | 'livestream'
  referenceId: string
  amount: number
}

async function getPlatformFeePercent() {
  const { data } = await supabase
    .from('platform_settings')
    .select('platform_fee_percent')
    .eq('id', 1)
    .single()
  return data?.platform_fee_percent ?? defaultFeePercent
}

async function createOrder(payload: CreateOrderPayload) {
  const feePercent = await getPlatformFeePercent()
  const fee = Math.round((payload.amount * feePercent) / 100)
  const net = Math.max(0, payload.amount - fee)

  const { data, error } = await supabase
    .from('orders')
    .insert({
      user_id: payload.userId,
      creator_id: payload.creatorId ?? null,
      reference_type: payload.referenceType,
      reference_id: payload.referenceId,
      amount: payload.amount,
      fee,
      net,
      currency: 'stars',
      status: 'pending',
      payment_provider: 'telegram_stars',
      metadata: {},
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create order')
  }
  return data
}

async function createStarsInvoice(order: any) {
  // Build Telegram invoice payload
  const title = `Order #${order.id}`
  const description = `${order.reference_type} for ${order.reference_id}`
  const payload = `${order.id}`
  const currency = 'XTR' // Telegram Stars
  const prices = [{ label: title, amount: order.amount }]

  // For Telegram Stars (XTR), provider_token must be empty string
  // For other payment providers, use the providerToken from env
  const tokenToUse = currency === 'XTR' ? '' : providerToken

  const res = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      description,
      payload,
      provider_token: tokenToUse,
      currency,
      prices,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Failed to create invoice')
  }
  const data = await res.json()
  if (!data.ok || !data.result) {
    throw new Error(data.description || 'Failed to create invoice')
  }
  return data.result as string
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const payload = await req.json() as CreateOrderPayload
    if (!payload.userId || !payload.referenceType || !payload.referenceId || !payload.amount) {
      return json({ error: 'Missing fields' }, 400)
    }
    const order = await createOrder(payload)
    const invoiceUrl = await createStarsInvoice(order)
    return json({ ok: true, orderId: order.id, invoiceUrl })
  } catch (e: any) {
    return json({ error: e?.message || 'Create order error' }, 500)
  }
})

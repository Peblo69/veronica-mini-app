import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from 'node:crypto'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const jwtSecret = Deno.env.get('JWT_SECRET') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...corsHeaders,
    },
  })
}

// Validate Telegram WebApp initData
// See: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
function validateTelegramData(initData: string): { valid: boolean; user?: any; authDate?: number } {
  if (!botToken) {
    console.warn('TELEGRAM_BOT_TOKEN not set')
    return { valid: false }
  }

  try {
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    if (!hash) return { valid: false }

    // Build data-check-string
    params.delete('hash')
    const dataCheckArr: string[] = []
    params.forEach((value, key) => {
      dataCheckArr.push(`${key}=${value}`)
    })
    dataCheckArr.sort()
    const dataCheckString = dataCheckArr.join('\n')

    // Compute secret key: HMAC-SHA256(botToken, "WebAppData")
    const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest()

    // Compute hash: HMAC-SHA256(dataCheckString, secretKey)
    const computedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

    if (computedHash !== hash) {
      console.warn('Hash mismatch')
      return { valid: false }
    }

    // Check auth_date is not too old (allow 1 hour)
    const authDate = parseInt(params.get('auth_date') || '0', 10)
    const now = Math.floor(Date.now() / 1000)
    if (now - authDate > 3600) {
      console.warn('Auth data too old')
      return { valid: false }
    }

    // Parse user data
    const userStr = params.get('user')
    const user = userStr ? JSON.parse(userStr) : null

    return { valid: true, user, authDate }
  } catch (err) {
    console.error('Error validating Telegram data:', err)
    return { valid: false }
  }
}

// Generate a Supabase JWT for the user
async function generateSupabaseJWT(telegramId: number, expiresIn = 3600): Promise<string> {
  // Use JOSE for JWT creation in Deno
  const { SignJWT } = await import('https://deno.land/x/jose@v5.2.0/index.ts')

  const secret = new TextEncoder().encode(jwtSecret)
  const now = Math.floor(Date.now() / 1000)

  const jwt = await new SignJWT({
    sub: `telegram:${telegramId}`,
    role: 'authenticated',
    aud: 'authenticated',
    telegram_id: telegramId,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + expiresIn)
    .setIssuer(supabaseUrl)
    .sign(secret)

  return jwt
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  let body: { initData?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const { initData } = body
  if (!initData) {
    return jsonResponse({ error: 'Missing initData' }, 400)
  }

  // Validate the Telegram data
  const validation = validateTelegramData(initData)
  if (!validation.valid || !validation.user) {
    return jsonResponse({ error: 'Invalid Telegram authentication' }, 401)
  }

  const telegramUser = validation.user
  const telegramId = telegramUser.id

  // Create Supabase client with service role
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  // Ensure user exists in our database
  const { data: existingUser, error: fetchError } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .single()

  if (fetchError && fetchError.code !== 'PGRST116') {
    // PGRST116 = no rows returned
    console.error('Error fetching user:', fetchError)
    return jsonResponse({ error: 'Database error' }, 500)
  }

  let user = existingUser
  if (!existingUser) {
    // Create user
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        telegram_id: telegramId,
        username: telegramUser.username || null,
        first_name: telegramUser.first_name || null,
        last_name: telegramUser.last_name || null,
        photo_url: telegramUser.photo_url || null,
        is_premium: telegramUser.is_premium || false,
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating user:', createError)
      return jsonResponse({ error: 'Failed to create user' }, 500)
    }
    user = newUser
  } else {
    // Update user info if changed
    await supabase
      .from('users')
      .update({
        username: telegramUser.username || existingUser.username,
        first_name: telegramUser.first_name || existingUser.first_name,
        last_name: telegramUser.last_name || existingUser.last_name,
        photo_url: telegramUser.photo_url || existingUser.photo_url,
        is_premium: telegramUser.is_premium || existingUser.is_premium,
        updated_at: new Date().toISOString(),
      })
      .eq('telegram_id', telegramId)
  }

  // Check if user is banned
  if (user?.is_banned) {
    return jsonResponse({
      error: 'Account banned',
      reason: user.banned_reason || 'No reason provided'
    }, 403)
  }

  // Generate Supabase JWT
  let accessToken: string
  try {
    accessToken = await generateSupabaseJWT(telegramId)
  } catch (err) {
    console.error('Error generating JWT:', err)
    return jsonResponse({ error: 'Failed to generate session' }, 500)
  }

  return jsonResponse({
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: 3600,
    user: {
      telegram_id: telegramId,
      username: user?.username,
      first_name: user?.first_name,
      last_name: user?.last_name,
      is_creator: user?.is_creator,
      is_verified: user?.is_verified,
      balance: user?.balance,
    },
  })
})

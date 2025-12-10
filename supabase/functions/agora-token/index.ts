import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { RtcRole, RtcTokenBuilder } from 'https://esm.sh/agora-access-token@2.0.2'

const AGORA_APP_ID = Deno.env.get('AGORA_APP_ID') ?? ''
const AGORA_APP_CERTIFICATE = Deno.env.get('AGORA_APP_CERTIFICATE') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Check configuration
    if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
      console.error('Agora credentials not configured')
      return jsonResponse({ error: 'Agora service not configured' }, 500)
    }

    // Parse request
    let channel: string
    let uid: string
    let role: 'publisher' | 'subscriber' = 'publisher'

    if (req.method === 'GET') {
      const url = new URL(req.url)
      channel = url.searchParams.get('channel') || ''
      uid = url.searchParams.get('uid') || '0'
      role = (url.searchParams.get('role') as 'publisher' | 'subscriber') || 'publisher'
    } else {
      const body = await req.json()
      channel = body.channel || ''
      uid = String(body.uid || '0')
      role = body.role || 'publisher'
    }

    if (!channel) {
      return jsonResponse({ error: 'Channel name is required' }, 400)
    }

    // Token expires in 24 hours
    const tokenExpireSeconds = 86400

    console.log(`[Agora Token] Generating token for channel: ${channel}, uid: ${uid}, role: ${role}`)

    // Use official Agora token builder (AccessToken v2)
    const uidNum = Number(uid)
    const useNumericUid = !Number.isNaN(uidNum)
    // Always use account-style UID (string) to avoid numeric/string mismatches between token and join
    const token = RtcTokenBuilder.buildTokenWithAccount(
      AGORA_APP_ID,
      AGORA_APP_CERTIFICATE,
      channel,
      uid,
      role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER,
      tokenExpireSeconds
    )

    console.log(`[Agora Token] Token generated successfully (length: ${token.length})`)

    return jsonResponse({
      token,
      appId: AGORA_APP_ID,
      channel,
      uid,
      expireIn: tokenExpireSeconds
    })

  } catch (error) {
    console.error('[Agora Token] Error:', error)
    return jsonResponse({ error: 'Failed to generate token' }, 500)
  }
})

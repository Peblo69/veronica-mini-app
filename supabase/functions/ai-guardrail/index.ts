// deno-lint-ignore-file no-explicit-any
// AI guardrail for text/image moderation and translation.
// Env required: OPENAI_API_KEY
// Deploy: supabase functions deploy ai-guardrail

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || ''
const TRANSLATE_MODEL = Deno.env.get('TRANSLATE_MODEL') || 'gpt-4o-mini' // Use mini for faster translations
const OPENAI_BASE = 'https://api.openai.com/v1'

// CORS headers for cross-origin requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type GuardrailRequest =
  | { type: 'text'; content: string }
  | { type: 'image'; imageUrl: string }
  | { type: 'translate'; content: string; targetLanguage: string }

function json(body: Record<string, any>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

async function moderateText(content: string) {
  const res = await fetch(`${OPENAI_BASE}/moderations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'omni-moderation-latest',
      input: content,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || 'Moderation failed')
  }
  const data = await res.json()
  const result = data.results?.[0]
  return {
    flagged: Boolean(result?.flagged),
    categories: result?.categories ?? {},
  }
}

async function moderateImage(imageUrl: string) {
  const prompt = `You are a safety system. Check the image for: minors, sexual content, explicit nudity, self-harm, hate symbols.
Return JSON with keys: flagged (true/false), reasons (array of strings). Keep it concise.`

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: prompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this image for safety.' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 0,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || 'Image moderation failed')
  }
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content || '{}'
  let parsed: any = {}
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = { flagged: false, reasons: ['unparsed'] }
  }
  return {
    flagged: Boolean(parsed.flagged),
    reasons: parsed.reasons || [],
  }
}

async function translate(content: string, targetLanguage: string) {
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: TRANSLATE_MODEL,
      messages: [
        {
          role: 'system',
          content: [
            `Translate the user's message into ${targetLanguage}.`,
            `Preserve tone, sarcasm, slang, and implied meaning; do NOT literalize.`,
            `If there are cultural references, paraphrase to preserve intent.`,
          ].join(' '),
        },
        { role: 'user', content },
      ],
      temperature: 0.3,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || 'Translate failed')
  }
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content || ''
  return text.trim()
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!OPENAI_API_KEY) return json({ error: 'Missing OPENAI_API_KEY' }, 500)

  let payload: GuardrailRequest
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  try {
    if (payload.type === 'text') {
      const result = await moderateText(payload.content)
      return json({ ok: true, type: 'text', result })
    }

    if (payload.type === 'image') {
      const result = await moderateImage(payload.imageUrl)
      return json({ ok: true, type: 'image', result })
    }

    if (payload.type === 'translate') {
      const translated = await translate(payload.content, payload.targetLanguage)
      return json({ ok: true, type: 'translate', translated })
    }

    return json({ error: 'Unknown type' }, 400)
  } catch (e: any) {
    return json({ error: e?.message || 'Guardrail error' }, 500)
  }
})

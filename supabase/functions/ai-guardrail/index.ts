// deno-lint-ignore-file no-explicit-any
// AI guardrail for text/image moderation and translation.
// Env required: OPENAI_API_KEY
// Deploy: supabase functions deploy ai-guardrail

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || ''
const TRANSLATE_MODEL = Deno.env.get('TRANSLATE_MODEL') || 'gpt-4o-mini'
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

// ============================================
// TEXT MODERATION - Uses OpenAI Moderation API
// ============================================
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
    category_scores: result?.category_scores ?? {},
  }
}

// ============================================
// IMAGE MODERATION - Two-tier approach
// Tier 1: OpenAI omni-moderation-latest (fast, built-in NSFW detection)
// Tier 2: GPT-4o vision for nuanced cases (minors + context analysis)
// ============================================

interface ImageModerationResult {
  flagged: boolean
  reasons: string[]
  categories: {
    sexual: boolean
    sexual_minors: boolean
    violence: boolean
    self_harm: boolean
    hate: boolean
  }
  scores: Record<string, number>
}

// Tier 1: Fast built-in moderation using omni-moderation-latest with image input
// Accepts both public URLs and base64 data URLs (data:image/...)
async function moderateImageTier1(imageUrl: string): Promise<{
  flagged: boolean
  categories: Record<string, boolean>
  scores: Record<string, number>
}> {
  console.log('[Tier1] Image type:', imageUrl.startsWith('data:') ? 'base64' : 'url', 'length:', imageUrl.length)

  const res = await fetch(`${OPENAI_BASE}/moderations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'omni-moderation-latest',
      input: [
        {
          type: 'image_url',
          image_url: { url: imageUrl }  // OpenAI accepts both URLs and base64 data URLs
        }
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[Tier1] Moderation API error:', err)
    throw new Error(err || 'Image moderation failed')
  }

  const data = await res.json()
  const result = data.results?.[0]

  return {
    flagged: Boolean(result?.flagged),
    categories: result?.categories ?? {},
    scores: result?.category_scores ?? {},
  }
}

// Tier 2: GPT-4o vision for nuanced analysis
// Only called when Tier 1 detects potential issues or for edge cases
async function moderateImageTier2(imageUrl: string): Promise<{
  flagged: boolean
  reasons: string[]
  minor_detected: boolean
  inappropriate_context: boolean
}> {
  const systemPrompt = `You are a content safety expert for an adult creator platform (18+). Analyze this image for policy violations.

MUST FLAG (return flagged: true) - EXPLICIT NUDITY:
1. Visible genitals (vagina, penis, fully exposed buttocks/anus)
2. Fully exposed female breasts with visible nipples (not covered by hands, pasties, or clothing)
3. Explicit sexual acts (intercourse, oral sex, masturbation)
4. ANY sexual content involving minors - CRITICAL, flag immediately
5. Graphic violence (gore, severe injuries, dead bodies)
6. Self-harm content (cutting, suicide imagery)
7. Hate symbols (swastikas, KKK imagery, etc.)

DO NOT FLAG - ALLOWED CONTENT:
- Bikini, swimwear, lingerie (clothed, even if revealing)
- Cleavage, sideboob (as long as nipples not fully visible)
- Sexy/suggestive poses while clothed or in underwear
- Covered nipples (with hands, pasties, tape, emoji, clothing)
- Tight/revealing clothing, crop tops, short shorts
- Artistic/tasteful implied nudity where genitals/nipples are not visible
- Fitness photos, gym selfies showing body
- Back shots even if showing bare back/shoulders

KEY DISTINCTION:
- SEXY but CLOTHED = ALLOWED
- EXPLICIT NUDITY (genitals, uncovered nipples) = BLOCKED

MINORS RULE:
- Any person appearing under 18 in sexual/suggestive context = ALWAYS FLAG
- Normal child photos (family, school) = OK

Return JSON only:
{
  "flagged": boolean,
  "reasons": ["specific reason"],
  "minor_detected": boolean,
  "inappropriate_context": boolean
}`

  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this image for content policy violations.' },
            { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 500,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[Tier2] GPT-4o error:', err)
    throw new Error(err || 'Image analysis failed')
  }

  const data = await res.json()
  const text = data.choices?.[0]?.message?.content || '{}'

  // Parse JSON from response (handle markdown code blocks)
  let parsed: any = {}
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/)
    const jsonStr = jsonMatch ? jsonMatch[1] : text
    parsed = JSON.parse(jsonStr.trim())
  } catch (e) {
    console.error('[Tier2] JSON parse error:', text)
    // If we can't parse, be conservative and flag if text contains concerning words
    const hasWarningWords = /flag|sexual|minor|nude|explicit/i.test(text)
    parsed = {
      flagged: hasWarningWords,
      reasons: ['Analysis parsing failed - flagged for manual review'],
      minor_detected: false,
      inappropriate_context: false
    }
  }

  return {
    flagged: Boolean(parsed.flagged),
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
    minor_detected: Boolean(parsed.minor_detected),
    inappropriate_context: Boolean(parsed.inappropriate_context),
  }
}

// Main image moderation function combining both tiers
async function moderateImage(imageUrl: string): Promise<ImageModerationResult> {
  console.log('[ImageMod] Starting moderation for image...')

  // Tier 1: Fast built-in moderation
  const tier1Result = await moderateImageTier1(imageUrl)
  console.log('[ImageMod] Tier1 result:', JSON.stringify(tier1Result))

  // Check Tier 1 categories that require immediate blocking
  const sexualScore = tier1Result.scores['sexual'] || 0
  const sexualMinorsScore = tier1Result.scores['sexual/minors'] || 0
  const violenceScore = tier1Result.scores['violence'] || 0
  const selfHarmScore = tier1Result.scores['self-harm'] || 0

  // Thresholds - tuned for adult creator platform
  // We want to allow sexy/suggestive but block explicit nudity
  const SEXUAL_IMMEDIATE_BLOCK = 0.85  // Very high score = definitely explicit, block immediately
  const SEXUAL_NEEDS_REVIEW = 0.3      // Medium score = might be explicit, send to Tier 2 for nuanced check
  const SEXUAL_MINORS_THRESHOLD = 0.05 // Very low - any hint of minors goes to Tier 2
  const VIOLENCE_THRESHOLD = 0.7
  const SELF_HARM_THRESHOLD = 0.6

  console.log('[ImageMod] Scores:', { sexualScore, sexualMinorsScore, violenceScore, selfHarmScore })

  // If VERY high sexual score (definitely explicit), block immediately
  if (sexualScore > SEXUAL_IMMEDIATE_BLOCK) {
    console.log('[ImageMod] Tier1 immediate block: very high sexual score')
    return {
      flagged: true,
      reasons: ['Explicit nudity detected - genitals or uncovered nipples not allowed'],
      categories: {
        sexual: true,
        sexual_minors: false,
        violence: false,
        self_harm: false,
        hate: false,
      },
      scores: tier1Result.scores,
    }
  }

  // If any indication of minors + sexual, ALWAYS run Tier 2
  if (sexualMinorsScore > SEXUAL_MINORS_THRESHOLD) {
    console.log('[ImageMod] Tier1 detected potential minor concern, escalating to Tier2...')
    const tier2Result = await moderateImageTier2(imageUrl)
    console.log('[ImageMod] Tier2 result:', JSON.stringify(tier2Result))

    // Critical: If Tier 2 confirms minor + inappropriate context, block
    if (tier2Result.minor_detected && tier2Result.inappropriate_context) {
      return {
        flagged: true,
        reasons: ['Content involving minors in inappropriate context'],
        categories: {
          sexual: true,
          sexual_minors: true,
          violence: false,
          self_harm: false,
          hate: false,
        },
        scores: tier1Result.scores,
      }
    }

    // If Tier 2 says it's flagged for other reasons
    if (tier2Result.flagged) {
      return {
        flagged: true,
        reasons: tier2Result.reasons,
        categories: {
          sexual: tier2Result.inappropriate_context,
          sexual_minors: tier2Result.minor_detected && tier2Result.inappropriate_context,
          violence: tier2Result.reasons.some(r => /violence|gore/i.test(r)),
          self_harm: tier2Result.reasons.some(r => /self.harm|suicide/i.test(r)),
          hate: tier2Result.reasons.some(r => /hate|symbol/i.test(r)),
        },
        scores: tier1Result.scores,
      }
    }
  }

  // Check violence/self-harm
  if (violenceScore > VIOLENCE_THRESHOLD) {
    return {
      flagged: true,
      reasons: ['Graphic violence detected'],
      categories: {
        sexual: false,
        sexual_minors: false,
        violence: true,
        self_harm: false,
        hate: false,
      },
      scores: tier1Result.scores,
    }
  }

  if (selfHarmScore > SELF_HARM_THRESHOLD) {
    return {
      flagged: true,
      reasons: ['Self-harm content detected'],
      categories: {
        sexual: false,
        sexual_minors: false,
        violence: false,
        self_harm: true,
        hate: false,
      },
      scores: tier1Result.scores,
    }
  }

  // If sexual score is in the "needs review" range, use Tier 2 for nuanced check
  // This catches: bikini (should pass) vs explicit nudity (should block)
  if (sexualScore > SEXUAL_NEEDS_REVIEW) {
    console.log('[ImageMod] Sexual score needs review, running Tier2 for nuanced check...')
    const tier2Result = await moderateImageTier2(imageUrl)
    console.log('[ImageMod] Tier2 nuanced result:', JSON.stringify(tier2Result))

    if (tier2Result.flagged) {
      return {
        flagged: true,
        reasons: tier2Result.reasons.length > 0
          ? tier2Result.reasons
          : ['Explicit nudity detected - genitals or uncovered nipples not allowed'],
        categories: {
          sexual: true,
          sexual_minors: tier2Result.minor_detected && tier2Result.inappropriate_context,
          violence: false,
          self_harm: false,
          hate: false,
        },
        scores: tier1Result.scores,
      }
    }
    // Tier 2 said it's OK (sexy but not explicit) - allow it
    console.log('[ImageMod] Tier2 approved - sexy but not explicit')
    return {
      flagged: false,
      reasons: [],
      categories: {
        sexual: false,
        sexual_minors: false,
        violence: false,
        self_harm: false,
        hate: false,
      },
      scores: tier1Result.scores,
    }
  }

  // If Tier 1 flagged for other reasons, run Tier 2 for verification
  if (tier1Result.flagged) {
    console.log('[ImageMod] Tier1 flagged for other reasons, running Tier2 for verification...')
    const tier2Result = await moderateImageTier2(imageUrl)
    console.log('[ImageMod] Tier2 verification result:', JSON.stringify(tier2Result))

    if (tier2Result.flagged) {
      return {
        flagged: true,
        reasons: tier2Result.reasons,
        categories: {
          sexual: tier1Result.categories['sexual'] || false,
          sexual_minors: tier2Result.minor_detected && tier2Result.inappropriate_context,
          violence: tier1Result.categories['violence'] || false,
          self_harm: tier1Result.categories['self-harm'] || false,
          hate: tier1Result.categories['hate'] || false,
        },
        scores: tier1Result.scores,
      }
    }
  }

  // Content is safe
  console.log('[ImageMod] Content approved - passed all checks')
  return {
    flagged: false,
    reasons: [],
    categories: {
      sexual: false,
      sexual_minors: false,
      violence: false,
      self_harm: false,
      hate: false,
    },
    scores: tier1Result.scores,
  }
}

// ============================================
// TRANSLATION
// ============================================
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

// ============================================
// MAIN HANDLER
// ============================================
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
    console.error('[Guardrail] Error:', e?.message || e)
    return json({ error: e?.message || 'Guardrail error' }, 500)
  }
})

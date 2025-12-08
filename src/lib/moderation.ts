export type TextModerationResult = {
  flagged: boolean
  categories: Record<string, boolean>
}

export type ImageModerationResult = {
  flagged: boolean
  reasons: string[]
}

const GUARDRAIL_URL = import.meta.env.VITE_AI_GUARDRAIL_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

async function callGuardrail(payload: any) {
  if (!GUARDRAIL_URL) {
    console.warn('[Guardrail] Missing VITE_AI_GUARDRAIL_URL')
    return null
  }
  if (!SUPABASE_ANON_KEY) {
    console.warn('[Guardrail] Missing VITE_SUPABASE_ANON_KEY for auth')
    return null
  }

  const res = await fetch(GUARDRAIL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const errorText = await res.text()
    console.error('[Guardrail] Error:', res.status, errorText)
    throw new Error(errorText)
  }
  return res.json()
}

export async function moderateText(content: string): Promise<TextModerationResult | null> {
  try {
    const data = await callGuardrail({ type: 'text', content })
    return data?.result || null
  } catch {
    return null
  }
}

export async function moderateImage(imageUrl: string): Promise<ImageModerationResult | null> {
  try {
    const data = await callGuardrail({ type: 'image', imageUrl })
    return data?.result || null
  } catch {
    return null
  }
}

export async function translateMessage(content: string, targetLanguage: string): Promise<string | null> {
  try {
    console.log('[Translate] Requesting translation to', targetLanguage, ':', content.slice(0, 50))
    const data = await callGuardrail({ type: 'translate', content, targetLanguage })
    console.log('[Translate] API response:', JSON.stringify(data))
    if (data?.translated) {
      console.log('[Translate] Success:', data.translated.slice(0, 50))
      return data.translated
    }
    console.warn('[Translate] No translation in response:', data)
    // If API returned ok but no translation, throw to show error in UI
    throw new Error('Translation service returned empty result')
  } catch (err) {
    console.error('[Translate] Error:', err)
    throw err // Re-throw so UI can show the error
  }
}

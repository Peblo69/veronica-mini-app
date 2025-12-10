export type TextModerationResult = {
  flagged: boolean
  categories: Record<string, boolean>
  category_scores?: Record<string, number>
}

export type ImageModerationResult = {
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

// Convert File/Blob to base64 data URL
async function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Convert blob URL to base64 data URL
async function blobUrlToBase64(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl)
  const blob = await response.blob()
  return fileToBase64(blob)
}

/**
 * Moderate an image for NSFW content
 * @param imageSource - Can be a File, Blob, blob URL (blob:...), or public URL
 */
export async function moderateImage(imageSource: string | File | Blob): Promise<ImageModerationResult | null> {
  try {
    let imageData: string

    if (imageSource instanceof File || imageSource instanceof Blob) {
      // Convert File/Blob directly to base64
      imageData = await fileToBase64(imageSource)
    } else if (imageSource.startsWith('blob:')) {
      // Convert blob URL to base64
      imageData = await blobUrlToBase64(imageSource)
    } else {
      // Assume it's a public URL - pass as-is
      imageData = imageSource
    }

    const data = await callGuardrail({ type: 'image', imageUrl: imageData })
    return data?.result || null
  } catch (err) {
    console.error('[moderateImage] Error:', err)
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

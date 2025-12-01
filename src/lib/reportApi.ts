import { supabase } from './supabase'

export type ReportedEntityType = 'user' | 'post' | 'message'

export interface ReportPayload {
  reporterId: number
  reportedId: string
  reportedType: ReportedEntityType
  reason: string
  description?: string
}

export interface ReportResult {
  success: boolean
  error?: string
}

// Generic helper that inserts a report row
export async function reportContent(payload: ReportPayload): Promise<ReportResult> {
  const { reporterId, reportedId, reportedType, reason, description } = payload

  const { error } = await supabase
    .from('reports')
    .insert({
      reporter_id: reporterId,
      reported_id: reportedId,
      reported_type: reportedType,
      reason,
      description,
      status: 'pending',
    })

  if (error) {
    console.error('Failed to submit report:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function reportPost(
  reporterId: number,
  postId: number,
  reason: string,
  description?: string
): Promise<ReportResult> {
  return reportContent({
    reporterId,
    reportedId: postId.toString(),
    reportedType: 'post',
    reason,
    description,
  })
}

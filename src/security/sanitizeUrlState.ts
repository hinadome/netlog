import type { AppUrlState } from '../model/appUrlState'

interface AnalysisSlice {
  eventCount: number
  sessions: { id: number }[]
  findings: { id: string }[]
}

/** Drop hash-derived ids that do not exist in the loaded capture. */
export function sanitizeAppUrlState(
  parsed: Partial<AppUrlState>,
  analysis: AnalysisSlice,
): Partial<AppUrlState> {
  const out: Partial<AppUrlState> = { ...parsed }

  if (out.sessionId !== undefined) {
    const validSession =
      Number.isFinite(out.sessionId) &&
      analysis.sessions.some((s) => s.id === out.sessionId)
    if (!validSession) {
      delete out.sessionId
      delete out.eventIndex
    }
  }

  if (out.eventIndex !== undefined) {
    const validEvent =
      Number.isFinite(out.eventIndex) &&
      out.eventIndex >= 0 &&
      out.eventIndex < analysis.eventCount
    if (!validEvent) delete out.eventIndex
  }

  if (out.findingId && !analysis.findings.some((f) => f.id === out.findingId)) {
    delete out.findingId
  }

  return out
}

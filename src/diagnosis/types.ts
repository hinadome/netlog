export type FindingSeverity = 'critical' | 'error' | 'warning' | 'info'

export interface Finding {
  id: string
  severity: FindingSeverity
  title: string
  explanation: string
  suggestion: string
  /** Protocol session source id, if applicable. */
  sessionId?: number
  protocol?: 'h2' | 'h3'
  streamId?: number
  /** Event indices in the parsed events array for timeline highlighting. */
  evidenceEventIndexes: number[]
  host?: string
  url?: string
  ruleId: string
}

export interface AnalysisResult {
  fileName: string
  eventCount: number
  http2Sessions: import('../model/http2Session').ProtocolSession[]
  quicSessions: import('../model/http2Session').ProtocolSession[]
  urlRequestCount: number
  failedUrlRequestCount: number
  findings: Finding[]
  /** Serialized-friendly session summaries for worker transfer. */
  sessionSummaries: SessionSummary[]
}

export interface SessionSummary {
  id: number
  protocol: 'h2' | 'h3'
  host: string
  proxy: string
  startTimeMs: number
  endTimeMs: number
  streamCount: number
  hasError: boolean
  error?: string
  negotiatedProtocol?: string
  quicVersion?: string
}

export interface SessionDetailPayload {
  session: import('../model/http2Session').ProtocolSession
  /** Streams as array for structured clone. */
  streams: import('../model/http2Session').SessionStream[]
  findings: Finding[]
}

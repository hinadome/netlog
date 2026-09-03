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
  urlRequests: UrlRequestSummary[]
  polledOnlySessionCount: number
  polledEnrichedCount: number
}

export interface SessionSummary {
  id: number
  protocol: 'h2' | 'h3'
  host: string
  /** Request paths seen on streams in this session (for list filtering). */
  paths: string[]
  proxy: string
  startTimeMs: number
  endTimeMs: number
  streamCount: number
  hasError: boolean
  error?: string
  negotiatedProtocol?: string
  quicVersion?: string
  origin?: import('../model/sessionOrigin').SessionOrigin
  /** From polledData when stream list is unavailable (snapshot-only). */
  polledActiveStreams?: number
}

/** Serializable URL_REQUEST row for UI tables. */
export interface UrlRequestSummary {
  sourceId: number
  url?: string
  method?: string
  netError?: string
  netErrorCode?: number
  startTimeMs: number
  endTimeMs: number
  relatedSessionIds: number[]
  /** Global event index for jump-to-evidence (usually URL_REQUEST END). */
  evidenceEventIndex?: number
  /** Slim event list for waterfall visualization. */
  timelineEvents?: Array<{ type: string; timeMs: number; phase: string }>
}

export interface TimeBrushRange {
  startMs: number
  endMs: number
}

export interface SessionDetailPayload {
  session: import('../model/http2Session').ProtocolSession
  /** Streams as array for structured clone. */
  streams: import('../model/http2Session').SessionStream[]
  findings: Finding[]
}

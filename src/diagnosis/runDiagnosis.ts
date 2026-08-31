import { buildUrlRequests, correlateSessions } from '../model/correlate'
import { buildHttp2Sessions, type ProtocolSession, type SessionStream } from '../model/http2Session'
import { buildQuicSessions } from '../model/quicSession'
import type { ParsedNetlog } from '../parser/types'
import type { ParseProgress } from '../parser/readNetlog'
import {
  resetFindingIds,
  ruleFlowControl,
  ruleInvalidHeaders,
  rulePingTimeout,
  ruleRstAndGoaway,
  ruleUrlRequestErrors,
} from './rules/http2Rules'
import { resetQuicFindingIds, ruleQuicConnectionClose, ruleQuicHandshake } from './rules/quicRules'
import type { AnalysisResult, Finding, SessionSummary } from './types'

const SEVERITY_ORDER: Record<Finding['severity'], number> = {
  critical: 0,
  error: 1,
  warning: 2,
  info: 3,
}

export interface TransferSession {
  id: number
  protocol: 'h2' | 'h3'
  host: string
  proxy: string
  startTimeMs: number
  endTimeMs: number
  secure: boolean
  negotiatedProtocol?: string
  error?: string
  settingsSent: Record<string, number | string>
  settingsReceived: Record<string, number | string>
  streams: SessionStream[]
  events: ProtocolSession['events']
  relatedSourceIds: number[]
  hasError: boolean
  quicVersion?: string
  connectionIds?: string[]
  connectionClose?: ProtocolSession['connectionClose']
}

export interface TransferAnalysis {
  fileName: string
  eventCount: number
  urlRequestCount: number
  failedUrlRequestCount: number
  findings: Finding[]
  sessionSummaries: SessionSummary[]
  sessions: TransferSession[]
}

function toSummary(s: ProtocolSession): SessionSummary {
  return {
    id: s.id,
    protocol: s.protocol,
    host: s.host,
    proxy: s.proxy,
    startTimeMs: s.startTimeMs,
    endTimeMs: s.endTimeMs,
    streamCount: s.streams.size,
    hasError: s.hasError,
    error: s.error,
    negotiatedProtocol: s.negotiatedProtocol,
    quicVersion: s.quicVersion,
  }
}

function toTransfer(s: ProtocolSession): TransferSession {
  return {
    id: s.id,
    protocol: s.protocol,
    host: s.host,
    proxy: s.proxy,
    startTimeMs: s.startTimeMs,
    endTimeMs: s.endTimeMs,
    secure: s.secure,
    negotiatedProtocol: s.negotiatedProtocol,
    error: s.error,
    settingsSent: s.settingsSent,
    settingsReceived: s.settingsReceived,
    streams: [...s.streams.values()].sort((a, b) => a.streamId - b.streamId),
    events: s.events,
    relatedSourceIds: s.relatedSourceIds,
    hasError: s.hasError,
    quicVersion: s.quicVersion,
    connectionIds: s.connectionIds,
    connectionClose: s.connectionClose,
  }
}

export function runDiagnosis(
  parsed: ParsedNetlog,
  onProgress?: (p: ParseProgress) => void,
): AnalysisResult {
  onProgress?.({ stage: 'modeling', percent: 96, message: 'Building HTTP/2 sessions…' })
  resetFindingIds()
  resetQuicFindingIds()

  const http2Sessions = buildHttp2Sessions(parsed)
  onProgress?.({ stage: 'modeling', percent: 97, message: 'Building QUIC sessions…' })
  const quicSessions = buildQuicSessions(parsed)
  const allSessions = [...http2Sessions, ...quicSessions]

  const urlRequests = buildUrlRequests(parsed)
  correlateSessions(allSessions, urlRequests, parsed)

  onProgress?.({ stage: 'diagnosing', percent: 98, message: 'Running diagnosis rules…' })

  const findings: Finding[] = [
    ...ruleInvalidHeaders(http2Sessions),
    ...ruleRstAndGoaway(http2Sessions),
    ...ruleFlowControl(http2Sessions),
    ...rulePingTimeout(http2Sessions),
    ...ruleQuicConnectionClose(quicSessions),
    ...ruleQuicHandshake(quicSessions),
    ...ruleUrlRequestErrors(allSessions, urlRequests),
  ]

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  let failedUrlRequestCount = 0
  for (const r of urlRequests.values()) {
    if (r.netError) failedUrlRequestCount += 1
  }

  onProgress?.({ stage: 'done', percent: 100, message: 'Analysis complete' })

  return {
    fileName: parsed.fileName,
    eventCount: parsed.eventCount,
    http2Sessions,
    quicSessions,
    urlRequestCount: urlRequests.size,
    failedUrlRequestCount,
    findings,
    sessionSummaries: allSessions.map(toSummary),
  }
}

export function toTransferAnalysis(result: AnalysisResult): TransferAnalysis {
  return {
    fileName: result.fileName,
    eventCount: result.eventCount,
    urlRequestCount: result.urlRequestCount,
    failedUrlRequestCount: result.failedUrlRequestCount,
    findings: result.findings,
    sessionSummaries: result.sessionSummaries,
    sessions: [...result.http2Sessions, ...result.quicSessions].map(toTransfer),
  }
}

export function findingsForSession(findings: Finding[], sessionId: number): Finding[] {
  return findings.filter((f) => f.sessionId === sessionId)
}

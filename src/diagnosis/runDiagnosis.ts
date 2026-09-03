import { buildUrlRequests, correlateSessions, type UrlRequestInfo } from '../model/correlate'
import { buildHttp2Sessions, type ProtocolSession, type SessionStream } from '../model/http2Session'
import { mergePolledH2IntoSessions } from '../model/mergePolledSessions'
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
import { resetHeaderFindingIds, ruleHeaderAnomalies } from './rules/headerRules'
import { resetQuicFindingIds, ruleQuicConnectionClose, ruleQuicHandshake } from './rules/quicRules'
import { resetTlsFindingIds, ruleTlsAlpn } from './rules/tlsRules'
import type { AnalysisResult, Finding, SessionSummary, UrlRequestSummary } from './types'
import type { PolledH2Session } from '../model/polledData'
import type { SessionOrigin } from '../model/sessionOrigin'

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
  origin: SessionOrigin
  polledSnapshot?: PolledH2Session
}

export interface TransferAnalysis {
  fileName: string
  eventCount: number
  urlRequestCount: number
  failedUrlRequestCount: number
  findings: Finding[]
  sessionSummaries: SessionSummary[]
  sessions: TransferSession[]
  urlRequests: UrlRequestSummary[]
  /** HTTP/2 sessions present only in polledData (no event stream). */
  polledOnlySessionCount: number
  /** Event sessions that also have a polledData snapshot attached. */
  polledEnrichedCount: number
}

function toUrlRequestSummary(req: UrlRequestInfo): UrlRequestSummary {
  const endEv = [...req.events].reverse().find((e) => e.params.net_error !== undefined)
  const lastEv = req.events[req.events.length - 1]
  return {
    sourceId: req.sourceId,
    url: req.url,
    method: req.method,
    netError: req.netError,
    netErrorCode: req.netErrorCode,
    startTimeMs: req.startTimeMs,
    endTimeMs: req.endTimeMs,
    relatedSessionIds: [...req.relatedSessionIds],
    evidenceEventIndex: endEv?.index ?? lastEv?.index,
    timelineEvents: req.events.map((e) => ({
      type: e.type,
      timeMs: e.timeMs,
      phase: e.phase,
    })),
  }
}

function collectSessionPaths(s: ProtocolSession): string[] {
  const paths = new Set<string>()
  for (const stream of s.streams.values()) {
    const path = stream.path?.trim()
    if (path) paths.add(path)
  }
  return [...paths].sort((a, b) => a.localeCompare(b))
}

function toSummary(s: ProtocolSession): SessionSummary {
  const origin = s.origin ?? 'events'
  const streamCount =
    origin === 'polledOnly' && s.polledSnapshot?.activeStreams != null
      ? s.polledSnapshot.activeStreams
      : s.streams.size
  return {
    id: s.id,
    protocol: s.protocol,
    host: s.host,
    paths: collectSessionPaths(s),
    proxy: s.proxy,
    startTimeMs: s.startTimeMs,
    endTimeMs: s.endTimeMs,
    streamCount,
    hasError: s.hasError,
    error: s.error,
    negotiatedProtocol: s.negotiatedProtocol,
    quicVersion: s.quicVersion,
    origin,
    polledActiveStreams: s.polledSnapshot?.activeStreams,
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
    origin: s.origin ?? 'events',
    polledSnapshot: s.polledSnapshot,
  }
}

export function runDiagnosis(
  parsed: ParsedNetlog,
  onProgress?: (p: ParseProgress) => void,
): AnalysisResult {
  onProgress?.({ stage: 'modeling', percent: 96, message: 'Building HTTP/2 sessions…' })
  resetFindingIds()
  resetQuicFindingIds()
  resetHeaderFindingIds()
  resetTlsFindingIds()

  const http2Built = buildHttp2Sessions(parsed)
  const { sessions: http2Sessions, polledOnlyCount, enrichedCount } = mergePolledH2IntoSessions(
    http2Built,
    parsed.polledData,
  )
  onProgress?.({ stage: 'modeling', percent: 97, message: 'Building QUIC sessions…' })
  const quicSessions = buildQuicSessions(parsed)
  const allSessions = [...http2Sessions, ...quicSessions]

  const urlRequests = buildUrlRequests(parsed)
  correlateSessions(allSessions, urlRequests, parsed)

  onProgress?.({ stage: 'diagnosing', percent: 98, message: 'Running diagnosis rules…' })

  const findings: Finding[] = [
    ...ruleInvalidHeaders(http2Sessions),
    ...ruleHeaderAnomalies(http2Sessions),
    ...ruleRstAndGoaway(http2Sessions),
    ...ruleFlowControl(http2Sessions),
    ...rulePingTimeout(http2Sessions),
    ...ruleQuicConnectionClose(quicSessions),
    ...ruleQuicHandshake(quicSessions),
    ...ruleTlsAlpn(parsed, allSessions),
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
    urlRequests: [...urlRequests.values()].map(toUrlRequestSummary),
    polledOnlySessionCount: polledOnlyCount,
    polledEnrichedCount: enrichedCount,
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
    urlRequests: result.urlRequests,
    polledOnlySessionCount: result.polledOnlySessionCount,
    polledEnrichedCount: result.polledEnrichedCount,
  }
}

export function findingsForSession(findings: Finding[], sessionId: number): Finding[] {
  return findings.filter((f) => f.sessionId === sessionId)
}

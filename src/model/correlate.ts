import type { NetlogEvent, ParsedNetlog, SourceEntry } from '../parser/types'
import type { ProtocolSession } from './http2Session'

export interface UrlRequestInfo {
  sourceId: number
  url?: string
  method?: string
  netError?: string
  netErrorCode?: number
  startTimeMs: number
  endTimeMs: number
  relatedSessionIds: number[]
  events: NetlogEvent[]
}

function sourceDependencyId(params: Record<string, unknown>): number | undefined {
  const dep = params.source_dependency
  if (dep && typeof dep === 'object' && 'id' in dep) {
    const id = (dep as { id: unknown }).id
    if (typeof id === 'number') return id
  }
  return undefined
}

export function buildUrlRequests(parsed: ParsedNetlog): Map<number, UrlRequestInfo> {
  const map = new Map<number, UrlRequestInfo>()

  for (const source of parsed.sources.values()) {
    if (source.type !== 'URL_REQUEST') continue
    const info: UrlRequestInfo = {
      sourceId: source.id,
      startTimeMs: source.startTimeMs,
      endTimeMs: source.endTimeMs,
      relatedSessionIds: [],
      events: source.events,
    }

    for (const ev of source.events) {
      const p = ev.params
      if (typeof p.url === 'string') info.url = p.url
      if (ev.type === 'HTTP_TRANSACTION_SEND_REQUEST_HEADERS' || ev.type === 'URL_REQUEST_START_JOB') {
        if (typeof p.method === 'string') info.method = p.method
      }
      if (ev.type === 'URL_REQUEST' && ev.phase === 'END') {
        const netError = p.net_error
        if (typeof netError === 'number' && netError < 0) {
          info.netErrorCode = netError
          info.netError =
            parsed.constants.netErrorToName.get(netError) ?? `net_error ${netError}`
        } else if (typeof netError === 'string' && netError !== 'ok' && netError !== '0') {
          info.netError = netError
        }
      }
      // Capture failed request line
      if (
        (ev.type === 'FAILED' || ev.type.includes('ERROR') || ev.phase === 'END') &&
        typeof p.net_error === 'number' &&
        p.net_error < 0
      ) {
        info.netErrorCode = p.net_error
        info.netError =
          parsed.constants.netErrorToName.get(p.net_error) ?? `net_error ${p.net_error}`
      }
    }

    map.set(source.id, info)
  }

  return map
}

/** Link sessions to URL_REQUEST sources via stream dependencies and reverse lookup. */
export function correlateSessions(
  sessions: ProtocolSession[],
  urlRequests: Map<number, UrlRequestInfo>,
  parsed: ParsedNetlog,
): void {
  // Build reverse map: any source id -> parent HTTP2/QUIC session via events mentioning them
  const sourceToSession = new Map<number, number>()

  for (const session of sessions) {
    sourceToSession.set(session.id, session.id)
    for (const sid of session.relatedSourceIds) {
      sourceToSession.set(sid, session.id)
    }
    for (const stream of session.streams.values()) {
      if (stream.urlRequestSourceId !== undefined) {
        sourceToSession.set(stream.urlRequestSourceId, session.id)
        const req = urlRequests.get(stream.urlRequestSourceId)
        if (req && !req.relatedSessionIds.includes(session.id)) {
          req.relatedSessionIds.push(session.id)
        }
      }
    }
  }

  // Walk HTTP_STREAM_JOB and similar intermediates
  for (const source of parsed.sources.values()) {
    if (
      source.type !== 'HTTP_STREAM_JOB' &&
      source.type !== 'HTTP_STREAM_JOB_CONTROLLER' &&
      source.type !== 'HTTP2_SESSION' &&
      source.type !== 'QUIC_SESSION'
    ) {
      continue
    }
    for (const ev of source.events) {
      const dep = sourceDependencyId(ev.params)
      if (dep === undefined) continue
      const sessionId = sourceToSession.get(source.id) ?? sourceToSession.get(dep)
      if (sessionId !== undefined) {
        sourceToSession.set(dep, sessionId)
        sourceToSession.set(source.id, sessionId)
      }
    }
  }

  for (const req of urlRequests.values()) {
    const sessionId = sourceToSession.get(req.sourceId)
    if (sessionId !== undefined && !req.relatedSessionIds.includes(sessionId)) {
      req.relatedSessionIds.push(sessionId)
    }
    // Also scan request events for session deps
    for (const ev of req.events) {
      const dep = sourceDependencyId(ev.params)
      if (dep !== undefined) {
        const sid = sourceToSession.get(dep)
        if (sid !== undefined && !req.relatedSessionIds.includes(sid)) {
          req.relatedSessionIds.push(sid)
        }
      }
    }
  }
}

export function getSource(parsed: ParsedNetlog, id: number): SourceEntry | undefined {
  return parsed.sources.get(id)
}

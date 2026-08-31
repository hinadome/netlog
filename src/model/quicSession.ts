import type { NetlogEvent, ParsedNetlog } from '../parser/types'
import { sourcesOfType } from '../parser/indexSources'
import type { ProtocolSession, SessionStream } from './http2Session'

function sourceDependencyId(params: Record<string, unknown>): number | undefined {
  const dep = params.source_dependency
  if (dep && typeof dep === 'object' && 'id' in dep) {
    const id = (dep as { id: unknown }).id
    if (typeof id === 'number') return id
  }
  if (typeof dep === 'number') return dep
  return undefined
}

import { splitHeaderLine } from './http2Session'

function parseHeaders(params: Record<string, unknown>): Record<string, string> | undefined {
  const headers = params.headers
  if (Array.isArray(headers)) {
    const out: Record<string, string> = {}
    for (const h of headers) {
      if (typeof h === 'string') {
        const pair = splitHeaderLine(h)
        if (pair) out[pair[0]] = pair[1]
      }
    }
    return out
  }
  if (headers && typeof headers === 'object') {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      out[k.toLowerCase()] = String(v)
    }
    return out
  }
  return undefined
}

function ensureStream(session: ProtocolSession, streamId: number): SessionStream {
  let s = session.streams.get(streamId)
  if (!s) {
    s = {
      streamId,
      bytesSent: 0,
      bytesReceived: 0,
      finReceived: false,
      finSent: false,
      hasError: false,
    }
    session.streams.set(streamId, s)
  }
  return s
}

function extractQuicMeta(events: NetlogEvent[]): {
  host: string
  version?: string
  connectionIds: string[]
  secure: boolean
} {
  let host = ''
  let version: string | undefined
  const connectionIds: string[] = []
  for (const ev of events) {
    const p = ev.params
    if (typeof p.host === 'string' && p.host) host = p.host
    if (typeof p.version === 'string') version = p.version
    if (typeof p.connection_id === 'string') connectionIds.push(p.connection_id)
    if (typeof p.client_connection_id === 'string') connectionIds.push(p.client_connection_id)
  }
  return { host: host || '(unknown quic host)', version, connectionIds: [...new Set(connectionIds)], secure: true }
}

function applyQuicEvent(session: ProtocolSession, ev: NetlogEvent): void {
  const p = ev.params
  const streamId =
    typeof p.stream_id === 'number'
      ? p.stream_id
      : typeof p.quic_stream_id === 'number'
        ? p.quic_stream_id
        : undefined

  const dep = sourceDependencyId(p)
  if (dep !== undefined) session.relatedSourceIds.push(dep)

  if (ev.type === 'QUIC_SESSION_CLOSED' || ev.type === 'QUIC_SESSION_CLOSE_ON_ERROR') {
    session.hasError = true
    session.error = String(p.details ?? p.net_error ?? p.quic_error ?? 'session closed')
  }

  if (
    ev.type === 'QUIC_SESSION_CONNECTION_CLOSE_FRAME_RECEIVED' ||
    ev.type === 'QUIC_SESSION_CONNECTION_CLOSE_FRAME_SENT' ||
    ev.type === 'QUIC_CONNECTION_CLOSE_FRAME_RECEIVED' ||
    ev.type === 'QUIC_CONNECTION_CLOSE_FRAME_SENT'
  ) {
    session.hasError = true
    session.connectionClose = {
      errorCode: String(p.quic_error ?? p.error_code ?? p.close_type ?? 'CONNECTION_CLOSE'),
      details: typeof p.details === 'string' ? p.details : typeof p.error_details === 'string' ? p.error_details : undefined,
      fromPeer: ev.type.includes('RECEIVED'),
    }
    session.error = session.connectionClose.errorCode
  }

  if (ev.type.includes('GOAWAY')) {
    const code = String(p.error_code ?? p.quic_error ?? '')
    if (code && !/NO_ERROR|^0$/i.test(code)) {
      session.hasError = true
      session.error = `GOAWAY ${code}`
    }
  }

  if (streamId !== undefined && streamId >= 0) {
    const stream = ensureStream(session, streamId)
    if (dep !== undefined) stream.urlRequestSourceId = dep

    if (ev.type.includes('HEADERS') || ev.type.includes('HTTP3')) {
      const headers = parseHeaders(p)
      if (headers) {
        const isSend = ev.type.includes('SEND') || ev.type.includes('SENT')
        if (isSend) {
          stream.requestHeaders = { ...stream.requestHeaders, ...headers }
          stream.method = headers[':method'] ?? stream.method
          stream.path = headers[':path'] ?? stream.path
          stream.authority = headers[':authority'] ?? stream.authority
        } else if (ev.type.includes('RECV') || ev.type.includes('RECEIVED')) {
          stream.responseHeaders = { ...stream.responseHeaders, ...headers }
          stream.status = headers[':status'] ?? stream.status
        }
      }
    }

    if (ev.type.includes('RST') || ev.type.includes('RESET_STREAM') || ev.type.includes('STOP_SENDING')) {
      stream.rstError = String(p.quic_rst_stream_error ?? p.error_code ?? p.quic_error ?? 'RST')
      stream.rstDirection = ev.type.includes('SEND') || ev.type.includes('SENT') ? 'sent' : 'received'
      stream.hasError = true
      session.hasError = true
    }

    if (ev.type.includes('DATA') || ev.type.includes('STREAM_FRAME')) {
      const size = typeof p.length === 'number' ? p.length : typeof p.size === 'number' ? p.size : 0
      const isSend = ev.type.includes('SEND') || ev.type.includes('SENT')
      if (isSend) stream.bytesSent += size
      else stream.bytesReceived += size
    }
  }
}

export function buildQuicSessions(parsed: ParsedNetlog): ProtocolSession[] {
  const entries = sourcesOfType(parsed.sources, 'QUIC_SESSION')
  const sessions: ProtocolSession[] = []

  for (const entry of entries) {
    const meta = extractQuicMeta(entry.events)
    const session: ProtocolSession = {
      id: entry.id,
      protocol: 'h3',
      host: meta.host,
      proxy: '',
      startTimeMs: entry.startTimeMs,
      endTimeMs: entry.endTimeMs,
      secure: meta.secure,
      negotiatedProtocol: 'h3',
      quicVersion: meta.version,
      connectionIds: meta.connectionIds,
      settingsSent: {},
      settingsReceived: {},
      streams: new Map(),
      events: entry.events,
      relatedSourceIds: [],
      hasError: false,
    }

    for (const ev of entry.events) {
      applyQuicEvent(session, ev)
    }

    session.relatedSourceIds = [...new Set(session.relatedSourceIds)]
    sessions.push(session)
  }

  return sessions
}

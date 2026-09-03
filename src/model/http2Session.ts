import type { NetlogEvent, ParsedNetlog, SourceEntry } from '../parser/types'
import { sourcesOfType } from '../parser/indexSources'
import type { PolledH2Session } from './polledData'
import { assignSafeScalar, assignSafeString, isSafeRecordKey } from '../security/safeRecord'
import type { SessionOrigin } from './sessionOrigin'
import { isBenignResetOrCloseCode } from './sessionIssues'

export type ProtocolKind = 'h2' | 'h3'

export interface SessionStream {
  streamId: number
  method?: string
  path?: string
  authority?: string
  status?: string
  requestHeaders?: Record<string, string>
  responseHeaders?: Record<string, string>
  bytesSent: number
  bytesReceived: number
  finReceived: boolean
  finSent: boolean
  rstError?: string
  rstDescription?: string
  rstDirection?: 'sent' | 'received'
  urlRequestSourceId?: number
  hasError: boolean
}

export interface ProtocolSession {
  id: number
  protocol: ProtocolKind
  host: string
  proxy: string
  startTimeMs: number
  endTimeMs: number
  secure: boolean
  negotiatedProtocol?: string
  error?: string
  settingsSent: Record<string, number | string>
  settingsReceived: Record<string, number | string>
  streams: Map<number, SessionStream>
  events: NetlogEvent[]
  /** Source ids related via source_dependency. */
  relatedSourceIds: number[]
  hasError: boolean
  /** QUIC-specific */
  quicVersion?: string
  connectionIds?: string[]
  connectionClose?: {
    errorCode?: string
    details?: string
    fromPeer?: boolean
  }
  /** events (default) · events+polled · polledOnly */
  origin?: SessionOrigin
  /** Chrome polledData.spdySessionInfo row when present. */
  polledSnapshot?: PolledH2Session
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function sourceDependencyId(params: Record<string, unknown>): number | undefined {
  const dep = params.source_dependency
  if (dep && typeof dep === 'object' && 'id' in dep) {
    const id = (dep as { id: unknown }).id
    if (typeof id === 'number') return id
  }
  if (typeof dep === 'number') return dep
  return undefined
}

/** Split "name: value" including HTTP/2 pseudo-headers like ":method: GET". */
export function splitHeaderLine(line: string): [string, string] | null {
  if (line.startsWith(':')) {
    const idx = line.indexOf(':', 1)
    if (idx < 0) return null
    return [line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim()]
  }
  const idx = line.indexOf(':')
  if (idx <= 0) return null
  return [line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim()]
}

function parseHeaders(params: Record<string, unknown>): Record<string, string> | undefined {
  const headers = params.headers
  if (Array.isArray(headers)) {
    const out: Record<string, string> = {}
    for (const h of headers) {
      if (typeof h === 'string') {
        const pair = splitHeaderLine(h)
        if (pair) out[pair[0]] = pair[1]
      } else if (h && typeof h === 'object') {
        const rec = h as Record<string, unknown>
        for (const [k, v] of Object.entries(rec)) {
          assignSafeString(out, k, String(v))
        }
      }
    }
    return out
  }
  if (headers && typeof headers === 'object') {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      assignSafeString(out, k, String(v))
    }
    return out
  }
  // Flat pseudo-headers sometimes appear directly in params
  const out: Record<string, string> = {}
  for (const key of [':method', ':path', ':authority', ':scheme', ':status']) {
    if (key in params) out[key] = String(params[key])
  }
  return Object.keys(out).length ? out : undefined
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

function extractHostFromSession(entry: SourceEntry): { host: string; proxy: string; secure: boolean } {
  let host = ''
  let proxy = ''
  let secure = false
  for (const ev of entry.events) {
    const p = ev.params
    if (typeof p.host === 'string' && p.host) host = p.host
    if (typeof p.proxy === 'string') proxy = p.proxy
    if (p.privacy_mode !== undefined) {
      /* ignore */
    }
    if (ev.type === 'HTTP2_SESSION' || ev.type === 'QUIC_SESSION') {
      if (typeof p.host === 'string') host = p.host
      if (typeof p.proxy === 'string') proxy = p.proxy
    }
    if (typeof p.is_https === 'boolean') secure = p.is_https
    if (ev.type.includes('SSL') || ev.type.includes('TLS')) secure = true
  }
  // Fall back: look at :authority in headers
  if (!host) {
    for (const ev of entry.events) {
      const headers = parseHeaders(ev.params)
      if (headers?.[':authority']) {
        host = headers[':authority']
        break
      }
      if (typeof ev.params.host === 'string') {
        host = ev.params.host
        break
      }
    }
  }
  return { host: host || `(session ${entry.id})`, proxy, secure }
}

function applyHttp2Event(session: ProtocolSession, ev: NetlogEvent): void {
  const p = ev.params
  const streamId = typeof p.stream_id === 'number' ? p.stream_id : undefined

  if (ev.type === 'HTTP2_SESSION_INITIALIZED') {
    const dep = sourceDependencyId(p)
    if (dep !== undefined) session.relatedSourceIds.push(dep)
    session.secure = true
  }

  if (ev.type === 'HTTP2_SESSION_SEND_SETTINGS' || ev.type === 'HTTP2_SESSION_RECV_SETTING') {
    const settings = asRecord(p.settings ?? p)
    for (const [k, v] of Object.entries(settings)) {
      if (k === 'settings' || k === 'source_dependency') continue
      if (ev.type.includes('SEND')) assignSafeScalar(session.settingsSent, k, v)
      else assignSafeScalar(session.settingsReceived, k, v)
    }
    if (typeof p.id === 'string' || typeof p.id === 'number') {
      const key = String(p.id)
      const val = p.value
      if (isSafeRecordKey(key)) {
        if (typeof val === 'number' || typeof val === 'string') {
          if (ev.type.includes('SEND')) session.settingsSent[key] = val
          else session.settingsReceived[key] = val
        }
      }
    }
  }

  if (streamId !== undefined && streamId >= 0) {
    const stream = ensureStream(session, streamId)
    const dep = sourceDependencyId(p)
    if (dep !== undefined) {
      stream.urlRequestSourceId = dep
      session.relatedSourceIds.push(dep)
    }

    if (ev.type.includes('HEADERS')) {
      const headers = parseHeaders(p)
      if (headers) {
        if (ev.type.includes('SEND')) {
          stream.requestHeaders = { ...stream.requestHeaders, ...headers }
          stream.method = headers[':method'] ?? stream.method
          stream.path = headers[':path'] ?? stream.path
          stream.authority = headers[':authority'] ?? stream.authority
        } else {
          stream.responseHeaders = { ...stream.responseHeaders, ...headers }
          stream.status = headers[':status'] ?? stream.status
        }
      }
      if (p.fin === true) {
        if (ev.type.includes('SEND')) stream.finSent = true
        else stream.finReceived = true
      }
    }

    if (ev.type.includes('DATA')) {
      const size = typeof p.size === 'number' ? p.size : 0
      if (ev.type.includes('SEND')) stream.bytesSent += size
      else stream.bytesReceived += size
      if (p.fin === true) {
        if (ev.type.includes('SEND')) stream.finSent = true
        else stream.finReceived = true
      }
    }

    if (ev.type === 'HTTP2_SESSION_SEND_RST_STREAM' || ev.type === 'HTTP2_SESSION_RECV_RST_STREAM') {
      const code = String(p.error_code ?? p.error ?? 'RST_STREAM')
      stream.rstError = code
      stream.rstDescription = typeof p.description === 'string' ? p.description : undefined
      stream.rstDirection = ev.type.includes('SEND') ? 'sent' : 'received'
      if (!isBenignResetOrCloseCode(code)) {
        stream.hasError = true
        session.hasError = true
      }
    }
  }

  if (ev.type === 'HTTP2_SESSION_RECV_INVALID_HEADER') {
    session.hasError = true
    if (streamId !== undefined && streamId >= 0) {
      const stream = ensureStream(session, streamId)
      stream.hasError = true
    }
  }

  if (ev.type === 'HTTP2_SESSION_RECV_GOAWAY' || ev.type === 'HTTP2_SESSION_SEND_GOAWAY') {
    const code = String(p.error_code ?? '')
    if (code && !code.includes('NO_ERROR') && code !== '0') {
      session.hasError = true
      session.error = `GOAWAY ${code}${p.debug_data ? `: ${String(p.debug_data)}` : ''}`
    }
  }

  if (ev.type === 'HTTP2_SESSION_CLOSE') {
    const netError = p.net_error
    if (netError !== undefined && netError !== 0 && netError !== 'ok') {
      session.hasError = true
      session.error = String(netError)
    }
  }
}

export function buildHttp2Sessions(parsed: ParsedNetlog): ProtocolSession[] {
  const entries = sourcesOfType(parsed.sources, 'HTTP2_SESSION')
  const sessions: ProtocolSession[] = []

  for (const entry of entries) {
    const meta = extractHostFromSession(entry)
    const session: ProtocolSession = {
      id: entry.id,
      protocol: 'h2',
      host: meta.host,
      proxy: meta.proxy,
      startTimeMs: entry.startTimeMs,
      endTimeMs: entry.endTimeMs,
      secure: meta.secure,
      negotiatedProtocol: 'h2',
      settingsSent: {},
      settingsReceived: {},
      streams: new Map(),
      events: entry.events,
      relatedSourceIds: [],
      hasError: false,
      origin: 'events',
    }

    for (const ev of entry.events) {
      applyHttp2Event(session, ev)
    }

    // Unique related ids
    session.relatedSourceIds = [...new Set(session.relatedSourceIds)]
    sessions.push(session)
  }

  return sessions
}

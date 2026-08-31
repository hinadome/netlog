import type { NetlogEvent } from '../parser/types'
import { formatStreamField } from './streamKind'

export type EventSeverity = 'critical' | 'error' | 'warning' | 'info' | 'ok'
export type EventCategory = 'session' | 'headers' | 'data' | 'control' | 'error' | 'quic' | 'other'

export interface EventCatalogEntry {
  title: string
  /** Static fallback explanation; prefer describeEvent for param-aware text. */
  meaning: string
  category: EventCategory
  severity: EventSeverity
  /** High-volume / low-signal for diagnosis; hidden unless "Show noise". */
  noise?: boolean
}

const CATALOG: Record<string, EventCatalogEntry> = {
  HTTP2_SESSION: {
    title: 'HTTP/2 session started',
    meaning: 'Chrome opened (or began logging) an HTTP/2 connection to this host.',
    category: 'session',
    severity: 'info',
  },
  HTTP2_SESSION_INITIALIZED: {
    title: 'Session bound to socket',
    meaning: 'The HTTP/2 session was attached to an underlying TCP/TLS socket.',
    category: 'session',
    severity: 'info',
  },
  HTTP2_SESSION_CLOSE: {
    title: 'HTTP/2 session closed',
    meaning: 'The multiplexed HTTP/2 connection ended.',
    category: 'session',
    severity: 'info',
  },
  HTTP2_SESSION_SEND_HEADERS: {
    title: 'Sent request headers',
    meaning: 'Client sent an HTTP/2 HEADERS frame (usually starting a request on a stream).',
    category: 'headers',
    severity: 'ok',
  },
  HTTP2_SESSION_RECV_HEADERS: {
    title: 'Received response headers',
    meaning: 'Server sent an HTTP/2 HEADERS frame (status / response headers).',
    category: 'headers',
    severity: 'ok',
  },
  HTTP2_SESSION_SEND_DATA: {
    title: 'Sent data',
    meaning: 'Client sent request body bytes on a stream.',
    category: 'data',
    severity: 'ok',
    noise: true,
  },
  HTTP2_SESSION_RECV_DATA: {
    title: 'Received data',
    meaning: 'Server sent response body bytes on a stream.',
    category: 'data',
    severity: 'ok',
    noise: true,
  },
  HTTP2_SESSION_SEND_RST_STREAM: {
    title: 'Client reset stream',
    meaning: 'Chrome aborted this stream with RST_STREAM. PROTOCOL_ERROR often follows a bad header or framing issue.',
    category: 'error',
    severity: 'error',
  },
  HTTP2_SESSION_RECV_RST_STREAM: {
    title: 'Peer reset stream',
    meaning: 'The server (or peer) aborted this stream with RST_STREAM.',
    category: 'error',
    severity: 'error',
  },
  HTTP2_SESSION_RECV_INVALID_HEADER: {
    title: 'Rejected invalid header',
    meaning:
      'Chrome refused a header that is illegal under HTTP/2. This commonly surfaces as ERR_HTTP2_PROTOCOL_ERROR.',
    category: 'error',
    severity: 'critical',
  },
  HTTP2_SESSION_SEND_GOAWAY: {
    title: 'Sent GOAWAY',
    meaning: 'Client told the peer it is done accepting new streams on this connection.',
    category: 'control',
    severity: 'warning',
  },
  HTTP2_SESSION_RECV_GOAWAY: {
    title: 'Received GOAWAY',
    meaning: 'Peer is shutting down the connection; in-flight streams after last-accepted may fail.',
    category: 'control',
    severity: 'warning',
  },
  HTTP2_SESSION_PING: {
    title: 'HTTP/2 PING',
    meaning: 'Liveness check on the connection (sent or acknowledged).',
    category: 'control',
    severity: 'info',
  },
  HTTP2_SESSION_SEND_SETTINGS: {
    title: 'Sent SETTINGS',
    meaning: 'Client advertised HTTP/2 connection settings (window sizes, max streams, etc.).',
    category: 'control',
    severity: 'info',
  },
  HTTP2_SESSION_RECV_SETTING: {
    title: 'Received SETTINGS',
    meaning: 'Peer advertised or acknowledged HTTP/2 settings.',
    category: 'control',
    severity: 'info',
  },
  HTTP2_SESSION_RECV_SETTINGS: {
    title: 'Received SETTINGS',
    meaning: 'Peer advertised HTTP/2 connection settings.',
    category: 'control',
    severity: 'info',
  },
  HTTP2_SESSION_UPDATE_RECV_WINDOW: {
    title: 'Recv flow-control window updated',
    meaning: 'Local receive window changed (flow control). Frequent updates are normal.',
    category: 'control',
    severity: 'info',
    noise: true,
  },
  HTTP2_SESSION_UPDATE_SEND_WINDOW: {
    title: 'Send flow-control window updated',
    meaning: 'Local send window changed (flow control). Frequent updates are normal.',
    category: 'control',
    severity: 'info',
    noise: true,
  },
  HTTP2_SESSION_RECV_WINDOW_UPDATE: {
    title: 'Received WINDOW_UPDATE',
    meaning: 'Peer granted more send credit for the connection or a stream.',
    category: 'control',
    severity: 'info',
    noise: true,
  },
  HTTP2_SESSION_SEND_WINDOW_UPDATE: {
    title: 'Sent WINDOW_UPDATE',
    meaning: 'Chrome granted the peer more send credit.',
    category: 'control',
    severity: 'info',
    noise: true,
  },

  QUIC_SESSION_WINDOW_UPDATE_FRAME_SENT: {
    title: 'Window update frame sent',
    meaning:
      'Chrome told the peer it may send more data (flow control). If stream_id is -1 or unset, this is usually connection-level credit, not a single request stream.',
    category: 'control',
    severity: 'info',
    noise: true,
  },
  QUIC_SESSION_WINDOW_UPDATE_FRAME_RECEIVED: {
    title: 'Window update frame received',
    meaning:
      'Peer raised how much data Chrome may send (flow control). stream_id -1 often means connection-level; a real id means that QUIC stream only.',
    category: 'control',
    severity: 'info',
    noise: true,
  },
  QUIC_SESSION: {
    title: 'QUIC / HTTP/3 session started',
    meaning: 'Chrome opened a QUIC connection (HTTP/3 candidate) to this host.',
    category: 'quic',
    severity: 'info',
  },
  QUIC_SESSION_ENCRYPTION_ESTABLISHED: {
    title: 'QUIC encryption established',
    meaning: 'Handshake progressed; encrypted application data can flow.',
    category: 'quic',
    severity: 'ok',
  },
  QUIC_SESSION_CLOSED: {
    title: 'QUIC session closed',
    meaning: 'The QUIC connection ended.',
    category: 'quic',
    severity: 'info',
  },
  QUIC_SESSION_CLOSE_ON_ERROR: {
    title: 'QUIC closed on error',
    meaning: 'The connection closed because of a transport or protocol error.',
    category: 'error',
    severity: 'error',
  },
  QUIC_SESSION_CONNECTION_CLOSE_FRAME_RECEIVED: {
    title: 'Received CONNECTION_CLOSE',
    meaning: 'Peer closed the QUIC connection and may have included an error code / details.',
    category: 'error',
    severity: 'error',
  },
  QUIC_SESSION_CONNECTION_CLOSE_FRAME_SENT: {
    title: 'Sent CONNECTION_CLOSE',
    meaning: 'Chrome closed the QUIC connection.',
    category: 'error',
    severity: 'warning',
  },
  QUIC_CONNECTION_CLOSE_FRAME_RECEIVED: {
    title: 'Received CONNECTION_CLOSE',
    meaning: 'Peer closed the QUIC connection.',
    category: 'error',
    severity: 'error',
  },
  QUIC_CONNECTION_CLOSE_FRAME_SENT: {
    title: 'Sent CONNECTION_CLOSE',
    meaning: 'Chrome closed the QUIC connection.',
    category: 'error',
    severity: 'warning',
  },
  HTTP3_HEADERS_RECEIVED: {
    title: 'Received HTTP/3 headers',
    meaning: 'Headers arrived on a QUIC/HTTP3 stream.',
    category: 'headers',
    severity: 'ok',
  },
  HTTP3_HEADERS_SENT: {
    title: 'Sent HTTP/3 headers',
    meaning: 'Chrome sent headers on a QUIC/HTTP3 stream.',
    category: 'headers',
    severity: 'ok',
  },
}

const NOISE_TYPE_RE =
  /WINDOW_UPDATE|UPDATE_RECV_WINDOW|UPDATE_SEND_WINDOW|SEND_DATA|RECV_DATA|STREAM_FRAME|ACK_FRAME|PACKET_SENT|PACKET_RECEIVED|PADDED/

const ERROR_TYPE_RE =
  /INVALID|ERROR|RST|RESET|GOAWAY|CONNECTION_CLOSE|CLOSE_ON_ERROR|FAILED|PROTOCOL/

function humanizeType(type: string): string {
  return type
    .replace(/^HTTP2_SESSION_/, '')
    .replace(/^QUIC_SESSION_/, '')
    .replace(/^HTTP3_/, 'HTTP3 ')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase())
}

export function lookupCatalog(type: string): EventCatalogEntry {
  const hit = CATALOG[type]
  if (hit) return hit

  const noise = NOISE_TYPE_RE.test(type)
  const isErr = ERROR_TYPE_RE.test(type)
  let category: EventCategory = 'other'
  if (type.includes('HEADERS')) category = 'headers'
  else if (type.includes('DATA') || type.includes('STREAM_FRAME')) category = 'data'
  else if (type.includes('QUIC') || type.includes('HTTP3')) category = 'quic'
  else if (isErr) category = 'error'
  else if (/SETTINGS|WINDOW|PING|GOAWAY/.test(type)) category = 'control'

  return {
    title: humanizeType(type),
    meaning: isErr
      ? 'This event indicates an error, reset, or abnormal close. Inspect params for codes and details.'
      : 'Chrome logged this network-stack event on the session. Open details for parameters.',
    category,
    severity: isErr ? 'error' : 'info',
    noise,
  }
}

export function eventStreamId(ev: NetlogEvent): number | undefined {
  const p = ev.params
  if (typeof p.stream_id === 'number') return p.stream_id
  if (typeof p.quic_stream_id === 'number') return p.quic_stream_id
  return undefined
}

function headerSnippet(params: Record<string, unknown>): string | undefined {
  const headers = params.headers
  if (!Array.isArray(headers)) return undefined
  let method: string | undefined
  let path: string | undefined
  let status: string | undefined
  for (const h of headers) {
    if (typeof h !== 'string') continue
    if (h.startsWith(':method:')) method = h.slice(':method:'.length).trim()
    else if (h.startsWith(':path:')) path = h.slice(':path:'.length).trim()
    else if (h.startsWith(':status:')) status = h.slice(':status:'.length).trim()
  }
  if (method && path) return `${method} ${path}`
  if (status) return `status ${status}`
  return undefined
}

export interface DescribedEvent {
  title: string
  summary: string
  meaning: string
  whyItMatters: string
  category: EventCategory
  severity: EventSeverity
  noise: boolean
  streamId?: number
  keyFields: Array<{ label: string; value: string }>
}

function eventLooksHttp3(ev: NetlogEvent): boolean {
  return (
    ev.sourceType === 'QUIC_SESSION' ||
    ev.type.includes('QUIC') ||
    ev.type.includes('HTTP3')
  )
}

export function describeEvent(
  ev: NetlogEvent,
  opts?: { protocol?: 'h2' | 'h3' },
): DescribedEvent {
  const entry = lookupCatalog(ev.type)
  const p = ev.params
  const streamId = eventStreamId(ev)
  const keyFields: Array<{ label: string; value: string }> = []
  const bits: string[] = []
  const isHttp3 = opts?.protocol === 'h3' || (opts?.protocol !== 'h2' && eventLooksHttp3(ev))
  const streamProtocol = opts?.protocol ?? (isHttp3 ? 'h3' : undefined)

  if (streamId !== undefined) {
    keyFields.push({
      label: 'Stream',
      value: formatStreamField(streamId, streamProtocol),
    })
    if (streamId < 0) {
      bits.push('stream -1 (unset / connection-level sentinel)')
    } else {
      bits.push(
        streamProtocol
          ? `stream ${formatStreamField(streamId, streamProtocol)}`
          : `stream ${streamId}`,
      )
    }
  }

  const headersLine = headerSnippet(p)
  if (headersLine) {
    keyFields.push({ label: 'Request / status', value: headersLine })
    bits.push(headersLine)
  }

  if (typeof p.header_name === 'string') {
    keyFields.push({ label: 'Header', value: p.header_name })
    bits.push(p.header_name)
  }
  if (typeof p.header_value === 'string') {
    const v = p.header_value.length > 80 ? `${p.header_value.slice(0, 80)}…` : p.header_value
    keyFields.push({ label: 'Header value', value: v })
  }
  if (typeof p.error === 'string') {
    keyFields.push({ label: 'Error', value: p.error })
    bits.push(p.error)
  }
  if (p.error_code !== undefined) {
    keyFields.push({ label: 'Error code', value: String(p.error_code) })
    bits.push(String(p.error_code))
  }
  if (typeof p.description === 'string') {
    keyFields.push({ label: 'Description', value: p.description })
  }
  if (typeof p.quic_error === 'string') {
    keyFields.push({ label: 'QUIC error', value: p.quic_error })
    bits.push(p.quic_error)
  }
  if (typeof p.details === 'string') {
    keyFields.push({ label: 'Details', value: p.details })
    bits.push(p.details)
  }
  if (typeof p.size === 'number') {
    keyFields.push({ label: 'Size', value: `${p.size} bytes` })
    bits.push(`${p.size} B`)
  }
  if (typeof p.length === 'number') {
    keyFields.push({ label: 'Length', value: `${p.length} bytes` })
  }
  if (typeof p.window_size === 'number') {
    keyFields.push({ label: 'Window', value: String(p.window_size) })
  }
  if (typeof p.delta === 'number') {
    keyFields.push({ label: 'Delta', value: String(p.delta) })
  }
  if (p.is_ack !== undefined || typeof p.type === 'string') {
    const ping =
      p.is_ack === true ? 'ACK' : p.is_ack === false ? 'probe' : String(p.type ?? '')
    if (ping) {
      keyFields.push({ label: 'PING', value: ping })
      bits.push(ping)
    }
  }
  if (p.fin === true) {
    keyFields.push({ label: 'FIN', value: 'true' })
    bits.push('FIN')
  }
  if (typeof p.net_error === 'number' || typeof p.net_error === 'string') {
    keyFields.push({ label: 'Net error', value: String(p.net_error) })
    bits.push(`net ${p.net_error}`)
  }
  if (p.source_dependency && typeof p.source_dependency === 'object' && 'id' in p.source_dependency) {
    keyFields.push({
      label: 'Related source',
      value: String((p.source_dependency as { id: unknown }).id),
    })
  }

  let whyItMatters = ''
  switch (entry.severity) {
    case 'critical':
      whyItMatters =
        'This is a primary failure signal. Findings often point here as the root cause of ERR_HTTP2_* / broken page loads.'
      break
    case 'error':
      whyItMatters =
        'The stream or connection was aborted or closed with an error. Check the previous few events for the trigger.'
      break
    case 'warning':
      whyItMatters =
        'Not always fatal, but it can cancel in-flight work or mark the end of the connection’s useful life.'
      break
    default:
      whyItMatters =
        entry.noise
          ? 'Usually background traffic. Hide with “Hide noise” unless you are debugging flow control or throughput.'
          : 'Normal protocol activity that helps reconstruct what the browser and peer exchanged.'
  }

  if (ev.type.includes('INVALID_HEADER')) {
    whyItMatters =
      'Invalid headers on HTTP/2 almost always lead Chrome to reset the stream with PROTOCOL_ERROR — fix the upstream header.'
  }

  return {
    title: entry.title,
    summary: bits.length ? bits.join(' · ') : entry.meaning,
    meaning: entry.meaning,
    whyItMatters,
    category: entry.category,
    severity: entry.severity,
    noise: Boolean(entry.noise),
    streamId,
    keyFields,
  }
}

export function isNoiseEvent(ev: NetlogEvent): boolean {
  return describeEvent(ev).noise
}

export function isErrorLikeEvent(ev: NetlogEvent): boolean {
  const d = describeEvent(ev)
  return d.severity === 'critical' || d.severity === 'error' || d.category === 'error'
}

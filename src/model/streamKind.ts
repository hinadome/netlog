/**
 * Classify HTTP/2 and HTTP/3 (QUIC) stream IDs for teaching + UI badges.
 * Assumes local endpoint is the HTTP client (Chrome net-export).
 *
 * HTTP/2 (RFC 9113): odd = client, even = server, 0 = connection.
 * HTTP/3 / QUIC (RFC 9000): stream_id % 4 encodes initiator + uni/bidi.
 */

export type ProtocolKind = 'h2' | 'h3'
export type StreamInitiator = 'local' | 'peer' | 'connection'
export type StreamDirection = 'bidi' | 'uni' | 'n/a'
export type StreamRole = 'request' | 'control' | 'push' | 'other'

export interface StreamKindInfo {
  protocol: ProtocolKind
  streamId: number
  initiator: StreamInitiator
  direction: StreamDirection
  role: StreamRole
  /** Badge text, e.g. "Local · request" or "Local · bidi · request" */
  label: string
  /** Compact, e.g. "local request" / "local bidi" */
  shortLabel: string
  blurb: string
  /** QUIC only: id % 4 */
  typeBits?: 0 | 1 | 2 | 3
}

export interface StreamKindCounts {
  protocol: ProtocolKind
  /** Client request streams (h2 odd / h3 local bidi) */
  requests: number
  local: number
  peer: number
  /** h3 only */
  localUni: number
  peerUni: number
  peerBidi: number
  /** h2 stream 0 if present */
  connection: number
}

const H3_BLURBS: Record<0 | 1 | 2 | 3, string> = {
  0: 'Client-initiated bidirectional stream — normal HTTP/3 request/response (Chrome opened it).',
  1: 'Server-initiated bidirectional stream — opened by the peer; uncommon for ordinary page loads.',
  2: 'Client-initiated unidirectional stream — usually Chrome→server control or QPACK encoder traffic.',
  3: 'Server-initiated unidirectional stream — usually server→Chrome control, QPACK, or push-related.',
}

export function classifyHttp2StreamId(streamId: number): StreamKindInfo {
  if (streamId < 0) {
    return {
      protocol: 'h2',
      streamId,
      initiator: 'connection',
      direction: 'n/a',
      role: 'control',
      label: 'No stream (sentinel)',
      shortLabel: 'no stream',
      blurb:
        'Chromium logged stream_id = -1 (invalid/unset). This is not a real HTTP/2 stream — often “not applicable” on a control-ish event. Ignore for request/push classification.',
    }
  }
  if (streamId === 0) {
    return {
      protocol: 'h2',
      streamId,
      initiator: 'connection',
      direction: 'n/a',
      role: 'control',
      label: 'Connection · control',
      shortLabel: 'connection',
      blurb:
        'Stream 0 is reserved for HTTP/2 connection control (SETTINGS, PING, GOAWAY, connection WINDOW_UPDATE) — not a request.',
    }
  }
  if (streamId % 2 === 1) {
    return {
      protocol: 'h2',
      streamId,
      initiator: 'local',
      direction: 'bidi',
      role: 'request',
      label: 'Local · request',
      shortLabel: 'local request',
      blurb:
        'Client-initiated stream (odd ID). Chrome opened this for an HTTP/2 request/response exchange.',
    }
  }
  return {
    protocol: 'h2',
    streamId,
    initiator: 'peer',
    direction: 'bidi',
    role: 'push',
    label: 'Peer · push/server',
    shortLabel: 'peer server',
    blurb:
      'Server-initiated stream (even ID). Historically used for HTTP/2 server push; uncommon on modern sites.',
  }
}

export function classifyQuicStreamId(
  streamId: number,
  opts?: { hasRequestHeaders?: boolean },
): StreamKindInfo {
  // Chromium often logs QuicUtils invalid stream id as -1 (signed). Not a real QUIC stream;
  // for WINDOW_UPDATE / MAX_DATA style frames this commonly means connection-level credit.
  if (streamId < 0) {
    return {
      protocol: 'h3',
      streamId,
      initiator: 'connection',
      direction: 'n/a',
      role: 'control',
      label: 'Connection / unset',
      shortLabel: 'connection',
      blurb:
        'stream_id = -1 is Chromium’s invalid-stream sentinel in the netlog, not peer-bidi. On WINDOW_UPDATE this usually means connection-level flow control (credit for the whole QUIC connection), not a request stream.',
    }
  }

  const typeBits = (streamId % 4) as 0 | 1 | 2 | 3
  const initiator: StreamInitiator = typeBits === 0 || typeBits === 2 ? 'local' : 'peer'
  const direction: StreamDirection = typeBits === 0 || typeBits === 1 ? 'bidi' : 'uni'

  let role: StreamRole = 'other'
  if (typeBits === 0) role = 'request'
  else if (typeBits === 2 || typeBits === 3) role = 'control'
  else if (typeBits === 1 && opts?.hasRequestHeaders) role = 'request'

  const shortLabel = `${initiator} ${direction}`
  const rolePart = role === 'other' ? '' : ` · ${role}`
  const label = `${capitalize(initiator)} · ${direction}${rolePart}`

  return {
    protocol: 'h3',
    streamId,
    typeBits,
    initiator,
    direction,
    role,
    label,
    shortLabel,
    blurb: H3_BLURBS[typeBits],
  }
}

export function classifyStreamId(
  protocol: ProtocolKind,
  streamId: number,
  opts?: { hasRequestHeaders?: boolean },
): StreamKindInfo {
  return protocol === 'h3'
    ? classifyQuicStreamId(streamId, opts)
    : classifyHttp2StreamId(streamId)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function countStreamKinds(
  protocol: ProtocolKind,
  streamIds: Iterable<number>,
): StreamKindCounts {
  const counts: StreamKindCounts = {
    protocol,
    requests: 0,
    local: 0,
    peer: 0,
    localUni: 0,
    peerUni: 0,
    peerBidi: 0,
    connection: 0,
  }
  for (const id of streamIds) {
    if (id < 0) continue
    const t = classifyStreamId(protocol, id)
    if (t.initiator === 'local') counts.local += 1
    if (t.initiator === 'peer') counts.peer += 1
    if (t.initiator === 'connection') counts.connection += 1
    if (t.role === 'request') counts.requests += 1
    if (protocol === 'h3') {
      if (t.typeBits === 2) counts.localUni += 1
      else if (t.typeBits === 3) counts.peerUni += 1
      else if (t.typeBits === 1) counts.peerBidi += 1
    }
  }
  return counts
}

export function formatStreamField(streamId: number, protocol?: ProtocolKind | boolean): string {
  // boolean kept for older call sites: true = h3
  const proto: ProtocolKind | undefined =
    protocol === true ? 'h3' : protocol === false || protocol === undefined ? undefined : protocol
  if (!proto) return String(streamId)
  const t = classifyStreamId(proto, streamId)
  const roleSuffix =
    t.role !== 'other' && !t.shortLabel.includes(t.role) ? ` (${t.role})` : ''
  return `${streamId} · ${t.shortLabel}${roleSuffix}`
}

export type H3StreamKindFilter = 'all' | 'requests' | 'control'

/** HTTP/3 timeline filter: requests (local/peer bidi) vs control (uni 2/3). */
export function matchesH3KindFilter(
  streamId: number | undefined,
  filter: H3StreamKindFilter,
): boolean {
  if (filter === 'all') return true
  if (streamId === undefined) return true
  if (streamId < 0) return filter === 'control'
  const bits = streamId % 4
  if (filter === 'requests') return bits === 0 || bits === 1
  if (filter === 'control') return bits === 2 || bits === 3
  return true
}

/** @deprecated Use StreamKindInfo */
export type QuicStreamType = StreamKindInfo

/** Normalized HTTP/2 row from polledData.spdySessionInfo (Chrome GetNetInfo snapshot). */
export interface PolledH2Session {
  sourceId: number
  hostPortPair: string
  proxy?: string
  negotiatedProtocol?: string
  activeStreams?: number
  sendWindowSize?: number
  recvWindowSize?: number
  unackedRecvWindowBytes?: number
  error?: string
  framesReceived?: number
  availabilityState?: string
  raw: Record<string, unknown>
}

export type PolledDataRoot = Record<string, unknown>

/** One merged polledData object (export may attach an array of contexts). */
export function normalizePolledDataRoots(raw: unknown): PolledDataRoot[] {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    return raw.filter((x): x is PolledDataRoot => x != null && typeof x === 'object')
  }
  if (typeof raw === 'object') return [raw as PolledDataRoot]
  return []
}

export function parseHostPortPair(hostPort: string): { host: string; port?: number } {
  const s = hostPort.trim()
  if (!s) return { host: '(unknown)' }

  if (s.startsWith('[')) {
    const end = s.indexOf(']')
    if (end > 0) {
      const host = s.slice(1, end)
      const rest = s.slice(end + 1)
      if (rest.startsWith(':')) {
        const port = Number(rest.slice(1))
        return { host, port: Number.isFinite(port) ? port : undefined }
      }
      return { host }
    }
  }

  const lastColon = s.lastIndexOf(':')
  if (lastColon > 0) {
    const maybePort = s.slice(lastColon + 1)
    if (/^\d+$/.test(maybePort)) {
      return { host: s.slice(0, lastColon), port: Number(maybePort) }
    }
  }

  return { host: s }
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function readNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function parsePolledH2Row(raw: Record<string, unknown>): PolledH2Session | null {
  const sourceId = readNumber(raw, 'source_id')
  if (sourceId === undefined) return null
  const hostPortPair = readString(raw, 'host_port_pair')
  if (!hostPortPair) return null

  return {
    sourceId,
    hostPortPair,
    proxy: readString(raw, 'proxy'),
    negotiatedProtocol: readString(raw, 'negotiated_protocol'),
    activeStreams: readNumber(raw, 'active_streams'),
    sendWindowSize: readNumber(raw, 'send_window_size'),
    recvWindowSize: readNumber(raw, 'recv_window_size'),
    unackedRecvWindowBytes: readNumber(raw, 'unacked_recv_window_bytes'),
    error: readString(raw, 'error') ?? (raw.error != null ? String(raw.error) : undefined),
    framesReceived: readNumber(raw, 'frames_received'),
    availabilityState: readString(raw, 'availability_state'),
    raw,
  }
}

/** Collect spdySessionInfo rows from all polledData roots; last wins on duplicate source_id. */
export function extractPolledH2Sessions(polledData: unknown): PolledH2Session[] {
  const byId = new Map<number, PolledH2Session>()
  for (const root of normalizePolledDataRoots(polledData)) {
    const list = root.spdySessionInfo
    if (!Array.isArray(list)) continue
    for (const item of list) {
      const row = parsePolledH2Row(asRecord(item))
      if (row) byId.set(row.sourceId, row)
    }
  }
  return [...byId.values()].sort((a, b) => a.sourceId - b.sourceId)
}

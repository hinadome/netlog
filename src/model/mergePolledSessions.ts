import type { ProtocolSession } from './http2Session'
import type { SessionOrigin } from './sessionOrigin'
import { extractPolledH2Sessions, parseHostPortPair, type PolledH2Session } from './polledData'

export interface MergePolledResult {
  sessions: ProtocolSession[]
  polledOnlyCount: number
  enrichedCount: number
}

function stubFromPolledH2(row: PolledH2Session): ProtocolSession {
  const { host } = parseHostPortPair(row.hostPortPair)
  return {
    id: row.sourceId,
    protocol: 'h2',
    host,
    proxy: row.proxy ?? 'none',
    startTimeMs: 0,
    endTimeMs: 0,
    secure: true,
    negotiatedProtocol: row.negotiatedProtocol ?? 'h2',
    settingsSent: {},
    settingsReceived: {},
    streams: new Map(),
    events: [],
    relatedSourceIds: [],
    hasError: Boolean(row.error),
    error: row.error,
    origin: 'polledOnly',
    polledSnapshot: row,
  }
}

/** Merge polledData HTTP/2 snapshots into event-built sessions (Phase 1). */
export function mergePolledH2IntoSessions(
  eventSessions: ProtocolSession[],
  polledData: unknown,
): MergePolledResult {
  const polled = extractPolledH2Sessions(polledData)
  if (polled.length === 0) {
    return {
      sessions: eventSessions.map((s) => ({
        ...s,
        origin: (s.origin ?? 'events') as SessionOrigin,
      })),
      polledOnlyCount: 0,
      enrichedCount: 0,
    }
  }

  const byId = new Map(eventSessions.map((s) => [s.id, s]))
  let polledOnlyCount = 0
  let enrichedCount = 0

  for (const row of polled) {
    const existing = byId.get(row.sourceId)
    if (existing) {
      existing.polledSnapshot = row
      existing.origin = 'events+polled'
      enrichedCount += 1
    } else {
      byId.set(row.sourceId, stubFromPolledH2(row))
      polledOnlyCount += 1
    }
  }

  const sessions = [...byId.values()].sort((a, b) => {
    if (a.startTimeMs !== b.startTimeMs) return a.startTimeMs - b.startTimeMs
    return a.id - b.id
  })

  for (const s of sessions) {
    if (s.origin === undefined) s.origin = 'events'
  }

  return { sessions, polledOnlyCount, enrichedCount }
}

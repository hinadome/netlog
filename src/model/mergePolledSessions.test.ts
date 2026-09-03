import { describe, expect, it } from 'vitest'
import { buildHttp2Sessions } from './http2Session'
import { mergePolledH2IntoSessions } from './mergePolledSessions'
import { extractPolledH2Sessions, parseHostPortPair } from './polledData'
import { parseNetlogJson } from '../parser/readNetlog'

describe('polledData', () => {
  it('parses host:port pairs', () => {
    expect(parseHostPortPair('example.com:443').host).toBe('example.com')
    expect(parseHostPortPair('[::1]:443').host).toBe('::1')
  })

  it('extracts spdySessionInfo rows', () => {
    const rows = extractPolledH2Sessions({
      spdySessionInfo: [
        {
          source_id: 999,
          host_port_pair: 'other.test:443',
          active_streams: 2,
          negotiated_protocol: 'h2',
        },
      ],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].sourceId).toBe(999)
    expect(rows[0].activeStreams).toBe(2)
  })
})

describe('mergePolledH2IntoSessions', () => {
  const polledPayload = {
    spdySessionInfo: [
      {
        source_id: 218,
        host_port_pair: 'example.com:443',
        proxy: 'none',
        active_streams: 1,
        send_window_size: 65535,
        recv_window_size: 65535,
        negotiated_protocol: 'h2',
      },
      {
        source_id: 5000,
        host_port_pair: 'snapshot-only.test:443',
        active_streams: 3,
        negotiated_protocol: 'h2',
      },
    ],
  }

  it('enriches event sessions and adds snapshot-only stubs', () => {
    const fixture = JSON.stringify({
      constants: {
        logEventTypes: { HTTP2_SESSION: 1 },
        logSourceType: { HTTP2_SESSION: 1 },
        logEventPhase: { PHASE_NONE: 0 },
      },
      events: [
        {
          time: 0,
          type: 1,
          source: { id: 218, type: 1 },
          phase: 0,
          params: { host: 'example.com' },
        },
      ],
      polledData: polledPayload,
    })

    const parsed = parseNetlogJson(fixture, 't.json')
    expect(parsed.polledData).toBeTruthy()

    const built = buildHttp2Sessions(parsed)
    expect(built).toHaveLength(1)

    const { sessions, polledOnlyCount, enrichedCount } = mergePolledH2IntoSessions(
      built,
      parsed.polledData,
    )
    expect(enrichedCount).toBe(1)
    expect(polledOnlyCount).toBe(1)
    expect(sessions).toHaveLength(2)

    const enriched = sessions.find((s) => s.id === 218)!
    expect(enriched.origin).toBe('events+polled')
    expect(enriched.polledSnapshot?.activeStreams).toBe(1)

    const snap = sessions.find((s) => s.id === 5000)!
    expect(snap.origin).toBe('polledOnly')
    expect(snap.events).toHaveLength(0)
    expect(snap.host).toBe('snapshot-only.test')
  })
})

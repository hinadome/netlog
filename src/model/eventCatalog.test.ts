import { describe, expect, it } from 'vitest'
import { describeEvent, lookupCatalog } from '../model/eventCatalog'
import type { NetlogEvent } from '../parser/types'

function ev(partial: Partial<NetlogEvent> & Pick<NetlogEvent, 'type'>): NetlogEvent {
  return {
    index: 0,
    timeMs: 100,
    typeId: 1,
    sourceId: 1,
    sourceType: 'HTTP2_SESSION',
    sourceTypeId: 1,
    phase: 'NONE',
    params: {},
    ...partial,
  }
}

describe('eventCatalog', () => {
  it('maps INVALID_HEADER to critical insight', () => {
    const d = describeEvent(
      ev({
        type: 'HTTP2_SESSION_RECV_INVALID_HEADER',
        params: {
          stream_id: 9,
          header_name: 'strict-transport-security',
          error: 'Invalid character 0x0A in header value.',
        },
      }),
    )
    expect(d.severity).toBe('critical')
    expect(d.title).toMatch(/invalid header/i)
    expect(d.summary).toContain('strict-transport-security')
    expect(d.keyFields.some((f) => f.label === 'Stream' && f.value === '9')).toBe(true)
  })

  it('marks WINDOW_UPDATE as noise', () => {
    expect(lookupCatalog('HTTP2_SESSION_UPDATE_RECV_WINDOW').noise).toBe(true)
    expect(describeEvent(ev({ type: 'HTTP2_SESSION_RECV_DATA', params: { size: 10 } })).noise).toBe(
      true,
    )
  })

  it('summarizes HEADERS with method and path', () => {
    const d = describeEvent(
      ev({
        type: 'HTTP2_SESSION_SEND_HEADERS',
        params: {
          stream_id: 1,
          headers: [':method: GET', ':path: /login'],
        },
      }),
    )
    expect(d.title).toMatch(/Sent request headers/i)
    expect(d.summary).toContain('GET /login')
  })
})

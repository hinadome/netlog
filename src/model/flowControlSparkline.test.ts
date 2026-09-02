import { describe, expect, it } from 'vitest'
import { buildFlowControlSeries } from './flowControlSparkline'
import type { NetlogEvent } from '../parser/types'

function ev(partial: Partial<NetlogEvent> & Pick<NetlogEvent, 'index' | 'type'>): NetlogEvent {
  return {
    time: String(partial.timeMs ?? partial.index),
    timeMs: partial.timeMs ?? partial.index,
    source: { id: 1, type: 1 },
    phase: 0,
    params: {},
    ...partial,
  }
}

describe('buildFlowControlSeries', () => {
  it('keeps event indexes for jump targets', () => {
    const points = buildFlowControlSeries([
      ev({
        index: 10,
        type: 'HTTP2_SESSION_RECV_WINDOW_UPDATE',
        timeMs: 100,
        params: { window_size: 65535, stream_id: 0 },
      }),
      ev({
        index: 20,
        type: 'HTTP2_SESSION_SEND_WINDOW_UPDATE',
        timeMs: 200,
        params: { window_size: 32768, stream_id: 1 },
      }),
    ])
    expect(points).toHaveLength(2)
    expect(points[0].eventIndex).toBe(10)
    expect(points[1].eventIndex).toBe(20)
  })
})

import { describe, expect, it } from 'vitest'
import type { Finding } from '../diagnosis/types'
import { buildEventStory, buildTimelineRows, formatGapDuration } from './eventLinks'
import type { NetlogEvent } from '../parser/types'

function ev(
  index: number,
  type: string,
  timeMs: number,
  params: Record<string, unknown> = {},
): NetlogEvent {
  return {
    index,
    timeMs,
    type,
    typeId: 1,
    sourceId: 218,
    sourceType: 'HTTP2_SESSION',
    sourceTypeId: 1,
    phase: 'NONE',
    params,
  }
}

describe('eventLinks', () => {
  it('links INVALID_HEADER as cause of following RST', () => {
    const events = [
      ev(1, 'HTTP2_SESSION_SEND_HEADERS', 100, { stream_id: 9 }),
      ev(2, 'HTTP2_SESSION_RECV_INVALID_HEADER', 168, {
        stream_id: 9,
        header_name: 'strict-transport-security',
      }),
      ev(3, 'HTTP2_SESSION_SEND_RST_STREAM', 169, {
        stream_id: 9,
        error_code: '1 (PROTOCOL_ERROR)',
      }),
    ]
    const story = buildEventStory(events, [])
    expect(story.get(2)?.roles).toContain('cause')
    expect(story.get(3)?.roles).toContain('follow-up')
    expect(story.get(2)?.links.some((l) => l.targetIndex === 3 && l.relation === 'caused')).toBe(
      true,
    )
  })

  it('marks finding evidence and inserts idle gaps', () => {
    const events = [
      ev(1, 'HTTP2_SESSION_PING', 0),
      ev(2, 'HTTP2_SESSION_RECV_INVALID_HEADER', 5000, { stream_id: 1 }),
    ]
    const findings: Finding[] = [
      {
        id: 'f1',
        ruleId: 'h2-invalid-header',
        severity: 'critical',
        title: 'Invalid header',
        explanation: 'x',
        suggestion: 'y',
        evidenceEventIndexes: [2],
      },
    ]
    const story = buildEventStory(events, findings)
    expect(story.get(2)?.roles).toContain('finding')

    const rows = buildTimelineRows(events, story, 1000)
    expect(rows.some((r) => r.kind === 'gap' && r.deltaMs === 5000)).toBe(true)
    expect(formatGapDuration(5000)).toBe('5.0 s')
  })
})

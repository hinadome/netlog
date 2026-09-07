import { describe, expect, it, beforeEach } from 'vitest'
import type { NetlogEvent } from '../../parser/types'
import type { ProtocolSession } from '../../model/http2Session'
import { resetQuicFindingIds, ruleQuicConnectionClose } from './quicRules'
import { sessionIssueKind } from '../../model/sessionIssues'
import type { SessionSummary } from '../types'

function ev(type: string, params: Record<string, unknown> = {}, index = 1): NetlogEvent {
  return {
    index,
    timeMs: 0,
    type,
    typeId: 1,
    sourceId: 1,
    sourceType: 'QUIC_SESSION',
    sourceTypeId: 1,
    phase: 'NONE',
    params,
  }
}

function h3Session(events: NetlogEvent[]): ProtocolSession {
  return {
    id: 42,
    protocol: 'h3',
    host: 'example.com',
    proxy: '',
    startTimeMs: 0,
    endTimeMs: 100,
    secure: true,
    settingsSent: {},
    settingsReceived: {},
    streams: new Map(),
    events,
    relatedSourceIds: [],
    hasError: false,
    origin: 'events',
  }
}

describe('ruleQuicConnectionClose quic-rst severity', () => {
  beforeEach(() => resetQuicFindingIds())

  it('marks PROTOCOL_ERROR as critical', () => {
    const sessions = [
      h3Session([
        ev('QUIC_SESSION_RESET_STREAM_FRAME_RECEIVED', {
          quic_rst_stream_error: 'PROTOCOL_ERROR (1)',
          stream_id: 4,
        }),
      ]),
    ]
    const rst = ruleQuicConnectionClose(sessions).filter((f) => f.ruleId === 'quic-rst')
    expect(rst).toHaveLength(1)
    expect(rst[0]?.severity).toBe('critical')
  })

  it('marks client CANCEL as info', () => {
    const sessions = [
      h3Session([
        ev('QUIC_SESSION_RESET_STREAM_FRAME_SENT', {
          quic_rst_stream_error: 'CANCEL (8)',
          stream_id: 4,
        }),
      ]),
    ]
    const rst = ruleQuicConnectionClose(sessions).filter((f) => f.ruleId === 'quic-rst')
    expect(rst[0]?.severity).toBe('info')
  })

  it('marks peer CANCEL as error (aligned with h2-rst)', () => {
    const sessions = [
      h3Session([
        ev('QUIC_SESSION_RESET_STREAM_FRAME_RECEIVED', {
          quic_rst_stream_error: 'CANCEL (8)',
          stream_id: 4,
        }),
      ]),
    ]
    const rst = ruleQuicConnectionClose(sessions).filter((f) => f.ruleId === 'quic-rst')
    expect(rst[0]?.severity).toBe('error')
  })

  it('marks other non-benign resets as error', () => {
    const sessions = [
      h3Session([
        ev('QUIC_SESSION_RESET_STREAM_FRAME_RECEIVED', {
          quic_rst_stream_error: 'INTERNAL_ERROR (2)',
          stream_id: 8,
        }),
      ]),
    ]
    const rst = ruleQuicConnectionClose(sessions).filter((f) => f.ruleId === 'quic-rst')
    expect(rst[0]?.severity).toBe('error')
  })

  it('aligns session status error with quic-rst error finding', () => {
    const session = h3Session([
      ev('QUIC_SESSION_RESET_STREAM_FRAME_RECEIVED', {
        quic_rst_stream_error: 'INTERNAL_ERROR (2)',
        stream_id: 8,
      }),
    ])
    const findings = ruleQuicConnectionClose([session])
    const summary: SessionSummary = {
      id: 42,
      protocol: 'h3',
      host: 'example.com',
      paths: [],
      proxy: '',
      streamCount: 1,
      startTimeMs: 0,
      endTimeMs: 100,
      hasError: true,
      origin: 'events',
    }
    expect(sessionIssueKind(summary, session, findings)).toBe('error')
    expect(findings.some((f) => f.ruleId === 'quic-rst' && f.severity === 'error')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import type { TransferSession } from '../diagnosis/runDiagnosis'
import type { Finding } from '../diagnosis/types'
import type { NetlogEvent } from '../parser/types'
import {
  isActionableErrorEvent,
  isBenignResetOrCloseCode,
  sessionQualifiesForErrorsFilter,
} from './sessionIssues'

function ev(type: string, params: Record<string, unknown> = {}): NetlogEvent {
  return {
    index: 1,
    timeMs: 0,
    type,
    typeId: 1,
    sourceId: 1,
    sourceType: 'HTTP2_SESSION',
    sourceTypeId: 1,
    phase: 'NONE',
    params,
  }
}

function session(events: NetlogEvent[]): TransferSession {
  return {
    id: 1,
    protocol: 'h2',
    host: 'x',
    proxy: '',
    startTimeMs: 0,
    endTimeMs: 1,
    secure: true,
    settingsSent: {},
    settingsReceived: {},
    streams: [],
    events,
    relatedSourceIds: [],
    hasError: true,
  }
}

describe('sessionIssues', () => {
  it('treats NO_ERROR and CANCEL as benign reset codes', () => {
    expect(isBenignResetOrCloseCode('NO_ERROR')).toBe(true)
    expect(isBenignResetOrCloseCode('0')).toBe(true)
    expect(isBenignResetOrCloseCode('CANCEL')).toBe(true)
    expect(isBenignResetOrCloseCode('8')).toBe(true)
    expect(isBenignResetOrCloseCode('PROTOCOL_ERROR')).toBe(false)
    expect(isBenignResetOrCloseCode('1')).toBe(false)
  })

  it('ignores normal QUIC_SESSION_CLOSED for actionable errors', () => {
    expect(isActionableErrorEvent(ev('QUIC_SESSION_CLOSED', { net_error: 0 }))).toBe(false)
    expect(isActionableErrorEvent(ev('QUIC_SESSION_CLOSED'))).toBe(false)
  })

  it('counts QUIC_SESSION_CLOSE_ON_ERROR as actionable', () => {
    expect(isActionableErrorEvent(ev('QUIC_SESSION_CLOSE_ON_ERROR', { quic_error: 10 }))).toBe(
      true,
    )
  })

  it('ignores benign RST_STREAM with CANCEL', () => {
    expect(
      isActionableErrorEvent(ev('HTTP2_SESSION_RECV_RST_STREAM', { error_code: 'CANCEL (8)' })),
    ).toBe(false)
  })

  it('counts non-benign RST_STREAM', () => {
    expect(
      isActionableErrorEvent(
        ev('HTTP2_SESSION_RECV_RST_STREAM', { error_code: 'PROTOCOL_ERROR (1)' }),
      ),
    ).toBe(true)
  })

  it('qualifies on critical/error findings only, not warnings', () => {
    const warning: Finding = {
      id: 'w',
      severity: 'warning',
      title: 'flow control',
      explanation: '',
      suggestion: '',
      sessionId: 1,
      evidenceEventIndexes: [],
      ruleId: 'x',
    }
    expect(sessionQualifiesForErrorsFilter(session([]), [warning])).toBe(false)

    const error: Finding = { ...warning, id: 'e', severity: 'error' }
    expect(sessionQualifiesForErrorsFilter(session([]), [error])).toBe(true)
  })

  it('does not qualify session with only summary.hasError and benign close', () => {
    const closed = session([ev('QUIC_SESSION_CLOSED')])
    expect(sessionQualifiesForErrorsFilter(closed, [])).toBe(false)
  })
})

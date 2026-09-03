import { describe, expect, it } from 'vitest'
import type { TransferSession } from '../diagnosis/runDiagnosis'
import type { Finding, SessionSummary } from '../diagnosis/types'
import { buildSessionSwimlanes, countSessionsWithIssues, markerPosition, sessionHasSwimlaneIssues, sessionOverlapsRange, swimlaneBarPosition } from './sessionSwimlanes'

describe('sessionSwimlanes', () => {
  const summaries: SessionSummary[] = [
    {
      id: 1,
      protocol: 'h2',
      host: 'a.example',
      paths: ['/'],
      proxy: '',
      startTimeMs: 100,
      endTimeMs: 500,
      streamCount: 1,
      hasError: false,
    },
    {
      id: 2,
      protocol: 'h3',
      host: 'b.example',
      paths: ['/api'],
      proxy: '',
      startTimeMs: 200,
      endTimeMs: 800,
      streamCount: 2,
      hasError: true,
    },
  ]

  const sessions: TransferSession[] = [
    {
      id: 1,
      protocol: 'h2',
      host: 'a.example',
      proxy: '',
      startTimeMs: 100,
      endTimeMs: 500,
      secure: true,
      settingsSent: {},
      settingsReceived: {},
      streams: [],
      events: [{ index: 10, timeMs: 150, type: 'HTTP2_SESSION', typeId: 1, sourceId: 1, sourceType: 'HTTP2_SESSION', sourceTypeId: 1, phase: 'NONE', params: {} }],
      relatedSourceIds: [],
      hasError: false,
      origin: 'events',
    },
    {
      id: 2,
      protocol: 'h3',
      host: 'b.example',
      proxy: '',
      startTimeMs: 200,
      endTimeMs: 800,
      secure: true,
      settingsSent: {},
      settingsReceived: {},
      streams: [],
      events: [{ index: 20, timeMs: 400, type: 'QUIC_SESSION', typeId: 1, sourceId: 2, sourceType: 'QUIC_SESSION', sourceTypeId: 1, phase: 'NONE', params: {} }],
      relatedSourceIds: [],
      hasError: true,
      origin: 'events',
    },
  ]

  const findings: Finding[] = [
    {
      id: 'f-1',
      severity: 'error',
      title: 'RST on stream',
      explanation: '',
      suggestion: '',
      sessionId: 2,
      evidenceEventIndexes: [20],
      ruleId: 'h2-rst',
    },
  ]

  it('builds rows sorted with errors first', () => {
    const data = buildSessionSwimlanes(summaries, sessions, findings)
    expect(data.rows[0].sessionId).toBe(2)
    expect(data.rows[0].markers).toHaveLength(1)
    expect(data.rows[0].markers[0].timeMs).toBe(400)
  })

  it('computes bar and marker positions in range', () => {
    const bar = swimlaneBarPosition(200, 800, 100, 800)
    expect(bar.leftPct).toBeGreaterThan(0)
    expect(bar.widthPct).toBeGreaterThan(0)
    expect(markerPosition(400, 100, 800)).toBeCloseTo(42.857, 1)
  })

  it('filters errors only (hasError or findings)', () => {
    const data = buildSessionSwimlanes(summaries, sessions, findings, { errorsOnly: true })
    expect(data.rows).toHaveLength(1)
    expect(data.rows[0].hasError).toBe(true)
    expect(data.totalMatching).toBe(1)
  })

  it('sessionHasSwimlaneIssues ignores info and warning findings', () => {
    const summary: SessionSummary = {
      id: 9,
      protocol: 'h2',
      host: 'x',
      paths: [],
      proxy: '',
      startTimeMs: 0,
      endTimeMs: 1,
      streamCount: 0,
      hasError: false,
    }
    const info: Finding = {
      id: 'f',
      severity: 'info',
      title: 'cancel',
      explanation: '',
      suggestion: '',
      sessionId: 9,
      evidenceEventIndexes: [],
      ruleId: 'h2-rst',
    }
    const warning: Finding = { ...info, id: 'w', severity: 'warning', title: 'ping' }
    const error: Finding = { ...info, id: 'e', severity: 'error', title: 'rst' }
    expect(sessionHasSwimlaneIssues(summary, [info])).toBe(false)
    expect(sessionHasSwimlaneIssues(summary, [warning])).toBe(false)
    expect(sessionHasSwimlaneIssues(summary, [error])).toBe(true)
  })

  it('countSessionsWithIssues', () => {
    expect(countSessionsWithIssues(summaries, sessions, findings)).toBe(1)
  })

  it('detects session overlap with brush range', () => {
    expect(sessionOverlapsRange(100, 500, 200, 300)).toBe(true)
    expect(sessionOverlapsRange(100, 150, 200, 300)).toBe(false)
  })
})

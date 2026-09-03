import { describe, expect, it } from 'vitest'
import { searchAnalysis } from './globalSearch'
import type { TransferAnalysis } from '../diagnosis/runDiagnosis'

const analysis: TransferAnalysis = {
  fileName: 't.json',
  eventCount: 2,
  urlRequestCount: 0,
  failedUrlRequestCount: 0,
  findings: [
    {
      id: 'f1',
      severity: 'error',
      title: 'RST on stream',
      explanation: '',
      suggestion: '',
      sessionId: 1,
      evidenceEventIndexes: [5],
      ruleId: 'h2-rst',
      host: 'example.com',
    },
  ],
  sessionSummaries: [
    {
      id: 1,
      protocol: 'h2',
      host: 'example.com',
      paths: ['/api'],
      proxy: '',
      startTimeMs: 0,
      endTimeMs: 100,
      streamCount: 1,
      hasError: true,
    },
  ],
  sessions: [
    {
      id: 1,
      protocol: 'h2',
      host: 'example.com',
      proxy: '',
      startTimeMs: 0,
      endTimeMs: 100,
      secure: true,
      settingsSent: {},
      settingsReceived: {},
      streams: [],
      events: [
        {
          index: 5,
          timeMs: 10,
          type: 'HTTP2_SESSION_RECV_RST_STREAM',
          typeId: 1,
          sourceId: 1,
          sourceType: 'HTTP2_SESSION',
          sourceTypeId: 1,
          phase: 'NONE',
          params: { error_code: 'PROTOCOL_ERROR (1)' },
        },
      ],
      relatedSourceIds: [],
      hasError: true,
      origin: 'events',
    },
  ],
  urlRequests: [],
  polledOnlySessionCount: 0,
  polledEnrichedCount: 0,
}

describe('globalSearch', () => {
  it('finds findings and sessions', () => {
    const hits = searchAnalysis(analysis, 'example')
    expect(hits.some((h) => h.kind === 'finding')).toBe(true)
    expect(hits.some((h) => h.kind === 'session')).toBe(true)
  })

  it('finds events by type', () => {
    const hits = searchAnalysis(analysis, 'rst_stream')
    expect(hits.some((h) => h.kind === 'event')).toBe(true)
  })
})

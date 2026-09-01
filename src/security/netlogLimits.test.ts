import { describe, expect, it } from 'vitest'
import { MAX_NETLOG_FILE_BYTES, validateNetlogFileSize } from './netlogLimits'
import { sanitizeAppUrlState } from './sanitizeUrlState'

describe('netlogLimits', () => {
  it('accepts files under the cap', () => {
    expect(validateNetlogFileSize(1024)).toBeNull()
    expect(validateNetlogFileSize(MAX_NETLOG_FILE_BYTES)).toBeNull()
  })

  it('rejects files over the cap', () => {
    expect(validateNetlogFileSize(MAX_NETLOG_FILE_BYTES + 1)).toMatch(/too large/i)
  })
})

describe('sanitizeAppUrlState', () => {
  const analysis = {
    eventCount: 100,
    sessions: [{ id: 42 }],
    findings: [{ id: 'f-1' }],
  }

  it('keeps valid session, event, and finding ids', () => {
    const out = sanitizeAppUrlState(
      { sessionId: 42, eventIndex: 10, findingId: 'f-1' },
      analysis,
    )
    expect(out).toEqual({ sessionId: 42, eventIndex: 10, findingId: 'f-1' })
  })

  it('drops unknown session and event', () => {
    const out = sanitizeAppUrlState({ sessionId: 999, eventIndex: 10 }, analysis)
    expect(out).toEqual({})
  })

  it('drops out-of-range event index', () => {
    const out = sanitizeAppUrlState({ sessionId: 42, eventIndex: 500 }, analysis)
    expect(out).toEqual({ sessionId: 42 })
  })
})

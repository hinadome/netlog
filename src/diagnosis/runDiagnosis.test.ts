import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runDiagnosis, toTransferAnalysis } from '../diagnosis/runDiagnosis'
import { parseNetlogJson } from '../parser/readNetlog'
import { buildHttp2Sessions } from '../model/http2Session'
import { buildQuicSessions } from '../model/quicSession'

const dir = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(join(dir, '../fixtures/sample-h2-invalid-header.json'), 'utf8')

describe('netlog parser + diagnosis', () => {
  it('parses constants and resolves event type names', () => {
    const parsed = parseNetlogJson(fixture, 'sample.json')
    expect(parsed.eventCount).toBeGreaterThan(0)
    expect(parsed.events[0].type).toBe('HTTP2_SESSION')
    expect(parsed.sources.get(218)?.type).toBe('HTTP2_SESSION')
  })

  it('reconstructs HTTP/2 session with stream headers and errors', () => {
    const parsed = parseNetlogJson(fixture)
    const sessions = buildHttp2Sessions(parsed)
    expect(sessions).toHaveLength(1)
    const s = sessions[0]
    expect(s.host).toBe('example.com')
    const stream = s.streams.get(9)
    expect(stream?.method).toBe('GET')
    expect(stream?.path).toBe('/login')
    expect(stream?.hasError).toBe(true)
    expect(s.hasError).toBe(true)
  })

  it('flags INVALID_HEADER and PROTOCOL_ERROR findings', () => {
    const parsed = parseNetlogJson(fixture)
    const result = runDiagnosis(parsed)
    const invalid = result.findings.filter((f) => f.ruleId === 'h2-invalid-header')
    expect(invalid.length).toBe(1)
    expect(invalid[0].title).toContain('strict-transport-security')
    expect(invalid[0].severity).toBe('critical')

    const rst = result.findings.filter((f) => f.ruleId === 'h2-rst')
    expect(rst.some((f) => /PROTOCOL_ERROR/i.test(f.title))).toBe(true)

    const urlErr = result.findings.filter((f) => f.ruleId === 'url-net-error')
    expect(urlErr.length).toBe(1)
    expect(urlErr[0].url).toContain('example.com/login')
  })

  it('reconstructs QUIC session and connection close finding', () => {
    const parsed = parseNetlogJson(fixture)
    const quic = buildQuicSessions(parsed)
    expect(quic).toHaveLength(1)
    expect(quic[0].host).toBe('quic.example.com')
    expect(quic[0].hasError).toBe(true)

    const result = runDiagnosis(parsed)
    const closes = result.findings.filter((f) => f.ruleId === 'quic-close')
    expect(closes.length).toBeGreaterThan(0)
    expect(closes[0].host).toBe('quic.example.com')
  })

  it('serializes analysis for worker transfer', () => {
    const parsed = parseNetlogJson(fixture)
    const transfer = toTransferAnalysis(runDiagnosis(parsed))
    expect(transfer.sessions.length).toBe(2)
    expect(transfer.sessions[0].streams.length).toBeGreaterThan(0)
    expect(transfer.findings.length).toBeGreaterThan(0)
  })
})

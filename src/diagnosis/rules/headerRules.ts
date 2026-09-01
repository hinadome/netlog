import type { Finding } from '../types'
import type { ProtocolSession } from '../../model/http2Session'

let findingCounter = 0

function nextId(ruleId: string): string {
  findingCounter += 1
  return `${ruleId}-${findingCounter}`
}

export function resetHeaderFindingIds(): void {
  findingCounter = 0
}

const PSEUDO_HEADERS = new Set([':method', ':path', ':authority', ':scheme', ':status'])

export function ruleHeaderAnomalies(sessions: ProtocolSession[]): Finding[] {
  const findings: Finding[] = []

  for (const session of sessions) {
    if (session.protocol !== 'h2') continue

    for (const ev of session.events) {
      if (!ev.type.includes('HEADERS')) continue
      const headers = ev.params.headers
      if (!Array.isArray(headers)) continue

      const names: string[] = []
      const pseudoSeen = new Set<string>()
      let duplicatePseudo: string | undefined
      let uppercaseName: string | undefined

      for (const h of headers) {
        const line = String(h)
        const colon = line.indexOf(':')
        const name = (colon >= 0 ? line.slice(0, colon) : line).trim().toLowerCase()
        names.push(name)

        if (PSEUDO_HEADERS.has(name)) {
          if (pseudoSeen.has(name)) duplicatePseudo = name
          pseudoSeen.add(name)
        }
        if (/[A-Z]/.test(name) && name.startsWith(':')) {
          uppercaseName = name
        }
      }

      const streamId = typeof ev.params.stream_id === 'number' ? ev.params.stream_id : undefined

      if (duplicatePseudo) {
        findings.push({
          id: nextId('h2-header-duplicate'),
          ruleId: 'h2-header-duplicate',
          severity: 'error',
          title: `Duplicate pseudo-header ${duplicatePseudo}`,
          explanation: `HTTP/2 forbids duplicate pseudo-headers. Found repeated ${duplicatePseudo} on a HEADERS frame.`,
          suggestion: 'Inspect the peer or intermediary emitting malformed HEADERS; fix proxy compression or server push logic.',
          sessionId: session.id,
          protocol: session.protocol,
          streamId,
          evidenceEventIndexes: [ev.index],
          host: session.host,
        })
      }

      if (uppercaseName) {
        findings.push({
          id: nextId('h2-header-case'),
          ruleId: 'h2-header-case',
          severity: 'warning',
          title: `Pseudo-header with uppercase: ${uppercaseName}`,
          explanation: 'HTTP/2 pseudo-header names must be lowercase. Mixed case can trigger protocol errors on strict stacks.',
          suggestion: 'Normalize header names at the emitter; check intermediaries rewriting headers.',
          sessionId: session.id,
          protocol: session.protocol,
          streamId,
          evidenceEventIndexes: [ev.index],
          host: session.host,
        })
      }

      const authorityCount = names.filter((n) => n === ':authority').length
      if (authorityCount > 1) {
        findings.push({
          id: nextId('h2-header-authority'),
          ruleId: 'h2-header-authority',
          severity: 'warning',
          title: 'Multiple :authority values in one HEADERS block',
          explanation: 'More than one :authority header in a single HEADERS frame is invalid.',
          suggestion: 'Check for proxy duplication or buggy header merging.',
          sessionId: session.id,
          protocol: session.protocol,
          streamId,
          evidenceEventIndexes: [ev.index],
          host: session.host,
        })
      }
    }
  }

  return findings
}

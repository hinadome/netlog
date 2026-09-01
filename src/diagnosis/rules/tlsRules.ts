import type { Finding } from '../types'
import type { ParsedNetlog } from '../../parser/types'
import type { ProtocolSession } from '../../model/http2Session'

let findingCounter = 0

function nextId(ruleId: string): string {
  findingCounter += 1
  return `${ruleId}-${findingCounter}`
}

export function resetTlsFindingIds(): void {
  findingCounter = 0
}

export function ruleTlsAlpn(
  parsed: ParsedNetlog,
  sessions: ProtocolSession[],
): Finding[] {
  const findings: Finding[] = []
  const sessionByRelated = new Map<number, ProtocolSession>()
  for (const s of sessions) {
    sessionByRelated.set(s.id, s)
    for (const rid of s.relatedSourceIds) sessionByRelated.set(rid, s)
  }

  for (const source of parsed.sources.values()) {
    if (source.type !== 'SOCKET' && source.type !== 'SSL_SOCKET' && !source.type.includes('SSL')) {
      continue
    }

    for (const ev of source.events) {
      const p = ev.params
      const alpn = typeof p.alpn_protocol === 'string' ? p.alpn_protocol : undefined
      const negotiated =
        typeof p.negotiated_protocol === 'string' ? p.negotiated_protocol : undefined
      const sslVersion = typeof p.ssl_version === 'string' ? p.ssl_version : undefined
      const netError = p.net_error

      const dep = p.source_dependency
      const depId =
        dep && typeof dep === 'object' && 'id' in dep && typeof (dep as { id: unknown }).id === 'number'
          ? (dep as { id: number }).id
          : undefined
      const session = depId !== undefined ? sessionByRelated.get(depId) : undefined

      if (typeof netError === 'number' && netError < 0) {
        const errName = parsed.constants.netErrorToName.get(netError) ?? String(netError)
        findings.push({
          id: nextId('tls-handshake-fail'),
          ruleId: 'tls-handshake-fail',
          severity: 'error',
          title: `TLS handshake failed: ${errName}`,
          explanation: `Socket/SSL source ${source.id} reported net_error ${netError} during handshake.`,
          suggestion: 'Check certificate chain, SNI, cipher suites, and clock skew. Correlate with server TLS logs.',
          sessionId: session?.id,
          protocol: session?.protocol,
          evidenceEventIndexes: [ev.index],
          host: session?.host,
        })
        continue
      }

      if (alpn && session && !/h2|h3|http/i.test(alpn)) {
        findings.push({
          id: nextId('tls-alpn-unexpected'),
          ruleId: 'tls-alpn-unexpected',
          severity: 'warning',
          title: `Unexpected ALPN: ${alpn}`,
          explanation: `ALPN negotiated ${alpn} on a connection tied to HTTP session ${session.id}. Expected h2/h3 for multiplexed HTTP.`,
          suggestion: 'Verify server ALPN advertisement and proxy TLS termination settings.',
          sessionId: session.id,
          protocol: session.protocol,
          evidenceEventIndexes: [ev.index],
          host: session.host,
        })
      }

      if (negotiated && sslVersion) {
        const sessionId = session?.id
        if (sessionId !== undefined) {
          const existing = findings.find(
            (f) => f.ruleId === 'tls-negotiated' && f.sessionId === sessionId,
          )
          if (!existing) {
            findings.push({
              id: nextId('tls-negotiated'),
              ruleId: 'tls-negotiated',
              severity: 'info',
              title: `TLS ${sslVersion} · ${negotiated}`,
              explanation: `Application protocol ${negotiated} over ${sslVersion}.`,
              suggestion: 'Informational — use when correlating HTTP/2 vs HTTP/3 selection.',
              sessionId,
              protocol: session?.protocol,
              evidenceEventIndexes: [ev.index],
              host: session?.host,
            })
          }
        }
      }
    }
  }

  return findings
}

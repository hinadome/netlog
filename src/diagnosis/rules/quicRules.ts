import type { Finding } from '../types'
import type { ProtocolSession } from '../../model/http2Session'

let counter = 0
function nextId(ruleId: string): string {
  counter += 1
  return `${ruleId}-${counter}`
}

export function resetQuicFindingIds(): void {
  counter = 0
}

export function ruleQuicConnectionClose(sessions: ProtocolSession[]): Finding[] {
  const findings: Finding[] = []
  for (const session of sessions) {
    if (session.protocol !== 'h3') continue

    for (const ev of session.events) {
      const isClose =
        ev.type.includes('CONNECTION_CLOSE') ||
        ev.type === 'QUIC_SESSION_CLOSED' ||
        ev.type === 'QUIC_SESSION_CLOSE_ON_ERROR'

      if (!isClose) continue

      const p = ev.params
      const code = String(
        p.quic_error ?? p.error_code ?? p.close_type ?? p.net_error ?? session.connectionClose?.errorCode ?? 'close',
      )
      const details =
        typeof p.details === 'string'
          ? p.details
          : typeof p.error_details === 'string'
            ? p.error_details
            : session.connectionClose?.details

      const benign = /NO_ERROR|QUIC_PUBLIC_RESET|SILENT_IDLE|NETWORK_IDLE/i.test(code + (details ?? ''))
      findings.push({
        id: nextId('quic-close'),
        ruleId: 'quic-close',
        severity: benign ? 'info' : 'error',
        title: `QUIC connection close: ${code}`,
        explanation: [
          details,
          ev.type.includes('RECEIVED') || session.connectionClose?.fromPeer
            ? 'Close originated from the peer.'
            : 'Close originated locally (client).',
          'HTTP/3 requests on this connection may fail with ERR_QUIC_* errors.',
        ]
          .filter(Boolean)
          .join(' '),
        suggestion:
          'Compare quic_error / details with server logs. Handshake failures often point to TLS/ALPN or UDP path issues (firewall, MTU).',
        sessionId: session.id,
        protocol: 'h3',
        evidenceEventIndexes: [ev.index],
        host: session.host,
      })
    }

    for (const ev of session.events) {
      if (!(ev.type.includes('RST') || ev.type.includes('RESET_STREAM') || ev.type.includes('STOP_SENDING'))) {
        continue
      }
      const streamId =
        typeof ev.params.stream_id === 'number'
          ? ev.params.stream_id
          : typeof ev.params.quic_stream_id === 'number'
            ? ev.params.quic_stream_id
            : undefined
      const code = String(ev.params.quic_rst_stream_error ?? ev.params.error_code ?? 'RST')
      findings.push({
        id: nextId('quic-rst'),
        ruleId: 'quic-rst',
        severity: /NO_ERROR|CANCEL/i.test(code) ? 'info' : 'warning',
        title: `QUIC stream reset ${code}${streamId !== undefined ? ` (stream ${streamId})` : ''}`,
        explanation: `Stream was reset via ${ev.type}.`,
        suggestion: 'Link to the URL_REQUEST for this stream and check whether the application aborted or the peer rejected the request.',
        sessionId: session.id,
        protocol: 'h3',
        streamId,
        evidenceEventIndexes: [ev.index],
        host: session.host,
      })
    }
  }
  return findings
}

export function ruleQuicHandshake(sessions: ProtocolSession[]): Finding[] {
  const findings: Finding[] = []
  for (const session of sessions) {
    if (session.protocol !== 'h3') continue
    const hasCrypto = session.events.some(
      (e) =>
        e.type.includes('CRYPTO') ||
        e.type.includes('HANDSHAKE') ||
        e.type === 'QUIC_SESSION_ENCRYPTION_ESTABLISHED',
    )
    const closedEarly = session.events.some(
      (e) =>
        e.type.includes('CONNECTION_CLOSE') ||
        e.type === 'QUIC_SESSION_CLOSE_ON_ERROR' ||
        e.type === 'QUIC_SESSION_CLOSED',
    )
    const established = session.events.some(
      (e) =>
        e.type === 'QUIC_SESSION_ENCRYPTION_ESTABLISHED' ||
        e.type.includes('HANDSHAKE_CONFIRMED') ||
        e.type.includes('HANDSHAKE_DONE'),
    )

    if (hasCrypto && closedEarly && !established) {
      const closeEv = session.events.find(
        (e) =>
          e.type.includes('CONNECTION_CLOSE') ||
          e.type === 'QUIC_SESSION_CLOSE_ON_ERROR' ||
          e.type === 'QUIC_SESSION_CLOSED',
      )
      findings.push({
        id: nextId('quic-handshake'),
        ruleId: 'quic-handshake',
        severity: 'error',
        title: 'QUIC/HTTP3 handshake did not complete',
        explanation:
          'The session logged crypto/handshake activity but closed before encryption/handshake confirmation. Common causes: UDP blocking, TLS mismatch, or middlebox interference.',
        suggestion:
          'Verify UDP/443 reachability, check certificate/ALPN (h3), and compare with a successful h2 fallback capture.',
        sessionId: session.id,
        protocol: 'h3',
        evidenceEventIndexes: closeEv ? [closeEv.index] : [session.events[0]?.index].filter((n) => n !== undefined),
        host: session.host,
      })
    }
  }
  return findings
}

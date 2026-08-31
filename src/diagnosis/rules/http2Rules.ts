import type { Finding } from '../types'
import type { ProtocolSession } from '../../model/http2Session'
import type { UrlRequestInfo } from '../../model/correlate'

let findingCounter = 0

function nextId(ruleId: string): string {
  findingCounter += 1
  return `${ruleId}-${findingCounter}`
}

export function resetFindingIds(): void {
  findingCounter = 0
}

export function ruleInvalidHeaders(sessions: ProtocolSession[]): Finding[] {
  const findings: Finding[] = []
  for (const session of sessions) {
    for (const ev of session.events) {
      if (ev.type !== 'HTTP2_SESSION_RECV_INVALID_HEADER') continue
      const p = ev.params
      const headerName = String(p.header_name ?? '(unknown)')
      const headerValue = String(p.header_value ?? '')
      const error = String(p.error ?? 'Invalid header')
      const streamId = typeof p.stream_id === 'number' ? p.stream_id : undefined
      findings.push({
        id: nextId('h2-invalid-header'),
        ruleId: 'h2-invalid-header',
        severity: 'critical',
        title: `Invalid HTTP/2 header: ${headerName}`,
        explanation: `${error} Header "${headerName}" had value ${JSON.stringify(headerValue)}. Chromium rejects malformed headers more strictly on HTTP/2, which typically surfaces as ERR_HTTP2_PROTOCOL_ERROR.`,
        suggestion:
          'Fix the upstream/proxy so the header name and value contain only valid HTTP header characters (no newlines, NULs, or forbidden octets). Re-capture after deploying the fix.',
        sessionId: session.id,
        protocol: session.protocol,
        streamId,
        evidenceEventIndexes: [ev.index],
        host: session.host,
      })
    }
  }
  return findings
}

export function ruleRstAndGoaway(sessions: ProtocolSession[]): Finding[] {
  const findings: Finding[] = []
  for (const session of sessions) {
    for (const ev of session.events) {
      if (
        ev.type === 'HTTP2_SESSION_SEND_RST_STREAM' ||
        ev.type === 'HTTP2_SESSION_RECV_RST_STREAM'
      ) {
        const p = ev.params
        const code = String(p.error_code ?? '')
        const isProtocol = /PROTOCOL_ERROR|\(1\)|^1\b/i.test(code)
        const isCancel = /CANCEL|\(8\)|^8\b/i.test(code)
        const direction = ev.type.includes('SEND') ? 'Client sent' : 'Peer sent'
        const streamId = typeof p.stream_id === 'number' ? p.stream_id : undefined
        const description =
          typeof p.description === 'string' ? p.description : undefined

        // Skip pure CANCEL from client as info-only noise unless paired with errors elsewhere
        const severity = isProtocol ? 'critical' : isCancel && ev.type.includes('SEND') ? 'info' : 'error'

        findings.push({
          id: nextId('h2-rst'),
          ruleId: 'h2-rst',
          severity,
          title: `${direction} RST_STREAM ${code}${streamId !== undefined ? ` on stream ${streamId}` : ''}`,
          explanation: [
            description,
            isProtocol
              ? 'PROTOCOL_ERROR usually means a framing or header violation was detected. Look for a preceding INVALID_HEADER or unexpected frame on this stream.'
              : isCancel
                ? 'CANCEL means the sender aborted the stream (often navigation cancel, timeout, or intentional abort)—not necessarily a protocol bug.'
                : 'Inspect surrounding HEADERS/DATA frames and any linked URL_REQUEST net error.',
          ]
            .filter(Boolean)
            .join(' '),
          suggestion: isProtocol
            ? 'Inspect the previous events on this session for INVALID_HEADER or unexpected frames; fix the peer that emitted bad data.'
            : 'Correlate with the URL_REQUEST for this stream and server access/error logs around the same timestamp.',
          sessionId: session.id,
          protocol: session.protocol,
          streamId,
          evidenceEventIndexes: [ev.index],
          host: session.host,
        })
      }

      if (ev.type === 'HTTP2_SESSION_RECV_GOAWAY' || ev.type === 'HTTP2_SESSION_SEND_GOAWAY') {
        const p = ev.params
        const code = String(p.error_code ?? '')
        if (/NO_ERROR|^0\b/i.test(code)) continue
        findings.push({
          id: nextId('h2-goaway'),
          ruleId: 'h2-goaway',
          severity: 'error',
          title: `HTTP/2 GOAWAY ${code}`,
          explanation: `GOAWAY received/sent with error ${code}.${p.debug_data ? ` Debug: ${String(p.debug_data)}` : ''} Active streams after last-accepted may be aborted.`,
          suggestion:
            'Check server graceful-shutdown behavior, max concurrent streams, and whether the peer is overloaded or rejecting the connection.',
          sessionId: session.id,
          protocol: session.protocol,
          evidenceEventIndexes: [ev.index],
          host: session.host,
        })
      }
    }
  }
  return findings
}

export function ruleFlowControl(sessions: ProtocolSession[]): Finding[] {
  const findings: Finding[] = []
  for (const session of sessions) {
    let lastWindow = Number.POSITIVE_INFINITY
    let lastWindowEventIndex = -1
    let lastWindowTime = 0
    for (const ev of session.events) {
      if (
        ev.type === 'HTTP2_SESSION_UPDATE_RECV_WINDOW' ||
        ev.type === 'HTTP2_SESSION_UPDATE_SEND_WINDOW' ||
        ev.type === 'HTTP2_SESSION_RECV_WINDOW_UPDATE'
      ) {
        const win =
          typeof ev.params.window_size === 'number'
            ? ev.params.window_size
            : typeof ev.params.delta === 'number'
              ? lastWindow + (ev.params.delta as number)
              : lastWindow
        lastWindow = win
        lastWindowEventIndex = ev.index
        lastWindowTime = ev.timeMs
      }
    }
    // Heuristic: window stuck very low near end of session with remaining duration
    if (
      lastWindowEventIndex >= 0 &&
      lastWindow >= 0 &&
      lastWindow < 1024 &&
      session.endTimeMs - lastWindowTime > 2000
    ) {
      findings.push({
        id: nextId('h2-flow-control'),
        ruleId: 'h2-flow-control',
        severity: 'warning',
        title: 'Possible HTTP/2 flow-control stall',
        explanation: `Receive/send window was near ${lastWindow} bytes and the session continued for ${Math.round((session.endTimeMs - lastWindowTime) / 1000)}s without recovery. Stalled windows can look like hung requests.`,
        suggestion:
          'Check for missing WINDOW_UPDATE frames, large uploads without flow-control credits, or a proxy buffering issue.',
        sessionId: session.id,
        protocol: session.protocol,
        evidenceEventIndexes: [lastWindowEventIndex],
        host: session.host,
      })
    }
  }
  return findings
}

export function ruleUrlRequestErrors(
  sessions: ProtocolSession[],
  urlRequests: Map<number, UrlRequestInfo>,
): Finding[] {
  const findings: Finding[] = []
  const sessionById = new Map(sessions.map((s) => [s.id, s]))

  for (const req of urlRequests.values()) {
    if (!req.netError) continue
    const isH2 = /HTTP2|SPDY/i.test(req.netError)
    const isQuic = /QUIC|HTTP3/i.test(req.netError)
    if (!isH2 && !isQuic) continue

    const session = req.relatedSessionIds.map((id) => sessionById.get(id)).find(Boolean)
    const endEv = [...req.events].reverse().find((e) => e.params.net_error !== undefined)

    findings.push({
      id: nextId('url-net-error'),
      ruleId: 'url-net-error',
      severity: 'error',
      title: `Request failed: ${req.netError}`,
      explanation: `URL_REQUEST ${req.url ?? req.sourceId} ended with ${req.netError}. ${
        session
          ? `Linked to ${session.protocol.toUpperCase()} session ${session.id} (${session.host}). Open the session timeline around the failure.`
          : 'No protocol session link found; inspect raw URL_REQUEST events.'
      }`,
      suggestion:
        'Open the linked session findings for INVALID_HEADER, RST_STREAM, GOAWAY, or CONNECTION_CLOSE that explain this net error.',
      sessionId: session?.id,
      protocol: session?.protocol ?? (isQuic ? 'h3' : 'h2'),
      evidenceEventIndexes: endEv ? [endEv.index] : req.events.slice(-1).map((e) => e.index),
      host: session?.host,
      url: req.url,
    })
  }
  return findings
}

export function rulePingTimeout(sessions: ProtocolSession[]): Finding[] {
  const findings: Finding[] = []
  for (const session of sessions) {
    if (session.protocol !== 'h2') continue
    const pending = new Map<string | number, number>()
    for (const ev of session.events) {
      if (ev.type !== 'HTTP2_SESSION_PING') continue
      const id = (ev.params.unique_id ?? ev.params.ping_id) as string | number | undefined
      const type = String(ev.params.type ?? '')
      const isAck =
        ev.params.is_ack === true || (type === 'received' && ev.params.is_ack !== false)
      if (id === undefined) continue
      if (type === 'sent' && !isAck) {
        pending.set(id, ev.index)
      } else if (isAck || type === 'received') {
        pending.delete(id)
      }
    }
    for (const [, evidence] of pending) {
      findings.push({
        id: nextId('h2-ping'),
        ruleId: 'h2-ping',
        severity: 'warning',
        title: 'Unacknowledged HTTP/2 PING',
        explanation:
          'A PING was sent without a matching ACK in this session. This can indicate a dead connection, middlebox issue, or capture ending before the ACK.',
        suggestion:
          'Confirm whether the session later closed with a timeout or RST; check load balancers that may drop long-lived h2 connections.',
        sessionId: session.id,
        protocol: 'h2',
        evidenceEventIndexes: [evidence],
        host: session.host,
      })
    }
  }
  return findings
}

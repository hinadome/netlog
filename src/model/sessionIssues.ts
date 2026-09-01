import type { TransferSession } from '../diagnosis/runDiagnosis'
import type { Finding, SessionSummary } from '../diagnosis/types'
import { isErrorLikeEvent } from './eventCatalog'
import type { NetlogEvent } from '../parser/types'

/** RST / close codes that are normal control flow, not investigation targets. */
export function isBenignResetOrCloseCode(code: string): boolean {
  const c = code.trim()
  if (!c) return false
  return (
    /NO_ERROR/i.test(c) ||
    /^0\b/.test(c) ||
    /\(0\)/.test(c) ||
    /CANCEL/i.test(c) ||
    /^8\b/.test(c) ||
    /\(8\)/.test(c)
  )
}

function resetCodeFromEvent(ev: NetlogEvent): string {
  const p = ev.params
  return String(p.error_code ?? p.quic_rst_stream_error ?? p.quic_error ?? p.error ?? '')
}

function isBenignProtocolEvent(ev: NetlogEvent): boolean {
  const t = ev.type

  if (t === 'QUIC_SESSION_CLOSED') return true

  if (t.includes('RST_STREAM') || t.includes('RESET_STREAM') || t.includes('STOP_SENDING')) {
    return isBenignResetOrCloseCode(resetCodeFromEvent(ev))
  }

  if (t.includes('GOAWAY')) {
    return isBenignResetOrCloseCode(String(ev.params.error_code ?? ev.params.quic_error ?? ''))
  }

  if (t.includes('CONNECTION_CLOSE') || t === 'QUIC_SESSION_CLOSE_ON_ERROR') {
    const code = String(
      ev.params.quic_error ?? ev.params.error_code ?? ev.params.close_type ?? ev.params.net_error ?? '',
    )
    if (t === 'QUIC_SESSION_CLOSE_ON_ERROR') return false
    return isBenignResetOrCloseCode(code)
  }

  if (t === 'HTTP2_SESSION_CLOSE') {
    const netError = ev.params.net_error
    if (netError === undefined || netError === 0 || netError === 'ok') return true
  }

  return false
}

/** Event that should count for Errors-only and timeline “Errors” density. */
export function isActionableErrorEvent(ev: NetlogEvent): boolean {
  if (!isErrorLikeEvent(ev)) return false
  if (isBenignProtocolEvent(ev)) return false
  return true
}

export function hasActionableErrorFinding(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === 'critical' || f.severity === 'error')
}

/**
 * Errors-only filter: matches what you should see with timeline density “Errors”.
 * Uses critical/error findings + non-benign error-like protocol events.
 * Does not use summary.hasError alone (too many false positives).
 */
export function sessionQualifiesForErrorsFilter(
  session: TransferSession | undefined,
  findingsForSession: Finding[],
): boolean {
  if (hasActionableErrorFinding(findingsForSession)) return true
  if (!session) return false
  return session.events.some((ev) => isActionableErrorEvent(ev))
}

export function indexFindingsBySession(findings: Finding[]): Map<number, Finding[]> {
  const map = new Map<number, Finding[]>()
  for (const f of findings) {
    if (f.sessionId === undefined) continue
    const list = map.get(f.sessionId) ?? []
    list.push(f)
    map.set(f.sessionId, list)
  }
  return map
}

export function countSessionsWithActionableIssues(
  summaries: SessionSummary[],
  sessions: TransferSession[],
  findings: Finding[],
): number {
  const byId = new Map(sessions.map((s) => [s.id, s]))
  const bySession = indexFindingsBySession(findings)
  return summaries.filter((s) =>
    sessionQualifiesForErrorsFilter(byId.get(s.id), bySession.get(s.id) ?? []),
  ).length
}

export type SessionIssueKind = 'error' | 'warning' | 'ok'

export function sessionIssueKind(
  summary: SessionSummary,
  session: TransferSession | undefined,
  findingsForSession: Finding[],
): SessionIssueKind {
  if (sessionQualifiesForErrorsFilter(session, findingsForSession)) return 'error'
  if (
    summary.hasError ||
    findingsForSession.some((f) => f.severity === 'warning')
  ) {
    return 'warning'
  }
  return 'ok'
}

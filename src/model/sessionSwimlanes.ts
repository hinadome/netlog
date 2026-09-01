import type { TransferSession } from '../diagnosis/runDiagnosis'
import type { Finding, FindingSeverity, SessionSummary } from '../diagnosis/types'
import {
  indexFindingsBySession,
  sessionQualifiesForErrorsFilter,
} from './sessionIssues'

export {
  countSessionsWithActionableIssues as countSessionsWithIssues,
  indexFindingsBySession,
  sessionQualifiesForErrorsFilter,
} from './sessionIssues'

export interface SwimlaneMarker {
  timeMs: number
  severity: FindingSeverity
  title: string
  findingId: string
  eventIndex?: number
}

export interface SessionSwimlaneRow {
  sessionId: number
  host: string
  protocol: 'h2' | 'h3'
  startTimeMs: number
  endTimeMs: number
  hasError: boolean
  markers: SwimlaneMarker[]
}

export interface SessionSwimlanesData {
  rangeStartMs: number
  rangeEndMs: number
  rows: SessionSwimlaneRow[]
  /** Rows matching current filters before maxRows trim. */
  totalMatching: number
}

/** @deprecated use sessionQualifiesForErrorsFilter */
export function sessionHasSwimlaneIssues(
  _summary: SessionSummary,
  findingsForSession: Finding[],
): boolean {
  return sessionQualifiesForErrorsFilter(undefined, findingsForSession)
}

const SEVERITY_RANK: Record<FindingSeverity, number> = {
  critical: 0,
  error: 1,
  warning: 2,
  info: 3,
}

export function buildSessionSwimlanes(
  summaries: SessionSummary[],
  sessions: TransferSession[],
  findings: Finding[],
  options?: { errorsOnly?: boolean; maxRows?: number },
): SessionSwimlanesData {
  const byId = new Map(sessions.map((s) => [s.id, s]))
  const findingsBySession = indexFindingsBySession(findings)

  let rangeStartMs = Infinity
  let rangeEndMs = -Infinity

  const rows: SessionSwimlaneRow[] = []

  for (const summary of summaries) {
    const session = byId.get(summary.id)
    const sessionFindings = findingsBySession.get(summary.id) ?? []
    if (options?.errorsOnly && !sessionQualifiesForErrorsFilter(session, sessionFindings)) continue

    const start = summary.startTimeMs
    const end = Math.max(summary.endTimeMs, summary.startTimeMs + 1)
    rangeStartMs = Math.min(rangeStartMs, start)
    rangeEndMs = Math.max(rangeEndMs, end)

    const markers: SwimlaneMarker[] = []
    for (const f of sessionFindings) {
      const eventIndex = f.evidenceEventIndexes[0]
      let timeMs = start
      if (eventIndex !== undefined && session) {
        const ev = session.events.find((e) => e.index === eventIndex)
        if (ev) timeMs = ev.timeMs
      }
      markers.push({
        timeMs,
        severity: f.severity,
        title: f.title,
        findingId: f.id,
        eventIndex,
      })
    }
    markers.sort((a, b) => a.timeMs - b.timeMs)

    rows.push({
      sessionId: summary.id,
      host: summary.host,
      protocol: summary.protocol,
      startTimeMs: start,
      endTimeMs: end,
      hasError: sessionQualifiesForErrorsFilter(session, sessionFindings),
      markers,
    })
  }

  rows.sort((a, b) => {
    if (a.hasError !== b.hasError) return a.hasError ? -1 : 1
    return a.startTimeMs - b.startTimeMs
  })

  const maxRows = options?.maxRows ?? 40
  const totalMatching = rows.length
  const trimmed = rows.slice(0, maxRows)

  if (!Number.isFinite(rangeStartMs) || rangeEndMs <= rangeStartMs) {
    rangeStartMs = 0
    rangeEndMs = 1
  }

  return {
    rangeStartMs,
    rangeEndMs,
    rows: trimmed,
    totalMatching,
  }
}

export function sessionOverlapsRange(
  startMs: number,
  endMs: number,
  brushStartMs: number,
  brushEndMs: number,
): boolean {
  const lo = Math.min(brushStartMs, brushEndMs)
  const hi = Math.max(brushStartMs, brushEndMs)
  return startMs <= hi && endMs >= lo
}

export function timeMsFromPct(pct: number, rangeStartMs: number, rangeEndMs: number): number {
  const span = Math.max(rangeEndMs - rangeStartMs, 1)
  return rangeStartMs + (clampPct(pct) / 100) * span
}

export function formatTimeBrushLabel(startMs: number, endMs: number, baseMs: number): string {
  const a = Math.round(Math.min(startMs, endMs) - baseMs)
  const b = Math.round(Math.max(startMs, endMs) - baseMs)
  return `${a}–${b} ms`
}

export function swimlaneBarPosition(
  startMs: number,
  endMs: number,
  rangeStartMs: number,
  rangeEndMs: number,
): { leftPct: number; widthPct: number } {
  const span = Math.max(rangeEndMs - rangeStartMs, 1)
  const leftPct = ((startMs - rangeStartMs) / span) * 100
  const widthPct = (Math.max(endMs - startMs, 1) / span) * 100
  return {
    leftPct: clampPct(leftPct),
    widthPct: clampPct(widthPct),
  }
}

export function markerPosition(timeMs: number, rangeStartMs: number, rangeEndMs: number): number {
  const span = Math.max(rangeEndMs - rangeStartMs, 1)
  return clampPct(((timeMs - rangeStartMs) / span) * 100)
}

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n))
}

export function worstMarkerSeverity(markers: SwimlaneMarker[]): FindingSeverity | undefined {
  if (markers.length === 0) return undefined
  let worst = markers[0].severity
  for (let i = 1; i < markers.length; i++) {
    const sev = markers[i].severity
    if (SEVERITY_RANK[sev] < SEVERITY_RANK[worst]) worst = sev
  }
  return worst
}

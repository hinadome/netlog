import { useMemo, useState, type ReactNode } from 'react'
import type { TransferSession } from '../diagnosis/runDiagnosis'
import type { Finding, SessionSummary, TimeBrushRange } from '../diagnosis/types'
import {
  countSessionsWithActionableIssues,
  indexFindingsBySession,
  sessionIssueKind,
  sessionQualifiesForErrorsFilter,
} from '../model/sessionIssues'
import { formatTimeBrushLabel, sessionOverlapsRange } from '../model/sessionSwimlanes'

interface Props {
  sessions: SessionSummary[]
  transferSessions: TransferSession[]
  findings: Finding[]
  selectedId?: number
  timeBrush?: TimeBrushRange | null
  onClearTimeBrush?: () => void
  onSelect: (id: number) => void
}

export function SessionsTable({
  sessions,
  transferSessions,
  findings,
  selectedId,
  timeBrush,
  onClearTimeBrush,
  onSelect,
}: Props) {
  const [queryFilter, setQueryFilter] = useState('')
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [proto, setProto] = useState<'all' | 'h2' | 'h3'>('all')

  const sessionById = useMemo(
    () => new Map(transferSessions.map((s) => [s.id, s])),
    [transferSessions],
  )

  const findingsBySession = useMemo(() => indexFindingsBySession(findings), [findings])

  const issuesCount = useMemo(
    () => countSessionsWithActionableIssues(sessions, transferSessions, findings),
    [sessions, transferSessions, findings],
  )

  const baseMs = useMemo(
    () => (sessions.length ? Math.min(...sessions.map((s) => s.startTimeMs)) : 0),
    [sessions],
  )

  const filtered = useMemo(() => {
    const q = queryFilter.trim().toLowerCase()
    return sessions.filter((s) => {
      if (timeBrush) {
        if (
          !sessionOverlapsRange(s.startTimeMs, s.endTimeMs, timeBrush.startMs, timeBrush.endMs)
        ) {
          return false
        }
      }
      const sessionFindings = findingsBySession.get(s.id) ?? []
      if (errorsOnly && !sessionQualifiesForErrorsFilter(sessionById.get(s.id), sessionFindings)) {
        return false
      }
      if (proto !== 'all' && s.protocol !== proto) return false
      if (q) {
        const hostMatch = s.host.toLowerCase().includes(q)
        const pathMatch = s.paths.some((p) => p.toLowerCase().includes(q))
        if (!hostMatch && !pathMatch) return false
      }
      return true
    })
  }, [sessions, queryFilter, errorsOnly, proto, timeBrush, findingsBySession, sessionById])

  const showingLabel = errorsOnly
    ? `Showing ${filtered.length} of ${issuesCount} with errors`
    : `Showing ${filtered.length} of ${sessions.length}`

  const filterHasNoEffect = errorsOnly && issuesCount === sessions.length && sessions.length > 0

  return (
    <div className="sessions-table">
      <div className="toolbar">
        <input
          type="search"
          placeholder="Filter host or path…"
          value={queryFilter}
          onChange={(e) => setQueryFilter(e.target.value)}
        />
        <label
          className="check"
          title="Critical/error findings or protocol error events — same as timeline Errors density. Excludes normal close and CANCEL."
        >
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(e) => setErrorsOnly(e.target.checked)}
          />
          Errors only
        </label>
        <select value={proto} onChange={(e) => setProto(e.target.value as 'all' | 'h2' | 'h3')}>
          <option value="all">All protocols</option>
          <option value="h2">HTTP/2</option>
          <option value="h3">HTTP/3 / QUIC</option>
        </select>
        <span className="sessions-showing muted small" aria-live="polite">
          {showingLabel}
        </span>
        {timeBrush && onClearTimeBrush && (
          <>
            <span className="muted small sessions-brush-hint">
              Brush: {formatTimeBrushLabel(timeBrush.startMs, timeBrush.endMs, baseMs)}
            </span>
            <button type="button" className="linkish" onClick={onClearTimeBrush}>
              Clear brush
            </button>
          </>
        )}
      </div>

      {filterHasNoEffect && (
        <p className="muted small sessions-filter-hint">
          No actionable protocol errors in this capture — Errors only matches the full list.
        </p>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Proto</th>
              <th>Host</th>
              <th>Streams</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted sessions-empty">
                  {errorsOnly
                    ? 'No sessions with actionable errors match the current filters.'
                    : 'No sessions match the current filters.'}
                </td>
              </tr>
            ) : (
              filtered.map((s) => {
                const sessionFindings = findingsBySession.get(s.id) ?? []
                const kind = sessionIssueKind(s, sessionById.get(s.id), sessionFindings)
                return (
                  <tr
                    key={s.id}
                    className={selectedId === s.id ? 'selected' : undefined}
                    onClick={() => onSelect(s.id)}
                  >
                    <td>{s.id}</td>
                    <td>
                      <span className={`badge badge-${s.protocol}`}>{s.protocol}</span>
                    </td>
                    <td className="host-cell" title={s.host}>
                      {s.host}
                    </td>
                    <td>{s.streamCount}</td>
                    <td>{formatDuration(s.endTimeMs - s.startTimeMs)}</td>
                    <td>{statusLabel(kind)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function statusLabel(kind: 'error' | 'warning' | 'ok'): ReactNode {
  if (kind === 'error') return <span className="err-tag">error</span>
  if (kind === 'warning') return <span className="warn-tag">warning</span>
  return 'ok'
}

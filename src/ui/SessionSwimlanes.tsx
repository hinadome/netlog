import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { TransferSession } from '../diagnosis/runDiagnosis'
import type { Finding, SessionSummary, TimeBrushRange } from '../diagnosis/types'
import {
  buildSessionSwimlanes,
  countSessionsWithIssues,
  formatTimeBrushLabel,
  markerPosition,
  sessionOverlapsRange,
  swimlaneBarPosition,
  timeMsFromPct,
  worstMarkerSeverity,
} from '../model/sessionSwimlanes'

interface Props {
  summaries: SessionSummary[]
  sessions: TransferSession[]
  findings: Finding[]
  timeBrush: TimeBrushRange | null
  onTimeBrushChange: (range: TimeBrushRange | null) => void
  onSelectSession: (sessionId: number, eventIndex?: number) => void
  onViewSessionsInBrush?: (count: number) => void
}

export function SessionSwimlanes({
  summaries,
  sessions,
  findings,
  timeBrush,
  onTimeBrushChange,
  onSelectSession,
  onViewSessionsInBrush,
}: Props) {
  const [errorsOnly, setErrorsOnly] = useState(false)
  const brushTrackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startPct: number; dragging: boolean } | null>(null)

  const issuesCount = useMemo(
    () => countSessionsWithIssues(summaries, sessions, findings),
    [summaries, sessions, findings],
  )

  const data = useMemo(
    () => buildSessionSwimlanes(summaries, sessions, findings, { errorsOnly, maxRows: 200 }),
    [summaries, sessions, findings, errorsOnly],
  )

  const visibleRows = useMemo(() => {
    const capped = data.rows.slice(0, 48)
    if (!timeBrush) return capped
    return capped
      .filter((row) =>
        sessionOverlapsRange(row.startTimeMs, row.endTimeMs, timeBrush.startMs, timeBrush.endMs),
      )
  }, [data.rows, timeBrush])

  const brushInRangeCount = useMemo(() => {
    if (!timeBrush) return 0
    return data.rows.filter((row) =>
      sessionOverlapsRange(row.startTimeMs, row.endTimeMs, timeBrush.startMs, timeBrush.endMs),
    ).length
  }, [data.rows, timeBrush])

  const showingLabel = useMemo(() => {
    const shown = visibleRows.length
    if (errorsOnly) {
      return `Showing ${shown} of ${issuesCount} with issues`
    }
    return `Showing ${shown} of ${summaries.length}`
  }, [visibleRows.length, errorsOnly, issuesCount, summaries.length])

  const brushStyle = useMemo(() => {
    if (!timeBrush) return null
    const lo = Math.min(timeBrush.startMs, timeBrush.endMs)
    const hi = Math.max(timeBrush.startMs, timeBrush.endMs)
    const left = markerPosition(lo, data.rangeStartMs, data.rangeEndMs)
    const right = markerPosition(hi, data.rangeStartMs, data.rangeEndMs)
    return { left: `${left}%`, width: `${Math.max(right - left, 0.5)}%` }
  }, [timeBrush, data.rangeStartMs, data.rangeEndMs])

  const pctFromClientX = useCallback(
    (clientX: number): number => {
      const el = brushTrackRef.current
      if (!el) return 0
      const rect = el.getBoundingClientRect()
      return ((clientX - rect.left) / Math.max(rect.width, 1)) * 100
    },
    [],
  )

  const onBrushPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const startPct = pctFromClientX(e.clientX)
    dragRef.current = { startPct, dragging: true }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onBrushPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag?.dragging) return
    const endPct = pctFromClientX(e.clientX)
    const startMs = timeMsFromPct(drag.startPct, data.rangeStartMs, data.rangeEndMs)
    const endMs = timeMsFromPct(endPct, data.rangeStartMs, data.rangeEndMs)
    onTimeBrushChange({ startMs, endMs })
  }

  const onBrushPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    const endPct = pctFromClientX(e.clientX)
    if (Math.abs(endPct - drag.startPct) < 1) {
      onTimeBrushChange(null)
    }
  }

  if (summaries.length === 0) {
    return (
      <section className="panel swimlanes-panel">
        <h2>Session timeline</h2>
        <p className="muted">No HTTP/2 or QUIC sessions to display.</p>
      </section>
    )
  }

  const spanMs = data.rangeEndMs - data.rangeStartMs
  const filterHasNoEffect = errorsOnly && issuesCount === summaries.length

  return (
    <section className="panel swimlanes-panel">
      <div className="panel-head">
        <div>
          <h2>Session timeline</h2>
          <p className="muted small swimlanes-lead">
            Drag on the brush track to filter by time. Click a row to open the session.
          </p>
        </div>
        <div className="swimlanes-actions">
          <span className="swimlanes-showing muted small" aria-live="polite">
            {showingLabel}
          </span>
          {timeBrush && (
            <>
              <span className="muted small swimlanes-brush-label">
                {formatTimeBrushLabel(timeBrush.startMs, timeBrush.endMs, data.rangeStartMs)}
              </span>
              <button type="button" className="linkish" onClick={() => onTimeBrushChange(null)}>
                Clear brush
              </button>
              {onViewSessionsInBrush && brushInRangeCount > 0 && (
                <button
                  type="button"
                  className="linkish"
                  onClick={() => onViewSessionsInBrush(brushInRangeCount)}
                >
                  Sessions tab ({brushInRangeCount})
                </button>
              )}
            </>
          )}
          <label
            className="check"
            title="Sessions with critical/error findings or protocol error events (excludes normal close and CANCEL resets). Matches timeline Errors density."
          >
            <input
              type="checkbox"
              checked={errorsOnly}
              onChange={(e) => setErrorsOnly(e.target.checked)}
            />
            Errors only
          </label>
        </div>
      </div>

      {filterHasNoEffect && (
        <p className="muted small swimlanes-hint">
          No sessions have actionable protocol errors in this capture — Errors only matches the
          full list.
        </p>
      )}

      <div className="swimlanes-axis muted small" aria-hidden="true">
        <span className="swimlanes-axis-label">0 ms</span>
        <span className="swimlanes-axis-label swimlanes-axis-end">{formatAxis(spanMs)}</span>
      </div>

      <div className="swimlane-brush-row">
        <span className="swimlane-brush-label muted small">Brush</span>
        <div
          ref={brushTrackRef}
          className="swimlane-brush-track"
          role="slider"
          aria-label="Time range brush"
          onPointerDown={onBrushPointerDown}
          onPointerMove={onBrushPointerMove}
          onPointerUp={onBrushPointerUp}
          onPointerCancel={onBrushPointerUp}
        >
          {brushStyle && <span className="swimlane-brush-selection" style={brushStyle} />}
        </div>
      </div>

      <div className="swimlanes-scroll">
        {visibleRows.length === 0 ? (
          <p className="muted swimlanes-empty">
            {errorsOnly
              ? 'No sessions with errors or findings match the current filters.'
              : timeBrush
                ? 'No sessions overlap the brushed time range.'
                : 'No sessions to display.'}
          </p>
        ) : (
          visibleRows.map((row) => {
            const bar = swimlaneBarPosition(
              row.startTimeMs,
              row.endTimeMs,
              data.rangeStartMs,
              data.rangeEndMs,
            )
            const worst = worstMarkerSeverity(row.markers)
            return (
              <button
                key={row.sessionId}
                type="button"
                className={`swimlane-row${row.hasError || row.markers.length ? ' swimlane-row--error' : ''}`}
                onClick={() => onSelectSession(row.sessionId, row.markers[0]?.eventIndex)}
                title={`Session ${row.sessionId} · ${row.host}`}
              >
                <span className="swimlane-label">
                  <span className={`badge badge-${row.protocol}`}>{row.protocol}</span>
                  <span className="swimlane-id">{row.sessionId}</span>
                  <span className="swimlane-host" title={row.host}>
                    {row.host}
                  </span>
                </span>
                <span className="swimlane-track">
                  <span
                    className={`swimlane-bar swimlane-bar--${row.protocol}${row.hasError ? ' swimlane-bar--err' : ''}`}
                    style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }}
                  />
                  {row.markers.map((m) => (
                    <span
                      key={m.findingId}
                      className={`swimlane-marker severity-${m.severity}`}
                      style={{
                        left: `${markerPosition(m.timeMs, data.rangeStartMs, data.rangeEndMs)}%`,
                      }}
                      title={m.title}
                    />
                  ))}
                  {worst && row.markers.length > 0 && (
                    <span className="swimlane-marker-count muted small">{row.markers.length}</span>
                  )}
                </span>
              </button>
            )
          })
        )}
      </div>

      {!timeBrush && !errorsOnly && data.totalMatching > visibleRows.length && (
        <p className="muted small swimlanes-trunc">
          List capped at {visibleRows.length} rows (errors and findings sorted first). Use brush or
          Errors only to narrow.
        </p>
      )}
    </section>
  )
}

function formatAxis(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  return `${(ms / 60_000).toFixed(1)} min`
}

import { useMemo } from 'react'
import type { UrlRequestSummary } from '../diagnosis/types'
import { sessionOverlapsRange } from '../model/sessionSwimlanes'
import { buildUrlWaterfallFromSummaries } from '../model/urlWaterfall'

interface Props {
  requests: UrlRequestSummary[]
  timeBrush?: { startMs: number; endMs: number } | null
  onSelect: (req: UrlRequestSummary) => void
}

export function UrlWaterfall({ requests, timeBrush, onSelect }: Props) {
  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (timeBrush) {
        return sessionOverlapsRange(r.startTimeMs, r.endTimeMs, timeBrush.startMs, timeBrush.endMs)
      }
      return true
    })
  }, [requests, timeBrush])

  const rows = useMemo(() => buildUrlWaterfallFromSummaries(filtered).slice(0, 40), [filtered])

  if (requests.length === 0) return null

  const globalStart = rows.length ? Math.min(...rows.map((r) => r.rangeStartMs)) : 0
  const globalEnd = rows.length ? Math.max(...rows.map((r) => r.rangeEndMs)) : 1
  const span = Math.max(globalEnd - globalStart, 1)

  return (
    <section className="panel url-waterfall-panel">
      <div className="panel-head">
        <div>
          <h2>Request waterfall</h2>
          <p className="muted small">
            Phases inferred from URL_REQUEST events (DNS → connect → TLS → request → response).
          </p>
        </div>
      </div>

      <div className="url-waterfall-scroll">
        {rows.length === 0 ? (
          <p className="muted">No requests in the brushed range.</p>
        ) : (
          rows.map((row) => (
            <button
              key={row.request.sourceId}
              type="button"
              className={`url-waterfall-row${row.request.netError ? ' url-waterfall-row--err' : ''}`}
              onClick={() => onSelect(row.request)}
              title={row.request.url}
            >
              <span className="url-waterfall-label">
                <span className="url-waterfall-method">{row.request.method ?? '—'}</span>
                <span className="url-waterfall-url">{truncateUrl(row.request.url)}</span>
                {row.request.netError && (
                  <span className="err-tag url-waterfall-err">{row.request.netError}</span>
                )}
              </span>
              <span className="url-waterfall-track">
                {row.phases.map((phase, i) => {
                  const left = ((phase.startMs - globalStart) / span) * 100
                  const width = ((phase.endMs - phase.startMs) / span) * 100
                  return (
                    <span
                      key={i}
                      className="url-waterfall-seg"
                      style={{
                        left: `${left}%`,
                        width: `${Math.max(width, 0.4)}%`,
                        background: phase.color,
                      }}
                      title={`${phase.label}: ${Math.round(phase.endMs - phase.startMs)} ms`}
                    />
                  )
                })}
              </span>
              <span className="muted small url-waterfall-dur">{Math.round(row.totalMs)} ms</span>
            </button>
          ))
        )}
      </div>
    </section>
  )
}

function truncateUrl(url: string | undefined): string {
  if (!url) return '(unknown)'
  if (url.length <= 56) return url
  return `${url.slice(0, 24)}…${url.slice(-28)}`
}

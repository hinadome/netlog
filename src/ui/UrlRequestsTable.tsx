import { useMemo, useState } from 'react'
import type { UrlRequestSummary } from '../diagnosis/types'
import { sessionOverlapsRange } from '../model/sessionSwimlanes'

interface Props {
  requests: UrlRequestSummary[]
  timeBrush?: { startMs: number; endMs: number } | null
  onSelect: (req: UrlRequestSummary) => void
}

export function UrlRequestsTable({ requests, timeBrush, onSelect }: Props) {
  const [failedOnly, setFailedOnly] = useState(true)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return requests
      .filter((r) => {
        if (failedOnly && !r.netError) return false
        if (timeBrush) {
          if (!sessionOverlapsRange(r.startTimeMs, r.endTimeMs, timeBrush.startMs, timeBrush.endMs)) {
            return false
          }
        }
        if (q) {
          const hay = `${r.url ?? ''} ${r.method ?? ''} ${r.netError ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        if (Boolean(a.netError) !== Boolean(b.netError)) return a.netError ? -1 : 1
        return a.startTimeMs - b.startTimeMs
      })
      .slice(0, 80)
  }, [requests, failedOnly, query, timeBrush])

  if (requests.length === 0) {
    return null
  }

  return (
    <section className="panel url-requests-panel">
      <div className="panel-head">
        <div>
          <h2>URL requests</h2>
          <p className="muted small url-requests-lead">
            Chromium URL_REQUEST sources. Failed rows link to correlated H2/H3 sessions when known.
          </p>
        </div>
      </div>

      <div className="toolbar url-requests-toolbar">
        <input
          type="search"
          placeholder="Filter URL or error…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={failedOnly}
            onChange={(e) => setFailedOnly(e.target.checked)}
          />
          Failed only
        </label>
        {timeBrush && (
          <span className="muted small">Time brush active</span>
        )}
        <span className="muted small">{filtered.length} shown</span>
      </div>

      <div className="table-wrap url-requests-wrap">
        <table className="url-requests-table">
          <thead>
            <tr>
              <th>Method</th>
              <th>URL</th>
              <th>Error</th>
              <th>Session</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No requests match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr
                  key={r.sourceId}
                  className={r.netError ? 'row-error' : undefined}
                  onClick={() => onSelect(r)}
                  title={r.url ?? `URL_REQUEST ${r.sourceId}`}
                >
                  <td className="method-cell">{r.method ?? '—'}</td>
                  <td className="url-cell">{formatUrl(r.url)}</td>
                  <td className="err-cell" title={r.netError}>
                    {r.netError ?? '—'}
                  </td>
                  <td className="num-cell">
                    {r.relatedSessionIds.length ? r.relatedSessionIds.join(', ') : '—'}
                  </td>
                  <td className="num-cell">{formatDuration(r.endTimeMs - r.startTimeMs)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function formatUrl(url: string | undefined): string {
  if (!url) return '—'
  try {
    const u = new URL(url)
    const path = `${u.pathname}${u.search}`
    return path.length > 56 ? `${path.slice(0, 53)}…` : path
  } catch {
    return url.length > 56 ? `${url.slice(0, 53)}…` : url
  }
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

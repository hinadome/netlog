import { useMemo } from 'react'
import type { UrlRequestSummary } from '../diagnosis/types'
import { buildUrlRetryChains } from '../model/urlRetryChains'
import { sessionOverlapsRange } from '../model/sessionSwimlanes'

interface Props {
  requests: UrlRequestSummary[]
  timeBrush?: { startMs: number; endMs: number } | null
  onSelect: (req: UrlRequestSummary) => void
}

export function UrlRetryChains({ requests, timeBrush, onSelect }: Props) {
  const scopedRequests = useMemo(() => {
    if (!timeBrush) return requests
    return requests.filter((r) =>
      sessionOverlapsRange(r.startTimeMs, r.endTimeMs, timeBrush.startMs, timeBrush.endMs),
    )
  }, [requests, timeBrush])

  const chains = useMemo(() => buildUrlRetryChains(scopedRequests).slice(0, 30), [scopedRequests])

  const emptyMessage = timeBrush
    ? 'No retry chains overlap the brushed time range.'
    : 'No URLs with more than one request attempt in this capture.'

  return (
    <section className="panel url-retry-panel">
      <div className="panel-head">
        <div>
          <h2>Retry chains</h2>
          <p className="muted small url-retry-lead">
            Multiple URL_REQUEST attempts for the same origin + path.
          </p>
        </div>
        <div className="url-retry-head-actions">
          {timeBrush && <span className="muted small">Time brush active</span>}
          {chains.length > 0 && (
            <span className="muted small">
              {chains.length} chain{chains.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>

      {chains.length === 0 ? (
        <p className="muted url-retry-empty">{emptyMessage}</p>
      ) : (
        <ul className="url-retry-list">
          {chains.map((chain) => (
            <li key={chain.key} className="url-retry-chain">
              <div className="url-retry-head">
                <span className="url-retry-url" title={chain.displayUrl}>
                  {chain.displayUrl}
                </span>
                <span className="url-retry-meta muted small">
                  {chain.attempts.length} attempts
                  {chain.hadFailure && chain.eventualSuccess ? ' · recovered' : ''}
                  {chain.hadFailure && !chain.eventualSuccess ? ' · all failed' : ''}
                </span>
              </div>
              <ol className="url-retry-attempts">
                {chain.attempts.map((a) => (
                  <li key={a.sourceId} className="url-retry-attempt">
                    <button type="button" className="url-retry-btn" onClick={() => onSelect(a)}>
                      <span className="url-retry-btn-id">#{a.sourceId}</span>
                      <span className="url-retry-btn-time muted small">
                        +{Math.round(a.startTimeMs)} ms
                      </span>
                      {a.netError ? (
                        <span className="err-tag url-retry-btn-status">{a.netError}</span>
                      ) : (
                        <span className="ok-tag url-retry-btn-status">ok</span>
                      )}
                    </button>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

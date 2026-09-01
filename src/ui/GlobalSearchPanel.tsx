import { useMemo, useState } from 'react'
import type { TransferAnalysis } from '../diagnosis/runDiagnosis'
import type { Finding } from '../diagnosis/types'
import { searchAnalysis, type GlobalSearchHit } from '../model/globalSearch'

interface Props {
  analysis: TransferAnalysis
  query?: string
  onQueryChange?: (q: string) => void
  onOpenSession: (sessionId: number, eventIndex?: number) => void
  onOpenFinding: (f: Finding) => void
}

export function GlobalSearchPanel({
  analysis,
  query: queryProp,
  onQueryChange,
  onOpenSession,
  onOpenFinding,
}: Props) {
  const [localQuery, setLocalQuery] = useState(queryProp ?? '')
  const query = queryProp ?? localQuery
  const setQuery = (q: string) => {
    setLocalQuery(q)
    onQueryChange?.(q)
  }

  const hits = useMemo(() => searchAnalysis(analysis, query), [analysis, query])

  const grouped = useMemo(() => {
    const map = new Map<GlobalSearchHit['kind'], GlobalSearchHit[]>()
    for (const h of hits) {
      const list = map.get(h.kind) ?? []
      list.push(h)
      map.set(h.kind, list)
    }
    return map
  }, [hits])

  return (
    <section className="panel global-search-panel">
      <div className="panel-head">
        <div>
          <h2>Search capture</h2>
          <p className="muted small">
            Findings, sessions, URL requests, and events across the whole netlog. Event hits capped
            at 200.
          </p>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="search"
          className="global-search-input"
          placeholder="Search host, URL, event type, finding, params…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <span className="muted small" aria-live="polite">
          {query.trim() ? `${hits.length} result${hits.length === 1 ? '' : 's'}` : 'Type to search'}
        </span>
      </div>

      {!query.trim() ? (
        <p className="muted global-search-hint">
          Tip: search for <code>INVALID_HEADER</code>, <code>ERR_HTTP2</code>, a host name, or a
          path fragment.
        </p>
      ) : hits.length === 0 ? (
        <p className="muted">No matches.</p>
      ) : (
        <div className="global-search-results">
          {(['finding', 'session', 'url', 'event'] as const).map((kind) => {
            const list = grouped.get(kind)
            if (!list?.length) return null
            return (
              <div key={kind} className="global-search-group">
                <h3 className="global-search-group-title">{kindLabel(kind)}</h3>
                <ul className="global-search-list">
                  {list.map((hit, i) => (
                    <li key={`${kind}-${i}`}>
                      <button
                        type="button"
                        className="global-search-hit"
                        onClick={() => handleHit(hit, analysis, onOpenSession, onOpenFinding)}
                      >
                        <span className="global-search-hit-label">{hit.label}</span>
                        <span className="muted small global-search-hit-snippet">{hit.snippet}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function kindLabel(kind: GlobalSearchHit['kind']): string {
  if (kind === 'finding') return 'Findings'
  if (kind === 'session') return 'Sessions'
  if (kind === 'url') return 'URL requests'
  return 'Events'
}

function handleHit(
  hit: GlobalSearchHit,
  analysis: TransferAnalysis,
  onOpenSession: (sessionId: number, eventIndex?: number) => void,
  onOpenFinding: (f: Finding) => void,
) {
  if (hit.kind === 'finding' && hit.findingId) {
    const f = analysis.findings.find((x) => x.id === hit.findingId)
    if (f) {
      onOpenFinding(f)
      return
    }
  }
  if (hit.sessionId !== undefined) {
    onOpenSession(hit.sessionId, hit.eventIndex)
  }
}

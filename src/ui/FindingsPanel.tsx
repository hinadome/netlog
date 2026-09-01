import { useMemo, useState } from 'react'
import type { Finding, FindingSeverity } from '../diagnosis/types'
import { uniqueRuleIds } from '../model/globalSearch'

interface Props {
  findings: Finding[]
  compact?: boolean
  selectedId?: string
  onSelect?: (f: Finding) => void
}

export function FindingsPanel({ findings, compact, selectedId, onSelect }: Props) {
  const [severity, setSeverity] = useState<FindingSeverity | 'all'>('all')
  const [ruleId, setRuleId] = useState<string>('all')
  const [hostQuery, setHostQuery] = useState('')

  const rules = useMemo(() => uniqueRuleIds(findings), [findings])

  const filtered = useMemo(() => {
    const q = hostQuery.trim().toLowerCase()
    return findings.filter((f) => {
      if (severity !== 'all' && f.severity !== severity) return false
      if (ruleId !== 'all' && f.ruleId !== ruleId) return false
      if (q && !(f.host ?? '').toLowerCase().includes(q) && !(f.url ?? '').toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [findings, severity, ruleId, hostQuery])

  if (findings.length === 0) {
    return <p className="muted">No findings.</p>
  }

  return (
    <div className="findings-panel-wrap">
      {!compact && (
        <div className="toolbar findings-filters">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as FindingSeverity | 'all')}
          >
            <option value="all">All severities</option>
            <option value="critical">Critical</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
          <select value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
            <option value="all">All rules</option>
            {rules.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Filter host or URL…"
            value={hostQuery}
            onChange={(e) => setHostQuery(e.target.value)}
          />
          <span className="muted small">
            Showing {filtered.length} of {findings.length}
          </span>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="muted">No findings match filters.</p>
      ) : (
        <ul className={`finding-list${compact ? ' finding-list--compact' : ''}`}>
          {filtered.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className={`finding-row severity-${f.severity}${selectedId === f.id ? ' selected' : ''}`}
                onClick={() => onSelect?.(f)}
              >
                <span className="sev">{f.severity}</span>
                <div>
                  <div className="finding-title">{f.title}</div>
                  {!compact && (
                    <>
                      <p className="finding-body">{f.explanation}</p>
                      <p className="finding-suggest">
                        <strong>Next:</strong> {f.suggestion}
                      </p>
                    </>
                  )}
                  <div className="muted small">
                    <code>{f.ruleId}</code>
                    {' · '}
                    {f.host ?? '—'}
                    {f.sessionId !== undefined ? ` · session ${f.sessionId}` : ''}
                    {f.streamId !== undefined ? ` · stream ${f.streamId}` : ''}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

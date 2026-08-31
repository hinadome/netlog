import type { Finding } from '../diagnosis/types'

interface Props {
  findings: Finding[]
  compact?: boolean
  selectedId?: string
  onSelect?: (f: Finding) => void
}

export function FindingsPanel({ findings, compact, selectedId, onSelect }: Props) {
  if (findings.length === 0) {
    return <p className="muted">No findings.</p>
  }

  return (
    <ul className={`finding-list${compact ? ' finding-list--compact' : ''}`}>
      {findings.map((f) => (
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
                {f.host ?? '—'}
                {f.sessionId !== undefined ? ` · session ${f.sessionId}` : ''}
                {f.streamId !== undefined ? ` · stream ${f.streamId}` : ''}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

import type { TransferAnalysis } from '../diagnosis/runDiagnosis'
import type { Finding } from '../diagnosis/types'

interface Props {
  analysis: TransferAnalysis
  onOpenFindings: () => void
  onOpenSessions: () => void
}

export function Overview({ analysis, onOpenFindings, onOpenSessions }: Props) {
  const h2 = analysis.sessionSummaries.filter((s) => s.protocol === 'h2').length
  const h3 = analysis.sessionSummaries.filter((s) => s.protocol === 'h3').length
  const errored = analysis.sessionSummaries.filter((s) => s.hasError).length
  const top = analysis.findings.slice(0, 5)

  return (
    <div className="overview">
      <div className="stat-grid">
        <Stat label="Events" value={analysis.eventCount.toLocaleString()} />
        <Stat label="HTTP/2 sessions" value={String(h2)} onClick={onOpenSessions} />
        <Stat label="QUIC / HTTP/3" value={String(h3)} onClick={onOpenSessions} />
        <Stat label="URL requests" value={String(analysis.urlRequestCount)} />
        <Stat label="Failed requests" value={String(analysis.failedUrlRequestCount)} />
        <Stat
          label="Findings"
          value={String(analysis.findings.length)}
          emphasize={analysis.findings.length > 0}
          onClick={onOpenFindings}
        />
        <Stat label="Sessions w/ errors" value={String(errored)} emphasize={errored > 0} />
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>Top findings</h2>
          <button type="button" className="linkish" onClick={onOpenFindings}>
            View all
          </button>
        </div>
        {top.length === 0 ? (
          <p className="muted">No automated findings. Browse sessions for details.</p>
        ) : (
          <ul className="finding-list">
            {top.map((f) => (
              <FindingRow key={f.id} finding={f} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Stat({
  label,
  value,
  emphasize,
  onClick,
}: {
  label: string
  value: string
  emphasize?: boolean
  onClick?: () => void
}) {
  const className = `stat${emphasize ? ' stat--alert' : ''}${onClick ? ' stat--click' : ''}`
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
      </button>
    )
  }
  return (
    <div className={className}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

function FindingRow({ finding }: { finding: Finding }) {
  return (
    <li className={`finding-row severity-${finding.severity}`}>
      <span className="sev">{finding.severity}</span>
      <div>
        <div className="finding-title">{finding.title}</div>
        <div className="muted small">
          {finding.host ?? '—'}
          {finding.protocol ? ` · ${finding.protocol}` : ''}
        </div>
      </div>
    </li>
  )
}

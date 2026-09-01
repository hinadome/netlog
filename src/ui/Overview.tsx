import type { TransferAnalysis } from '../diagnosis/runDiagnosis'
import type { Finding, TimeBrushRange, UrlRequestSummary } from '../diagnosis/types'
import { LARGE_CAPTURE_EVENT_THRESHOLD } from '../model/appUrlState'
import { countSessionsWithActionableIssues } from '../model/sessionIssues'

import { SessionSwimlanes } from './SessionSwimlanes'
import { UrlRequestsTable } from './UrlRequestsTable'
import { UrlRetryChains } from './UrlRetryChains'
import { UrlWaterfall } from './UrlWaterfall'

interface Props {
  analysis: TransferAnalysis
  timeBrush: TimeBrushRange | null
  onTimeBrushChange: (range: TimeBrushRange | null) => void
  onOpenFindings: () => void
  onSelectFinding: (f: Finding) => void
  onOpenSessions: (timeBrush?: TimeBrushRange | null) => void
  onSelectSession: (sessionId: number, eventIndex?: number) => void
  onSelectUrlRequest: (req: UrlRequestSummary) => void
}

export function Overview({
  analysis,
  timeBrush,
  onTimeBrushChange,
  onOpenFindings,
  onSelectFinding,
  onOpenSessions,
  onSelectSession,
  onSelectUrlRequest,
}: Props) {
  const h2 = analysis.sessionSummaries.filter((s) => s.protocol === 'h2').length
  const h3 = analysis.sessionSummaries.filter((s) => s.protocol === 'h3').length
  const errored = countSessionsWithActionableIssues(
    analysis.sessionSummaries,
    analysis.sessions,
    analysis.findings,
  )
  const top = analysis.findings.slice(0, 5)
  const isLarge = analysis.eventCount >= LARGE_CAPTURE_EVENT_THRESHOLD

  return (
    <div className="overview">
      {isLarge && (
        <div className="large-capture-banner" role="status">
          Large capture ({analysis.eventCount.toLocaleString()} events). Global search caps event
          hits at 200; prefer host/path filters and time brush to narrow investigation.
        </div>
      )}

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
        <Stat
          label="Sessions w/ errors"
          value={String(errored)}
          emphasize={errored > 0}
          title="Critical/error findings or non-benign protocol error events (excludes normal close and CANCEL)"
        />
      </div>

      <section className="panel overview-findings">
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
              <FindingRow key={f.id} finding={f} onSelect={() => onSelectFinding(f)} />
            ))}
          </ul>
        )}
      </section>

      <UrlRequestsTable
        requests={analysis.urlRequests}
        timeBrush={timeBrush}
        onSelect={onSelectUrlRequest}
      />

      <SessionSwimlanes
        summaries={analysis.sessionSummaries}
        sessions={analysis.sessions}
        findings={analysis.findings}
        timeBrush={timeBrush}
        onTimeBrushChange={onTimeBrushChange}
        onSelectSession={onSelectSession}
        onViewSessionsInBrush={() => onOpenSessions(timeBrush)}
      />

      <UrlWaterfall
        requests={analysis.urlRequests}
        timeBrush={timeBrush}
        onSelect={onSelectUrlRequest}
      />

      <UrlRetryChains
        requests={analysis.urlRequests}
        timeBrush={timeBrush}
        onSelect={onSelectUrlRequest}
      />
    </div>
  )
}

function Stat({
  label,
  value,
  emphasize,
  onClick,
  title,
}: {
  label: string
  value: string
  emphasize?: boolean
  onClick?: () => void
  title?: string
}) {
  const className = `stat${emphasize ? ' stat--alert' : ''}${onClick ? ' stat--click' : ''}`
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} title={title}>
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
      </button>
    )
  }
  return (
    <div className={className} title={title}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

function FindingRow({ finding, onSelect }: { finding: Finding; onSelect?: () => void }) {
  return (
    <li>
      <button type="button" className={`finding-row severity-${finding.severity}`} onClick={onSelect}>
        <span className="sev">{finding.severity}</span>
        <div>
          <div className="finding-title">{finding.title}</div>
          <div className="muted small">
            {finding.host ?? '—'}
            {finding.protocol ? ` · ${finding.protocol}` : ''}
          </div>
        </div>
      </button>
    </li>
  )
}

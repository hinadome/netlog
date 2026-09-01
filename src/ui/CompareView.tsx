import type { TransferAnalysis } from '../diagnosis/runDiagnosis'
import { compareAnalyses } from '../model/compareAnalysis'

interface Props {
  analysisA: TransferAnalysis
  analysisB: TransferAnalysis
}

export function CompareView({ analysisA, analysisB }: Props) {
  const diff = compareAnalyses(analysisA, analysisB)

  return (
    <section className="panel compare-panel">
      <div className="panel-head">
        <div>
          <h2>Compare captures</h2>
          <p className="muted small">
            <strong>A:</strong> {diff.labelA} · <strong>B:</strong> {diff.labelB}
          </p>
        </div>
      </div>

      <div className="compare-stats stat-grid">
        <CompareStat label="Events" a={diff.eventsA} b={diff.eventsB} />
        <CompareStat label="Sessions" a={diff.sessionsA} b={diff.sessionsB} />
        <CompareStat label="Findings" a={diff.findingsA} b={diff.findingsB} />
        <CompareStat label="Failed URLs" a={diff.failedUrlsA} b={diff.failedUrlsB} />
      </div>

      {(diff.hostsOnlyInA.length > 0 || diff.hostsOnlyInB.length > 0) && (
        <div className="compare-hosts">
          <h3>Hosts only in one capture</h3>
          <div className="compare-hosts-grid">
            <div>
              <h4 className="small">Only in A</h4>
              <ul>
                {diff.hostsOnlyInA.length ? (
                  diff.hostsOnlyInA.map((h) => <li key={h}>{h}</li>)
                ) : (
                  <li className="muted">—</li>
                )}
              </ul>
            </div>
            <div>
              <h4 className="small">Only in B</h4>
              <ul>
                {diff.hostsOnlyInB.length ? (
                  diff.hostsOnlyInB.map((h) => <li key={h}>{h}</li>)
                ) : (
                  <li className="muted">—</li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {diff.findingsDelta.length > 0 && (
        <div className="compare-section">
          <h3>Finding count changes</h3>
          <table>
            <thead>
              <tr>
                <th>Rule</th>
                <th>A</th>
                <th>B</th>
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>
              {diff.findingsDelta.map((row) => (
                <tr key={row.ruleId}>
                  <td>
                    <code>{row.ruleId}</code>
                  </td>
                  <td>{row.countA}</td>
                  <td>{row.countB}</td>
                  <td className={row.countB > row.countA ? 'compare-worse' : 'compare-better'}>
                    {row.countB - row.countA > 0 ? '+' : ''}
                    {row.countB - row.countA}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {diff.failedUrlDelta.length > 0 && (
        <div className="compare-section">
          <h3>Failed URL diff</h3>
          <ul className="compare-failed-urls">
            {diff.failedUrlDelta.slice(0, 40).map((row) => (
              <li key={row.url}>
                <code>{row.url}</code>
                <span className="muted small">
                  {row.inA && row.inB ? ' failed in both' : row.inA ? ' only A' : ' only B'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function CompareStat({ label, a, b }: { label: string; a: number; b: number }) {
  return (
    <div className="stat compare-stat">
      <span className="stat-value">
        {a} → {b}
      </span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

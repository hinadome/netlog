import type { TransferSession } from '../diagnosis/runDiagnosis'
import { buildProtocolDiff, settingsDiffKeys } from '../model/protocolDiff'

interface Props {
  session: TransferSession
  onJumpToEvent?: (eventIndex: number) => void
}

export function ProtocolDiffPanel({ session, onJumpToEvent }: Props) {
  const diff = buildProtocolDiff(session)
  const settingRows = settingsDiffKeys(diff.settingsSent, diff.settingsReceived)
  const hasSettings =
    Object.keys(diff.settingsSent).length > 0 || Object.keys(diff.settingsReceived).length > 0

  if (!hasSettings && diff.goaways.length === 0 && !diff.negotiatedProtocol) {
    return null
  }

  return (
    <section className="panel protocol-diff-panel">
      <h3>SETTINGS &amp; GOAWAY</h3>

      {diff.negotiatedProtocol && (
        <p className="muted small">
          Negotiated: <code>{diff.negotiatedProtocol}</code>
        </p>
      )}

      {hasSettings && (
        <div className="protocol-diff-grid">
          <div>
            <h4 className="small">Sent</h4>
            <SettingsTable data={diff.settingsSent} />
          </div>
          <div>
            <h4 className="small">Received</h4>
            <SettingsTable data={diff.settingsReceived} />
          </div>
        </div>
      )}

      {settingRows.length > 0 && (
        <div className="protocol-diff-mismatch">
          <h4 className="small">Mismatched SETTINGS</h4>
          <table className="protocol-diff-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Sent</th>
                <th>Recv</th>
              </tr>
            </thead>
            <tbody>
              {settingRows.map((row) => (
                <tr key={row.key}>
                  <td>
                    <code>{row.key}</code>
                  </td>
                  <td>{row.sent ?? '—'}</td>
                  <td>{row.received ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {diff.goaways.length > 0 && (
        <div className="protocol-diff-goaway">
          <h4 className="small">GOAWAY</h4>
          <ul>
            {diff.goaways.map((g) => (
              <li key={g.eventIndex}>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => onJumpToEvent?.(g.eventIndex)}
                >
                  {g.direction} · {g.errorCode}
                  {g.lastStreamId !== undefined ? ` · last stream ${g.lastStreamId}` : ''}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function SettingsTable({ data }: { data: Record<string, number | string> }) {
  const keys = Object.keys(data).sort()
  if (keys.length === 0) return <p className="muted small">—</p>
  return (
    <dl className="inspector-fields protocol-settings-dl">
      {keys.map((k) => (
        <div key={k}>
          <dt>
            <code>{k}</code>
          </dt>
          <dd>{String(data[k])}</dd>
        </div>
      ))}
    </dl>
  )
}

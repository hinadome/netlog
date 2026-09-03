import type { PolledH2Session } from '../model/polledData'

import type { SessionOrigin } from '../model/sessionOrigin'

interface Props {
  snapshot: PolledH2Session
  origin: SessionOrigin
}

export function PolledSessionPanel({ snapshot, origin }: Props) {
  const rows: { label: string; value: string }[] = [
    { label: 'Source id', value: String(snapshot.sourceId) },
    { label: 'Host', value: snapshot.hostPortPair },
    snapshot.proxy ? { label: 'Proxy', value: snapshot.proxy } : null,
    snapshot.negotiatedProtocol
      ? { label: 'Negotiated protocol', value: snapshot.negotiatedProtocol }
      : null,
    snapshot.activeStreams != null
      ? { label: 'Active streams (at export)', value: String(snapshot.activeStreams) }
      : null,
    snapshot.sendWindowSize != null
      ? { label: 'Send window', value: String(snapshot.sendWindowSize) }
      : null,
    snapshot.recvWindowSize != null
      ? { label: 'Recv window', value: String(snapshot.recvWindowSize) }
      : null,
    snapshot.unackedRecvWindowBytes != null
      ? { label: 'Unacked recv window', value: String(snapshot.unackedRecvWindowBytes) }
      : null,
    snapshot.framesReceived != null
      ? { label: 'Frames received', value: String(snapshot.framesReceived) }
      : null,
    snapshot.availabilityState
      ? { label: 'Availability', value: snapshot.availabilityState }
      : null,
    snapshot.error ? { label: 'Error (snapshot)', value: snapshot.error } : null,
  ].filter((r): r is { label: string; value: string } => r != null)

  return (
    <section className="panel polled-session-panel">
      <div className="panel-head">
        <h3>At export (polledData)</h3>
        <span className="muted small">Chrome snapshot when net-export stopped</span>
      </div>
      {origin === 'polledOnly' && (
        <p className="polled-only-note muted small">
          No event stream for this session — only the end-of-capture snapshot exists in{' '}
          <code>polledData.spdySessionInfo</code>. Timeline and findings require events.
        </p>
      )}
      <table className="polled-session-table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

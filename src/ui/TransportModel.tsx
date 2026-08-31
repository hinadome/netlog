import type { TransferSession } from '../diagnosis/runDiagnosis'
import type { SessionStream } from '../model/http2Session'

interface Props {
  session: TransferSession
  onOpenGuide?: () => void
}

/** Visual teaching aid: H2 shared TCP fate vs H3 per-stream independence. */
export function TransportModel({ session, onOpenGuide }: Props) {
  const isH3 = session.protocol === 'h3'
  const lanes = pickLanes(session.streams)
  const fate = analyzeSharedFate(session)

  return (
    <section className={`panel transport-model transport-model--${session.protocol}`}>
      <div className="panel-head">
        <h3>Transport model</h3>
        {onOpenGuide && (
          <button type="button" className="linkish" onClick={onOpenGuide}>
            Why this matters
          </button>
        )}
      </div>

      <p className="transport-lead">
        {isH3 ? (
          <>
            <strong>HTTP/3 / QUIC:</strong> streams are independent on one connection. Loss or a reset
            on one stream does not stall the others.
          </>
        ) : (
          <>
            <strong>HTTP/2:</strong> many streams share <em>one</em> TCP + TLS pipe. Packet loss or a
            socket stall can delay <em>every</em> stream (head-of-line blocking).
          </>
        )}
      </p>

      <div className="transport-viz" aria-hidden="true">
        {isH3 ? <H3Diagram lanes={lanes} /> : <H2Diagram lanes={lanes} />}
      </div>

      {fate && (
        <p className={`transport-fate transport-fate--${fate.severity}`} role="status">
          {fate.message}
        </p>
      )}
    </section>
  )
}

function pickLanes(streams: SessionStream[]): Array<{ id: number; errored: boolean; label: string }> {
  const sorted = [...streams].sort((a, b) => a.streamId - b.streamId)
  const pick = sorted.slice(0, 4)
  if (pick.length === 0) {
    return [
      { id: 1, errored: false, label: 'stream' },
      { id: 3, errored: false, label: 'stream' },
      { id: 5, errored: false, label: 'stream' },
    ]
  }
  return pick.map((s) => ({
    id: s.streamId,
    errored: s.hasError,
    label: s.path ? `${s.method ?? ''} ${s.path}`.trim() : `stream ${s.streamId}`,
  }))
}

function analyzeSharedFate(session: TransferSession): { severity: 'info' | 'warning' | 'error'; message: string } | null {
  const streamErrors = session.streams.filter((s) => s.hasError).length
  const total = session.streams.length

  if (session.protocol === 'h2') {
    const connClose = session.events.some(
      (e) =>
        e.type === 'HTTP2_SESSION_CLOSE' ||
        (e.type.includes('SOCKET') && String(e.params.net_error ?? '').length > 0),
    )
    const goaway = session.events.some((e) => e.type.includes('GOAWAY'))
    if (session.hasError && (connClose || goaway || session.error)) {
      return {
        severity: 'error',
        message: `This H2 session reported a connection-level problem${session.error ? ` (${session.error})` : ''}. Because all streams share one TCP connection, every in-flight stream can be affected together.`,
      }
    }
    if (streamErrors >= 2) {
      return {
        severity: 'warning',
        message: `${streamErrors} streams on this H2 session show errors. Check whether a shared socket/TLS issue (not just one bad response) explains the cluster.`,
      }
    }
    return {
      severity: 'info',
      message: `Illustration: ${Math.max(total, 3)} logical streams → one TCP+TLS pipe to ${session.host || 'the peer'}.`,
    }
  }

  // h3
  const connClose = Boolean(session.connectionClose) ||
    session.events.some((e) => e.type.includes('CONNECTION_CLOSE') || e.type === 'QUIC_SESSION_CLOSED')
  if (connClose && session.hasError) {
    return {
      severity: 'error',
      message: `QUIC connection closed${session.connectionClose?.errorCode ? ` (${session.connectionClose.errorCode})` : ''}. That ends the whole connection — different from a single-stream reset, which would leave other streams free to continue.`,
    }
  }
  if (streamErrors === 1 && total > 1) {
    return {
      severity: 'info',
      message: `One stream shows an error while ${total - 1} other(s) do not — consistent with H3’s per-stream isolation (unlike H2 TCP head-of-line blocking).`,
    }
  }
  if (streamErrors > 1) {
    return {
      severity: 'warning',
      message: `${streamErrors} streams errored. On H3 that can still be independent failures; check whether a CONNECTION_CLOSE also appears (shared connection fate).`,
    }
  }
  return {
    severity: 'info',
    message: `Illustration: streams on this QUIC connection recover loss independently — a gap on one lane need not freeze the others.`,
  }
}

function H2Diagram({
  lanes,
}: {
  lanes: Array<{ id: number; errored: boolean; label: string }>
}) {
  return (
    <div className="tm-h2">
      <div className="tm-label">Browser</div>
      <div className="tm-pipe">
        <div className="tm-pipe-tag">One TCP + TLS connection</div>
        <div className="tm-pipe-body">
          {lanes.map((l) => (
            <div
              key={l.id}
              className={`tm-lane${l.errored ? ' tm-lane--err' : ''}`}
              title={l.label}
            >
              <span className="tm-lane-id">{l.id}</span>
              <span className="tm-lane-bar" />
            </div>
          ))}
          <div className="tm-hol">
            <span className="tm-hol-x">✕ loss / stall</span>
            <span className="tm-hol-note">blocks the pipe → all streams wait</span>
          </div>
        </div>
      </div>
      <div className="tm-label">Server</div>
    </div>
  )
}

function H3Diagram({
  lanes,
}: {
  lanes: Array<{ id: number; errored: boolean; label: string }>
}) {
  return (
    <div className="tm-h3">
      <div className="tm-label">Browser</div>
      <div className="tm-quic">
        <div className="tm-pipe-tag">One QUIC connection · independent streams</div>
        <div className="tm-h3-lanes">
          {lanes.map((l, i) => (
            <div
              key={l.id}
              className={`tm-h3-lane${l.errored ? ' tm-h3-lane--err' : ''}`}
              title={l.label}
            >
              <span className="tm-lane-id">{l.id}</span>
              <span className="tm-h3-track" />
              {i === 0 && l.errored ? (
                <span className="tm-h3-loss">loss → this stream only</span>
              ) : i === 0 ? (
                <span className="tm-h3-loss tm-h3-loss--demo">loss → this stream only</span>
              ) : (
                <span className="tm-h3-ok">continues</span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="tm-label">Server</div>
    </div>
  )
}

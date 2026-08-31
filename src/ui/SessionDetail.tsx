import { useEffect, useMemo, useState } from 'react'
import type { TransferSession } from '../diagnosis/runDiagnosis'
import type { Finding } from '../diagnosis/types'
import { classifyStreamId, countStreamKinds } from '../model/streamKind'
import type { NetlogEvent } from '../parser/types'
import { EventInspector } from './EventInspector'
import { FindingsPanel } from './FindingsPanel'
import { Timeline } from './Timeline'
import { TransportModel } from './TransportModel'

interface Props {
  session: TransferSession
  findings: Finding[]
  focusEventIndex?: number
  onFocusFinding: (f: Finding) => void
  onOpenStreamGuide?: (
    anchor: 'guide-http2-streams' | 'guide-http3-streams' | 'guide-transport-model',
  ) => void
}

export function SessionDetail({
  session,
  findings,
  focusEventIndex,
  onFocusFinding,
  onOpenStreamGuide,
}: Props) {
  const [selected, setSelected] = useState<NetlogEvent | undefined>()
  const [streamFilter, setStreamFilter] = useState<number | 'all'>('all')

  const highlightIndexes = useMemo(() => {
    const set = new Set<number>()
    for (const f of findings) {
      for (const i of f.evidenceEventIndexes) set.add(i)
    }
    return set
  }, [findings])

  const availableStreams = useMemo(
    () => session.streams.map((s) => s.streamId).sort((a, b) => a - b),
    [session.streams],
  )

  const kindCounts = useMemo(
    () => countStreamKinds(session.protocol, availableStreams),
    [session.protocol, availableStreams],
  )

  const activeIndex = selected?.index ?? focusEventIndex
  const isH3 = session.protocol === 'h3'
  const guideAnchor = isH3 ? 'guide-http3-streams' : 'guide-http2-streams'

  useEffect(() => {
    setStreamFilter('all')
    setSelected(undefined)
  }, [session.id])

  useEffect(() => {
    if (focusEventIndex === undefined) return
    const ev = session.events.find((e) => e.index === focusEventIndex)
    if (ev) setSelected(ev)
  }, [focusEventIndex, session.events])

  return (
    <div className="session-detail">
      <header className="session-head">
        <div>
          <span className={`badge badge-${session.protocol}`}>{session.protocol}</span>
          <h2 className="session-title" title={`Session ${session.id} — ${session.host}`}>
            Session {session.id} — <span className="session-host">{session.host}</span>
          </h2>
          <p className="muted small session-meta">
            <code>source.id</code> · stream = <code>params.stream_id</code>
            {session.quicVersion ? ` · ${session.quicVersion}` : ''}
            {session.proxy && session.proxy !== 'none' ? ` · proxy ${session.proxy}` : ''}
            {session.error ? ` · ${session.error}` : ''}
          </p>
          <div
            className="stream-kind-chips"
            aria-label={`${session.protocol.toUpperCase()} stream kind counts`}
          >
            <span
              className="kind-chip kind-chip--local"
              title={
                isH3
                  ? 'Client-initiated bidirectional (requests)'
                  : 'Client-initiated odd stream IDs (requests)'
              }
            >
              Requests {kindCounts.requests}
            </span>
            {isH3 ? (
              <>
                <span className="kind-chip kind-chip--local" title="Client-initiated unidirectional">
                  Local uni {kindCounts.localUni}
                </span>
                <span className="kind-chip kind-chip--peer" title="Server-initiated unidirectional">
                  Peer uni {kindCounts.peerUni}
                </span>
                {kindCounts.peerBidi > 0 && (
                  <span className="kind-chip kind-chip--peer" title="Server-initiated bidirectional">
                    Peer bidi {kindCounts.peerBidi}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="kind-chip kind-chip--local" title="Client-initiated (odd) streams">
                  Local {kindCounts.local}
                </span>
                {kindCounts.peer > 0 && (
                  <span
                    className="kind-chip kind-chip--peer"
                    title="Server-initiated (even) streams — often push"
                  >
                    Peer {kindCounts.peer}
                  </span>
                )}
                {kindCounts.connection > 0 && (
                  <span className="kind-chip kind-chip--conn" title="Stream 0 connection control">
                    Conn {kindCounts.connection}
                  </span>
                )}
              </>
            )}
            {onOpenStreamGuide ? (
              <button
                type="button"
                className="kind-chip kind-chip--link"
                onClick={() => onOpenStreamGuide(guideAnchor)}
              >
                {isH3 ? 'What is local/peer?' : 'What is H2 stream ID?'}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <TransportModel
        session={session}
        onOpenGuide={
          onOpenStreamGuide ? () => onOpenStreamGuide('guide-transport-model') : undefined
        }
      />

      <div className="session-grid">
        <section className="panel">
          <h3>Streams ({session.streams.length})</h3>
          {session.streams.length === 0 ? (
            <p className="muted">No stream-level frames parsed.</p>
          ) : (
            <div className="table-wrap streams-table-wrap">
              <table className="streams-table streams-table--kinds">
                <thead>
                  <tr>
                    <th className="col-id">ID</th>
                    <th className="col-kind">Kind</th>
                    <th className="col-request">Request</th>
                    <th className="col-status">Status</th>
                    <th className="col-bytes">Bytes</th>
                    <th className="col-rst">RST</th>
                  </tr>
                </thead>
                <tbody>
                  {session.streams.map((s) => {
                    const request = formatRequest(s.method, s.path)
                    const on = streamFilter === s.streamId
                    const kind = classifyStreamId(session.protocol, s.streamId, {
                      hasRequestHeaders: Boolean(s.method || s.path),
                    })
                    return (
                      <tr
                        key={s.streamId}
                        className={`${s.hasError ? 'row-error' : ''}${on ? ' selected' : ''}`}
                        onClick={() =>
                          setStreamFilter((prev) => (prev === s.streamId ? 'all' : s.streamId))
                        }
                        title="Filter timeline to this stream (click again for all)"
                      >
                        <td className="num-cell">{s.streamId}</td>
                        <td className="kind-cell">
                          <span
                            className={`stream-kind stream-kind--${kind.initiator}`}
                            title={kind.blurb}
                          >
                            {kind.label}
                          </span>
                        </td>
                        <td className="request-cell" title={request.full}>
                          <span className="request-method">{request.method}</span>
                          <span className="request-path">{request.path}</span>
                        </td>
                        <td className="num-cell">{s.status ?? '—'}</td>
                        <td className="bytes-cell">
                          ↑{s.bytesSent} ↓{s.bytesReceived}
                        </td>
                        <td className="rst-cell" title={s.rstError ?? undefined}>
                          {s.rstError ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel findings-side">
          <h3>Session findings</h3>
          <div className="findings-scroll">
            <FindingsPanel
              findings={findings}
              compact
              onSelect={(f) => {
                onFocusFinding(f)
                const idx = f.evidenceEventIndexes[0]
                if (idx !== undefined) {
                  const ev = session.events.find((e) => e.index === idx)
                  if (ev) {
                    setSelected(ev)
                    if (f.streamId !== undefined) setStreamFilter(f.streamId)
                  }
                }
              }}
            />
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h3>Event timeline</h3>
          {streamFilter !== 'all' && (
            <button type="button" className="linkish" onClick={() => setStreamFilter('all')}>
              Clear stream {streamFilter} filter
            </button>
          )}
        </div>
        <div className="timeline-layout">
          <Timeline
            events={session.events}
            findings={findings}
            protocol={session.protocol}
            highlightIndexes={highlightIndexes}
            selectedIndex={activeIndex}
            baseTimeMs={session.startTimeMs}
            onSelect={setSelected}
            streamFilter={streamFilter}
            onStreamFilterChange={setStreamFilter}
            availableStreams={availableStreams}
          />
          <EventInspector
            event={selected}
            events={session.events}
            protocol={session.protocol}
            baseTimeMs={session.startTimeMs}
            findings={findings}
            onJumpToEvent={(eventIndex) => {
              const ev = session.events.find((e) => e.index === eventIndex)
              if (ev) setSelected(ev)
            }}
            onOpenStreamGuide={
              onOpenStreamGuide ? () => onOpenStreamGuide(guideAnchor) : undefined
            }
          />
        </div>
      </section>
    </div>
  )
}

function formatRequest(
  method: string | undefined,
  path: string | undefined,
): { method: string; path: string; full: string } {
  const m = method ?? '—'
  const p = path ?? ''
  return {
    method: m,
    path: p || '—',
    full: p ? `${m} ${p}` : m,
  }
}

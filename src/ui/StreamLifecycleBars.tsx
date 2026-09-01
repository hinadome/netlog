import { useMemo } from 'react'
import type { TransferSession } from '../diagnosis/runDiagnosis'
import {
  buildStreamLifecycles,
  lifecycleSpan,
  phaseLabel,
  segmentStyle,
  type StreamLifecycle,
} from '../model/streamLifecycle'

interface Props {
  session: TransferSession
  streamFilter?: number | 'all'
  onSelectStream: (streamId: number, eventIndex?: number) => void
  maxRows?: number
}

export function StreamLifecycleBars({
  session,
  streamFilter,
  onSelectStream,
  maxRows = 16,
}: Props) {
  const lifecycles = useMemo(() => buildStreamLifecycles(session), [session])

  const visible = useMemo(() => {
    const list =
      streamFilter === 'all'
        ? lifecycles
        : lifecycles.filter((l) => l.streamId === streamFilter)
    return list.slice(0, maxRows)
  }, [lifecycles, streamFilter, maxRows])

  if (lifecycles.length === 0) {
    return null
  }

  const trackStart = session.startTimeMs
  const trackEnd = Math.max(
    session.endTimeMs,
    ...lifecycles.map((l) => l.endMs + trackStart),
    trackStart + 1,
  )
  const relEnd = trackEnd - trackStart

  return (
    <section className="panel lifecycle-panel">
      <div className="panel-head">
        <div>
          <h3>Stream lifecycle</h3>
          <p className="muted small lifecycle-lead">
            Request streams over session time — headers, data, FIN, RST. Click a row to filter the
            timeline.
          </p>
        </div>
        <div className="lifecycle-legend" aria-hidden="true">
          <LegendSwatch phase="headers" />
          <LegendSwatch phase="data" />
          <LegendSwatch phase="fin" />
          <LegendSwatch phase="rst" />
          <LegendSwatch phase="error" />
        </div>
      </div>

      <div className="lifecycle-list">
        {visible.map((lc) => (
          <LifecycleRow
            key={lc.streamId}
            lifecycle={lc}
            trackStartMs={0}
            trackEndMs={relEnd}
            selected={streamFilter === lc.streamId}
            onSelect={() =>
              onSelectStream(lc.streamId, lc.segments[lc.segments.length - 1]?.eventIndex)
            }
          />
        ))}
      </div>

      {lifecycles.length > visible.length && streamFilter === 'all' && (
        <p className="muted small lifecycle-trunc">
          Showing {visible.length} of {lifecycles.length} streams (errors first).
        </p>
      )}
    </section>
  )
}

function LifecycleRow({
  lifecycle,
  trackStartMs,
  trackEndMs,
  selected,
  onSelect,
}: {
  lifecycle: StreamLifecycle
  trackStartMs: number
  trackEndMs: number
  selected: boolean
  onSelect: () => void
}) {
  const span = lifecycleSpan(lifecycle)

  return (
    <button
      type="button"
      className={`lifecycle-row${lifecycle.hasError ? ' lifecycle-row--error' : ''}${selected ? ' lifecycle-row--sel' : ''}`}
      onClick={onSelect}
      title={`Stream ${lifecycle.streamId} · ${lifecycle.label}`}
    >
      <span className="lifecycle-meta">
        <span className="lifecycle-id">{lifecycle.streamId}</span>
        <span className="lifecycle-label" title={lifecycle.label}>
          {lifecycle.label}
        </span>
      </span>
      <span className="lifecycle-track">
        {lifecycle.segments.length === 0 ? (
          <span className="lifecycle-empty muted small">no frame events</span>
        ) : (
          lifecycle.segments.map((seg, i) => {
            const style = segmentStyle(seg, trackStartMs, trackEndMs)
            return (
              <span
                key={`${seg.phase}-${seg.eventIndex}-${i}`}
                className={`lifecycle-seg lifecycle-seg--${seg.phase}`}
                style={{ left: `${style.leftPct}%`, width: `${style.widthPct}%` }}
                title={`${phaseLabel(seg.phase)} · +${Math.round(seg.startMs)} ms`}
              />
            )
          })
        )}
      </span>
      <span className="lifecycle-duration muted small">
        {Math.round(span.endMs - span.startMs)} ms
      </span>
    </button>
  )
}

function LegendSwatch({ phase }: { phase: 'headers' | 'data' | 'fin' | 'rst' | 'error' }) {
  return (
    <span className="lifecycle-legend-item">
      <span className={`lifecycle-seg lifecycle-seg--${phase} lifecycle-seg--legend`} />
      {phaseLabel(phase)}
    </span>
  )
}

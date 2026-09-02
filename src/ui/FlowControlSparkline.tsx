import { useMemo } from 'react'
import type { TransferSession } from '../diagnosis/runDiagnosis'
import { buildFlowControlSeries } from '../model/flowControlSparkline'

interface Props {
  session: TransferSession
  baseTimeMs: number
  onJumpToEvent?: (eventIndex: number) => void
}

export function FlowControlSparkline({ session, baseTimeMs, onJumpToEvent }: Props) {
  const points = useMemo(() => buildFlowControlSeries(session.events), [session.events])

  if (points.length < 2) return null

  const minT = points[0].timeMs
  const maxT = points[points.length - 1].timeMs
  const spanT = Math.max(maxT - minT, 1)
  const maxW = Math.max(...points.map((p) => p.windowSize), 1)

  const path = points
    .map((p, i) => {
      const x = ((p.timeMs - minT) / spanT) * 100
      const y = 100 - (p.windowSize / maxW) * 100
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')

  return (
    <div className="flow-sparkline panel">
      <div className="panel-head">
        <h3>Flow-control window</h3>
        <span className="muted small">{points.length} WINDOW_UPDATE points</span>
      </div>
      <svg
        className="flow-sparkline-svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label="Flow control window size over time"
      >
        <path d={path} className="flow-sparkline-line" fill="none" />
      </svg>
      <div className="flow-sparkline-axis muted small">
        <span>0 ms</span>
        <span>{Math.round(maxT - baseTimeMs)} ms</span>
      </div>
      {onJumpToEvent && (
        <button
          type="button"
          className="linkish small"
          onClick={() => onJumpToEvent(points[0].eventIndex)}
        >
          Jump to first window update
        </button>
      )}
    </div>
  )
}

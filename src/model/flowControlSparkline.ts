import { eventStreamId } from './eventCatalog'
import type { NetlogEvent } from '../parser/types'

export interface FlowControlPoint {
  eventIndex: number
  timeMs: number
  windowSize: number
  streamId?: number
  direction: 'recv' | 'send'
}

export function buildFlowControlSeries(events: NetlogEvent[]): FlowControlPoint[] {
  const points: FlowControlPoint[] = []

  for (const ev of events) {
    const t = ev.type
    if (!t.includes('WINDOW_UPDATE') && !t.includes('UPDATE_RECV_WINDOW') && !t.includes('UPDATE_SEND_WINDOW')) {
      continue
    }
    const p = ev.params
    const windowSize =
      typeof p.window_size === 'number'
        ? p.window_size
        : typeof p.delta === 'number'
          ? p.delta
          : typeof p.increment === 'number'
            ? p.increment
            : undefined
    if (windowSize === undefined) continue

    points.push({
      eventIndex: ev.index,
      timeMs: ev.timeMs,
      windowSize,
      streamId: eventStreamId(ev),
      direction: t.includes('RECV') || t.includes('UPDATE_RECV') ? 'recv' : 'send',
    })
  }

  return points.sort((a, b) => a.timeMs - b.timeMs || a.eventIndex - b.eventIndex)
}

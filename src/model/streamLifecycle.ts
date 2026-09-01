import type { TransferSession } from '../diagnosis/runDiagnosis'
import { eventStreamId } from './eventCatalog'
import type { SessionStream } from './http2Session'
import type { NetlogEvent } from '../parser/types'

export type LifecyclePhase = 'headers' | 'data' | 'fin' | 'rst' | 'error'

export interface StreamLifecycleSegment {
  phase: LifecyclePhase
  startMs: number
  endMs: number
  eventIndex: number
}

export interface StreamLifecycle {
  streamId: number
  label: string
  hasError: boolean
  startMs: number
  endMs: number
  segments: StreamLifecycleSegment[]
}

const PHASE_ORDER: LifecyclePhase[] = ['headers', 'data', 'fin', 'error', 'rst']

export function buildStreamLifecycles(
  session: TransferSession,
  baseTimeMs = session.startTimeMs,
): StreamLifecycle[] {
  const eventsByStream = new Map<number, NetlogEvent[]>()

  for (const ev of session.events) {
    const sid = eventStreamId(ev)
    if (sid === undefined || sid < 0) continue
    const list = eventsByStream.get(sid) ?? []
    list.push(ev)
    eventsByStream.set(sid, list)
  }

  const streamById = new Map(session.streams.map((s) => [s.streamId, s]))
  const streamIds = new Set([...eventsByStream.keys(), ...streamById.keys()])

  const lifecycles: StreamLifecycle[] = []

  for (const streamId of streamIds) {
    const stream = streamById.get(streamId)
    const events = (eventsByStream.get(streamId) ?? []).sort((a, b) => a.timeMs - b.timeMs)
    if (events.length === 0 && !stream) continue

    const segments = events.length ? segmentsFromEvents(events, baseTimeMs) : []
    const startMs = segments.length ? segments[0].startMs : 0
    const endMs = segments.length ? segments[segments.length - 1].endMs : 1

    lifecycles.push({
      streamId,
      label: streamLabel(stream),
      hasError: stream?.hasError ?? segments.some((s) => s.phase === 'error' || s.phase === 'rst'),
      startMs,
      endMs: Math.max(endMs, startMs + 1),
      segments,
    })
  }

  lifecycles.sort((a, b) => {
    if (a.hasError !== b.hasError) return a.hasError ? -1 : 1
    return a.streamId - b.streamId
  })

  return lifecycles
}

function streamLabel(stream: SessionStream | undefined): string {
  if (!stream) return '—'
  const method = stream.method ?? ''
  const path = stream.path ?? ''
  if (method || path) return `${method} ${path}`.trim()
  return `stream ${stream.streamId}`
}

function segmentsFromEvents(events: NetlogEvent[], baseTimeMs: number): StreamLifecycleSegment[] {
  const raw: StreamLifecycleSegment[] = []

  for (const ev of events) {
    const rel = ev.timeMs - baseTimeMs
    const phase = classifyStreamEvent(ev)
    if (!phase) continue

    const duration = phase === 'data' ? 8 : 4
    raw.push({
      phase,
      startMs: rel,
      endMs: rel + duration,
      eventIndex: ev.index,
    })

    if (ev.params.fin === true && phase !== 'rst' && phase !== 'error') {
      raw.push({
        phase: 'fin',
        startMs: rel + 1,
        endMs: rel + duration + 1,
        eventIndex: ev.index,
      })
    }
  }

  return mergeAdjacentSegments(raw)
}

function classifyStreamEvent(ev: NetlogEvent): LifecyclePhase | null {
  const t = ev.type
  if (/INVALID_HEADER|PROTOCOL_ERROR|CLOSE_ON_ERROR/i.test(t)) return 'error'
  if (/RST_STREAM|RESET_STREAM|STOP_SENDING/i.test(t)) return 'rst'
  if (/HEADERS/i.test(t)) return 'headers'
  if (/DATA|STREAM_FRAME/i.test(t)) return 'data'
  return null
}

function mergeAdjacentSegments(segments: StreamLifecycleSegment[]): StreamLifecycleSegment[] {
  if (segments.length === 0) return []
  const sorted = [...segments].sort((a, b) => {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs
    return PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase)
  })

  const out: StreamLifecycleSegment[] = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const prev = out[out.length - 1]
    const cur = sorted[i]
    if (cur.phase === prev.phase && cur.startMs <= prev.endMs + 12) {
      prev.endMs = Math.max(prev.endMs, cur.endMs)
      prev.eventIndex = cur.eventIndex
    } else {
      out.push({ ...cur })
    }
  }
  return out
}

export function lifecycleSpan(lifecycle: StreamLifecycle): { startMs: number; endMs: number } {
  const pad = 4
  return {
    startMs: Math.max(0, lifecycle.startMs - pad),
    endMs: lifecycle.endMs + pad,
  }
}

export function segmentStyle(
  segment: StreamLifecycleSegment,
  trackStartMs: number,
  trackEndMs: number,
): { leftPct: number; widthPct: number } {
  const span = Math.max(trackEndMs - trackStartMs, 1)
  const leftPct = ((segment.startMs - trackStartMs) / span) * 100
  const widthPct = (Math.max(segment.endMs - segment.startMs, 2) / span) * 100
  return {
    leftPct: clamp(leftPct),
    widthPct: clamp(widthPct),
  }
}

function clamp(n: number): number {
  return Math.min(100, Math.max(0, n))
}

export function phaseLabel(phase: LifecyclePhase): string {
  switch (phase) {
    case 'headers':
      return 'Headers'
    case 'data':
      return 'Data'
    case 'fin':
      return 'FIN'
    case 'rst':
      return 'RST'
    case 'error':
      return 'Error'
  }
}

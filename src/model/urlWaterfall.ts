import type { UrlRequestSummary } from '../diagnosis/types'
import type { NetlogEvent } from '../parser/types'

export interface WaterfallPhase {
  id: string
  label: string
  startMs: number
  endMs: number
  color: string
}

export interface UrlWaterfallRow {
  request: UrlRequestSummary
  phases: WaterfallPhase[]
  totalMs: number
  rangeStartMs: number
  rangeEndMs: number
}

const PHASE_COLORS: Record<string, string> = {
  queue: 'var(--muted)',
  dns: 'var(--info)',
  connect: 'var(--accent)',
  ssl: 'var(--ok)',
  request: 'var(--warn)',
  wait: 'var(--error)',
  done: 'var(--bg3)',
}

export function buildUrlWaterfallFromSummaries(requests: UrlRequestSummary[]): UrlWaterfallRow[] {
  const rows: UrlWaterfallRow[] = []

  for (const req of requests) {
    const events: NetlogEvent[] = (req.timelineEvents ?? []).map((e, i) => ({
      index: req.evidenceEventIndex ?? i,
      timeMs: e.timeMs,
      type: e.type,
      typeId: 0,
      sourceId: req.sourceId,
      sourceType: 'URL_REQUEST',
      sourceTypeId: 0,
      phase: e.phase as NetlogEvent['phase'],
      params: {},
    }))
    const phases = inferPhases(req, events)
    const rangeStartMs = phases.length ? Math.min(...phases.map((p) => p.startMs)) : req.startTimeMs
    const rangeEndMs = phases.length ? Math.max(...phases.map((p) => p.endMs)) : req.endTimeMs
    rows.push({
      request: req,
      phases,
      totalMs: Math.max(rangeEndMs - rangeStartMs, 1),
      rangeStartMs,
      rangeEndMs,
    })
  }

  return rows.sort((a, b) => a.rangeStartMs - b.rangeStartMs)
}

function inferPhases(req: UrlRequestSummary, events: NetlogEvent[]): WaterfallPhase[] {
  const start = req.startTimeMs
  const end = req.endTimeMs
  const span = Math.max(end - start, 1)

  const markers: Array<{ t: number; label: string; id: string }> = [{ t: start, label: 'Start', id: 'queue' }]

  for (const ev of events) {
    const t = ev.type
    if (t.includes('DNS') || t === 'HOST_RESOLVER_IMPL_REQUEST') {
      markers.push({ t: ev.timeMs, label: 'DNS', id: 'dns' })
    }
    if (t.includes('SOCKET') || t.includes('CONNECT')) {
      markers.push({ t: ev.timeMs, label: 'Connect', id: 'connect' })
    }
    if (t.includes('SSL') || t.includes('TLS')) {
      markers.push({ t: ev.timeMs, label: 'TLS', id: 'ssl' })
    }
    if (t.includes('SEND_REQUEST') || t.includes('SEND_HEADERS')) {
      markers.push({ t: ev.timeMs, label: 'Request', id: 'request' })
    }
    if (ev.phase === 'END' || t.includes('READ') || t.includes('RESPONSE')) {
      markers.push({ t: ev.timeMs, label: 'Response', id: 'wait' })
    }
  }

  markers.push({ t: end, label: 'End', id: 'done' })
  markers.sort((a, b) => a.t - b.t)

  const phases: WaterfallPhase[] = []
  for (let i = 0; i < markers.length - 1; i++) {
    const a = markers[i]
    const b = markers[i + 1]
    if (b.t <= a.t) continue
    phases.push({
      id: a.id,
      label: a.label,
      startMs: a.t,
      endMs: b.t,
      color: PHASE_COLORS[a.id] ?? 'var(--line)',
    })
  }

  if (phases.length === 0) {
    phases.push({
      id: 'total',
      label: 'Total',
      startMs: start,
      endMs: end,
      color: PHASE_COLORS.done,
    })
  }

  void span
  return phases
}

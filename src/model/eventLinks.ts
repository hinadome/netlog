import type { Finding } from '../diagnosis/types'
import { eventStreamId, isErrorLikeEvent } from './eventCatalog'
import type { NetlogEvent } from '../parser/types'

export type EventRole = 'cause' | 'follow-up' | 'finding'

export interface RelatedLink {
  targetIndex: number
  relation: 'caused' | 'followed_by' | 'preceded_by' | 'same_finding'
  label: string
}

export interface EventStoryMeta {
  roles: EventRole[]
  links: RelatedLink[]
}

export type TimelineRow =
  | { kind: 'event'; event: NetlogEvent; meta: EventStoryMeta }
  | {
      kind: 'gap'
      id: string
      deltaMs: number
      fromTimeMs: number
      toTimeMs: number
      afterEventIndex: number
    }

/** Default idle threshold for gap markers (ms). */
export const DEFAULT_GAP_MS = 1000

const CAUSE_TYPES = new Set([
  'HTTP2_SESSION_RECV_INVALID_HEADER',
  'QUIC_SESSION_CLOSE_ON_ERROR',
])

const FOLLOW_TYPES = new Set([
  'HTTP2_SESSION_SEND_RST_STREAM',
  'HTTP2_SESSION_RECV_RST_STREAM',
  'HTTP2_SESSION_RECV_GOAWAY',
  'HTTP2_SESSION_SEND_GOAWAY',
  'HTTP2_SESSION_CLOSE',
  'QUIC_SESSION_CONNECTION_CLOSE_FRAME_RECEIVED',
  'QUIC_SESSION_CONNECTION_CLOSE_FRAME_SENT',
  'QUIC_CONNECTION_CLOSE_FRAME_RECEIVED',
  'QUIC_CONNECTION_CLOSE_FRAME_SENT',
  'QUIC_SESSION_CLOSED',
])

function pushUniqueRole(roles: EventRole[], role: EventRole): void {
  if (!roles.includes(role)) roles.push(role)
}

function addLink(
  map: Map<number, EventStoryMeta>,
  from: number,
  to: number,
  relation: RelatedLink['relation'],
  label: string,
): void {
  if (from === to) return
  const fromMeta = map.get(from) ?? { roles: [], links: [] }
  const toMeta = map.get(to) ?? { roles: [], links: [] }
  if (!fromMeta.links.some((l) => l.targetIndex === to && l.relation === relation)) {
    fromMeta.links.push({ targetIndex: to, relation, label })
  }
  const reverse: RelatedLink['relation'] =
    relation === 'caused'
      ? 'followed_by'
      : relation === 'followed_by'
        ? 'preceded_by'
        : relation === 'preceded_by'
          ? 'followed_by'
          : 'same_finding'
  const reverseLabel =
    relation === 'caused'
      ? 'Likely cause'
      : relation === 'followed_by'
        ? 'Earlier event'
        : relation === 'preceded_by'
          ? 'Later event'
          : label
  if (!toMeta.links.some((l) => l.targetIndex === from && l.relation === reverse)) {
    toMeta.links.push({ targetIndex: from, relation: reverse, label: reverseLabel })
  }
  map.set(from, fromMeta)
  map.set(to, toMeta)
}

/**
 * Build cause → follow-up links and finding roles for session events.
 */
export function buildEventStory(
  events: NetlogEvent[],
  findings: Finding[],
): Map<number, EventStoryMeta> {
  const map = new Map<number, EventStoryMeta>()
  const byIndex = new Map(events.map((e) => [e.index, e]))

  for (const f of findings) {
    const evidence = f.evidenceEventIndexes.filter((i) => byIndex.has(i))
    for (const idx of evidence) {
      const meta = map.get(idx) ?? { roles: [], links: [] }
      pushUniqueRole(meta.roles, 'finding')
      map.set(idx, meta)
    }
    for (let i = 0; i < evidence.length; i++) {
      for (let j = i + 1; j < evidence.length; j++) {
        addLink(map, evidence[i], evidence[j], 'same_finding', f.title)
      }
    }
    if (evidence.length >= 2) {
      const first = map.get(evidence[0]) ?? { roles: [], links: [] }
      pushUniqueRole(first.roles, 'cause')
      map.set(evidence[0], first)
      for (let i = 1; i < evidence.length; i++) {
        const m = map.get(evidence[i]) ?? { roles: [], links: [] }
        pushUniqueRole(m.roles, 'follow-up')
        map.set(evidence[i], m)
        addLink(map, evidence[0], evidence[i], 'caused', f.title)
      }
    }
  }

  // Heuristic: INVALID_HEADER / error → RST / GOAWAY / CLOSE on same stream within 2s
  const sorted = [...events].sort((a, b) => a.timeMs - b.timeMs || a.index - b.index)
  for (let i = 0; i < sorted.length; i++) {
    const cause = sorted[i]
    if (!CAUSE_TYPES.has(cause.type) && !(isErrorLikeEvent(cause) && cause.type.includes('INVALID'))) {
      continue
    }
    const stream = eventStreamId(cause)
    for (let j = i + 1; j < sorted.length && j < i + 40; j++) {
      const next = sorted[j]
      if (next.timeMs - cause.timeMs > 2000) break
      const nextStream = eventStreamId(next)
      if (stream !== undefined && nextStream !== undefined && stream !== nextStream) continue
      if (!FOLLOW_TYPES.has(next.type) && !next.type.includes('RST') && !next.type.includes('CLOSE')) {
        continue
      }
      const metaCause = map.get(cause.index) ?? { roles: [], links: [] }
      const metaFollow = map.get(next.index) ?? { roles: [], links: [] }
      pushUniqueRole(metaCause.roles, 'cause')
      pushUniqueRole(metaFollow.roles, 'follow-up')
      map.set(cause.index, metaCause)
      map.set(next.index, metaFollow)
      addLink(map, cause.index, next.index, 'caused', `${shortType(cause.type)} → ${shortType(next.type)}`)
      break
    }
  }

  // HEADERS on stream shortly before INVALID_HEADER / RST → link request to failure
  for (let i = 0; i < sorted.length; i++) {
    const fail = sorted[i]
    if (!fail.type.includes('INVALID_HEADER') && !fail.type.includes('RST_STREAM')) continue
    const stream = eventStreamId(fail)
    if (stream === undefined) continue
    for (let j = i - 1; j >= 0 && j >= i - 30; j--) {
      const prev = sorted[j]
      if (fail.timeMs - prev.timeMs > 5000) break
      if (eventStreamId(prev) !== stream) continue
      if (!prev.type.includes('HEADERS')) continue
      if (!map.has(prev.index)) map.set(prev.index, { roles: [], links: [] })
      if (!map.has(fail.index)) map.set(fail.index, { roles: [], links: [] })
      addLink(map, prev.index, fail.index, 'followed_by', `Request on stream ${stream}`)
      break
    }
  }

  return map
}

function shortType(type: string): string {
  return type.replace(/^HTTP2_SESSION_/, '').replace(/^QUIC_SESSION_/, '')
}

export function emptyMeta(): EventStoryMeta {
  return { roles: [], links: [] }
}

/**
 * Interleave gap markers between consecutive filtered events when idle ≥ gapMs.
 */
export function buildTimelineRows(
  events: NetlogEvent[],
  story: Map<number, EventStoryMeta>,
  gapMs: number = DEFAULT_GAP_MS,
): TimelineRow[] {
  const rows: TimelineRow[] = []
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (i > 0) {
      const prev = events[i - 1]
      const delta = event.timeMs - prev.timeMs
      if (delta >= gapMs) {
        rows.push({
          kind: 'gap',
          id: `gap-${prev.index}-${event.index}`,
          deltaMs: delta,
          fromTimeMs: prev.timeMs,
          toTimeMs: event.timeMs,
          afterEventIndex: prev.index,
        })
      }
    }
    rows.push({
      kind: 'event',
      event,
      meta: story.get(event.index) ?? emptyMeta(),
    })
  }
  return rows
}

export function formatGapDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s`
  const min = Math.floor(ms / 60_000)
  const sec = Math.round((ms % 60_000) / 1000)
  return `${min}m ${sec}s`
}

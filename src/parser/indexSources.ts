import type { NetlogEvent, SourceEntry } from './types'

export function indexSources(events: NetlogEvent[]): Map<number, SourceEntry> {
  const sources = new Map<number, SourceEntry>()

  for (const ev of events) {
    let entry = sources.get(ev.sourceId)
    if (!entry) {
      entry = {
        id: ev.sourceId,
        type: ev.sourceType,
        typeId: ev.sourceTypeId,
        startTimeMs: ev.timeMs,
        endTimeMs: ev.timeMs,
        events: [],
      }
      sources.set(ev.sourceId, entry)
    }
    entry.events.push(ev)
    if (ev.timeMs < entry.startTimeMs) entry.startTimeMs = ev.timeMs
    if (ev.timeMs > entry.endTimeMs) entry.endTimeMs = ev.timeMs
  }

  return sources
}

export function sourcesOfType(
  sources: Map<number, SourceEntry>,
  typeName: string,
): SourceEntry[] {
  const out: SourceEntry[] = []
  for (const s of sources.values()) {
    if (s.type === typeName) out.push(s)
  }
  out.sort((a, b) => a.startTimeMs - b.startTimeMs)
  return out
}

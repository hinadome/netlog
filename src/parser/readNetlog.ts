import { eventTypeName, phaseName, resolveConstants, sourceTypeName } from './constants'
import { indexSources } from './indexSources'
import type {
  NetlogEvent,
  ParsedNetlog,
  RawNetlogEvent,
  RawNetlogFile,
  ResolvedConstants,
} from './types'

export type ParseProgress = {
  stage: 'reading' | 'parsing' | 'indexing' | 'modeling' | 'diagnosing' | 'done'
  percent: number
  message: string
}

function parseTimeMs(time: string | number): number {
  if (typeof time === 'number') return time
  const n = Number(time)
  return Number.isFinite(n) ? n : 0
}

export function normalizeEvent(
  raw: RawNetlogEvent,
  index: number,
  constants: ResolvedConstants,
): NetlogEvent {
  const type = eventTypeName(constants, raw.type)
  const source = sourceTypeName(constants, raw.source.type)
  return {
    index,
    timeMs: parseTimeMs(raw.time),
    type: type.name,
    typeId: type.id,
    sourceId: raw.source.id,
    sourceType: source.name,
    sourceTypeId: source.id,
    phase: phaseName(constants, raw.phase),
    params: (raw.params as Record<string, unknown>) ?? {},
  }
}

/**
 * Parse a Chrome net-export JSON string into resolved events.
 * Supports a full JSON object `{ constants, events }`.
 */
export function parseNetlogJson(
  text: string,
  fileName = 'netlog.json',
  onProgress?: (p: ParseProgress) => void,
): ParsedNetlog {
  onProgress?.({ stage: 'parsing', percent: 10, message: 'Parsing JSON…' })

  let data: RawNetlogFile
  try {
    data = JSON.parse(text) as RawNetlogFile
  } catch (err) {
    const repaired = repairTruncatedNetlog(text)
    if (!repaired) throw err
    data = repaired
  }

  if (!data?.constants || !Array.isArray(data.events)) {
    throw new Error('Invalid netlog: expected { constants, events[] }')
  }

  const constants = resolveConstants(data.constants)
  onProgress?.({
    stage: 'parsing',
    percent: 40,
    message: `Resolving ${data.events.length.toLocaleString()} events…`,
  })

  const events: NetlogEvent[] = new Array(data.events.length)
  const chunk = Math.max(1000, Math.floor(data.events.length / 20) || 1)
  for (let i = 0; i < data.events.length; i++) {
    events[i] = normalizeEvent(data.events[i], i, constants)
    if (onProgress && i > 0 && i % chunk === 0) {
      const pct = 40 + Math.floor((i / data.events.length) * 40)
      onProgress({
        stage: 'parsing',
        percent: pct,
        message: `Resolved ${i.toLocaleString()} / ${data.events.length.toLocaleString()} events…`,
      })
    }
  }

  onProgress?.({ stage: 'indexing', percent: 85, message: 'Indexing sources…' })
  const sources = indexSources(events)
  onProgress?.({ stage: 'indexing', percent: 95, message: 'Index complete' })

  return {
    constants,
    events,
    sources,
    fileName,
    eventCount: events.length,
    polledData: data.polledData ?? null,
  }
}

/** Attempt to close a truncated JSON netlog object. */
function repairTruncatedNetlog(text: string): RawNetlogFile | null {
  const trimmed = text.trimEnd().replace(/,\s*$/, '')
  const candidates = [`${trimmed}]}`, `${trimmed}\n]}`]
  for (const c of candidates) {
    try {
      const data = JSON.parse(c) as RawNetlogFile
      if (data?.constants && Array.isArray(data.events)) return data
    } catch {
      /* try next */
    }
  }
  return null
}

export async function parseNetlogFile(
  file: File,
  onProgress?: (p: ParseProgress) => void,
): Promise<ParsedNetlog> {
  onProgress?.({ stage: 'reading', percent: 2, message: `Reading ${file.name}…` })
  const text = await file.text()
  onProgress?.({ stage: 'reading', percent: 8, message: 'File loaded' })
  return parseNetlogJson(text, file.name, onProgress)
}

/** Raw event as stored in a Chrome net-export JSON file. */
export interface RawNetlogEvent {
  time: string | number
  type: number | string
  source: {
    id: number
    type: number | string
  }
  phase: number | string
  params?: Record<string, unknown>
}

export interface NetlogConstants {
  logEventTypes: Record<string, number>
  logSourceType: Record<string, number>
  logEventPhase: Record<string, number>
  netError?: Record<string, number>
  quicError?: Record<string, number>
  quicRstStreamError?: Record<string, number>
  timeTickOffset?: number
  clientInfo?: Record<string, unknown>
  [key: string]: unknown
}

export interface RawNetlogFile {
  constants: NetlogConstants
  events: RawNetlogEvent[]
  polledData?: Record<string, unknown>
}

/** Resolved event with symbolic type/source/phase names. */
export interface NetlogEvent {
  /** Stable index in the original events array. */
  index: number
  timeMs: number
  type: string
  typeId: number
  sourceId: number
  sourceType: string
  sourceTypeId: number
  phase: 'BEGIN' | 'END' | 'NONE'
  params: Record<string, unknown>
}

export interface ResolvedConstants {
  eventTypeToName: Map<number, string>
  eventNameToId: Map<string, number>
  sourceTypeToName: Map<number, string>
  sourceNameToId: Map<string, number>
  phaseToName: Map<number, 'BEGIN' | 'END' | 'NONE'>
  netErrorToName: Map<number, string>
  timeTickOffset: number
  clientInfo: Record<string, unknown>
  raw: NetlogConstants
}

export interface SourceEntry {
  id: number
  type: string
  typeId: number
  startTimeMs: number
  endTimeMs: number
  events: NetlogEvent[]
}

export interface ParsedNetlog {
  constants: ResolvedConstants
  events: NetlogEvent[]
  sources: Map<number, SourceEntry>
  fileName: string
  eventCount: number
  /** Raw polledData from net-export (snapshot at Stop); may be object or array. */
  polledData: unknown
}

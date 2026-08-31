import type { NetlogConstants, ResolvedConstants } from './types'

function invertStringToNumber(map: Record<string, number> | undefined): {
  toName: Map<number, string>
  toId: Map<string, number>
} {
  const toName = new Map<number, string>()
  const toId = new Map<string, number>()
  if (!map) return { toName, toId }
  for (const [name, id] of Object.entries(map)) {
    toName.set(id, name)
    toId.set(name, id)
  }
  return { toName, toId }
}

function resolvePhaseMap(
  logEventPhase: Record<string, number> | undefined,
): Map<number, 'BEGIN' | 'END' | 'NONE'> {
  const map = new Map<number, 'BEGIN' | 'END' | 'NONE'>()
  if (!logEventPhase) {
    map.set(0, 'BEGIN')
    map.set(1, 'END')
    map.set(2, 'NONE')
    return map
  }
  for (const [name, id] of Object.entries(logEventPhase)) {
    if (name.includes('BEGIN')) map.set(id, 'BEGIN')
    else if (name.includes('END')) map.set(id, 'END')
    else map.set(id, 'NONE')
  }
  return map
}

export function resolveConstants(constants: NetlogConstants): ResolvedConstants {
  const events = invertStringToNumber(constants.logEventTypes)
  const sources = invertStringToNumber(constants.logSourceType)
  const netErrors = invertStringToNumber(constants.netError)

  return {
    eventTypeToName: events.toName,
    eventNameToId: events.toId,
    sourceTypeToName: sources.toName,
    sourceNameToId: sources.toId,
    phaseToName: resolvePhaseMap(constants.logEventPhase),
    netErrorToName: netErrors.toName,
    timeTickOffset: typeof constants.timeTickOffset === 'number' ? constants.timeTickOffset : 0,
    clientInfo: (constants.clientInfo as Record<string, unknown>) ?? {},
    raw: constants,
  }
}

export function eventTypeName(
  constants: ResolvedConstants,
  type: number | string,
): { name: string; id: number } {
  if (typeof type === 'string') {
    return { name: type, id: constants.eventNameToId.get(type) ?? -1 }
  }
  return {
    name: constants.eventTypeToName.get(type) ?? `TYPE_${type}`,
    id: type,
  }
}

export function sourceTypeName(
  constants: ResolvedConstants,
  type: number | string,
): { name: string; id: number } {
  if (typeof type === 'string') {
    return { name: type, id: constants.sourceNameToId.get(type) ?? -1 }
  }
  return {
    name: constants.sourceTypeToName.get(type) ?? `SOURCE_${type}`,
    id: type,
  }
}

export function phaseName(
  constants: ResolvedConstants,
  phase: number | string,
): 'BEGIN' | 'END' | 'NONE' {
  if (typeof phase === 'string') {
    if (phase.includes('BEGIN')) return 'BEGIN'
    if (phase.includes('END')) return 'END'
    return 'NONE'
  }
  return constants.phaseToName.get(phase) ?? 'NONE'
}

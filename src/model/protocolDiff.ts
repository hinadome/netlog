import type { TransferSession } from '../diagnosis/runDiagnosis'
import type { NetlogEvent } from '../parser/types'

export interface GoawayRecord {
  direction: 'sent' | 'received'
  timeMs: number
  errorCode: string
  lastStreamId?: number
  debugData?: string
  eventIndex: number
}

export interface ProtocolDiffSummary {
  settingsSent: Record<string, number | string>
  settingsReceived: Record<string, number | string>
  goaways: GoawayRecord[]
  negotiatedProtocol?: string
}

export function buildProtocolDiff(session: TransferSession): ProtocolDiffSummary {
  const goaways: GoawayRecord[] = []

  for (const ev of session.events) {
    if (ev.type.includes('GOAWAY')) {
      const p = ev.params
      goaways.push({
        direction: ev.type.includes('SEND') ? 'sent' : 'received',
        timeMs: ev.timeMs,
        errorCode: String(p.error_code ?? p.quic_error ?? '—'),
        lastStreamId: typeof p.last_stream_id === 'number' ? p.last_stream_id : undefined,
        debugData: typeof p.debug_data === 'string' ? p.debug_data : undefined,
        eventIndex: ev.index,
      })
    }
  }

  return {
    settingsSent: session.settingsSent,
    settingsReceived: session.settingsReceived,
    goaways,
    negotiatedProtocol: session.negotiatedProtocol,
  }
}

export function settingsDiffKeys(
  sent: Record<string, number | string>,
  received: Record<string, number | string>,
): Array<{ key: string; sent?: number | string; received?: number | string }> {
  const keys = new Set([...Object.keys(sent), ...Object.keys(received)])
  return [...keys]
    .sort()
    .map((key) => ({ key, sent: sent[key], received: received[key] }))
    .filter((row) => row.sent !== row.received)
}

export function findGoawayEvent(session: TransferSession, eventIndex: number): NetlogEvent | undefined {
  return session.events.find((e) => e.index === eventIndex)
}

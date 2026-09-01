import type { TransferSession } from '../diagnosis/runDiagnosis'
import type { Finding } from '../diagnosis/types'
import { buildProtocolDiff } from './protocolDiff'
import { findFirstActionableErrorIndex } from './sessionIssues'

export function buildSessionNarrativeMarkdown(
  session: TransferSession,
  findings: Finding[],
): string {
  const lines: string[] = [
    `# Session ${session.id} — ${session.host}`,
    '',
    `- Protocol: ${session.protocol}`,
    `- Duration: ${Math.round(session.endTimeMs - session.startTimeMs)} ms`,
    `- Streams: ${session.streams.length}`,
    `- Events: ${session.events.length}`,
    '',
  ]

  if (session.error) {
    lines.push(`**Session error:** ${session.error}`, '')
  }

  const diff = buildProtocolDiff(session)
  if (Object.keys(diff.settingsSent).length || Object.keys(diff.settingsReceived).length) {
    lines.push('## SETTINGS', '')
    lines.push('Sent:', '```json', JSON.stringify(diff.settingsSent, null, 2), '```', '')
    lines.push('Received:', '```json', JSON.stringify(diff.settingsReceived, null, 2), '```', '')
  }

  if (diff.goaways.length) {
    lines.push('## GOAWAY', '')
    for (const g of diff.goaways) {
      lines.push(
        `- ${g.direction} @ +${Math.round(g.timeMs - session.startTimeMs)} ms: ${g.errorCode}${g.lastStreamId !== undefined ? ` (last stream ${g.lastStreamId})` : ''}`,
      )
    }
    lines.push('')
  }

  const firstErr = findFirstActionableErrorIndex(session, findings)
  if (firstErr !== undefined) {
    lines.push(`**First actionable error:** event #${firstErr}`, '')
  }

  if (findings.length) {
    lines.push('## Findings', '')
    for (const f of findings) {
      lines.push(`### [${f.severity}] ${f.title}`, '', f.explanation, '', `**Next:** ${f.suggestion}`, '')
    }
  }

  const erroredStreams = session.streams.filter((s) => s.hasError)
  if (erroredStreams.length) {
    lines.push('## Errored streams', '')
    for (const s of erroredStreams) {
      lines.push(
        `- Stream ${s.streamId}: ${s.method ?? '?'} ${s.path ?? ''} — RST ${s.rstError ?? 'yes'}`,
      )
    }
    lines.push('')
  }

  return lines.join('\n')
}

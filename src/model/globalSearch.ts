import type { TransferAnalysis } from '../diagnosis/runDiagnosis'
import type { Finding } from '../diagnosis/types'
import { describeEvent } from './eventCatalog'

export type GlobalSearchHitKind = 'finding' | 'session' | 'event' | 'url'

export interface GlobalSearchHit {
  kind: GlobalSearchHitKind
  label: string
  snippet: string
  sessionId?: number
  eventIndex?: number
  findingId?: string
  urlRequestId?: number
  score: number
}

const MAX_EVENT_HITS = 200
const MAX_TOTAL = 150

export function searchAnalysis(
  analysis: TransferAnalysis,
  query: string,
): GlobalSearchHit[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const hits: GlobalSearchHit[] = []

  for (const f of analysis.findings) {
    const hay = `${f.title} ${f.explanation} ${f.host ?? ''} ${f.url ?? ''} ${f.ruleId}`.toLowerCase()
    if (!hay.includes(needle)) continue
    hits.push({
      kind: 'finding',
      label: f.title,
      snippet: f.host ?? f.ruleId,
      sessionId: f.sessionId,
      eventIndex: f.evidenceEventIndexes[0],
      findingId: f.id,
      score: f.severity === 'critical' ? 0 : f.severity === 'error' ? 1 : 2,
    })
  }

  for (const s of analysis.sessionSummaries) {
    const hay = `${s.host} ${s.paths.join(' ')} ${s.id} ${s.protocol}`.toLowerCase()
    if (!hay.includes(needle)) continue
    hits.push({
      kind: 'session',
      label: `${s.protocol} session ${s.id} — ${s.host}`,
      snippet: s.paths.slice(0, 3).join(', ') || 'no paths',
      sessionId: s.id,
      score: 3,
    })
  }

  for (const r of analysis.urlRequests) {
    const hay = `${r.url ?? ''} ${r.method ?? ''} ${r.netError ?? ''}`.toLowerCase()
    if (!hay.includes(needle)) continue
    hits.push({
      kind: 'url',
      label: r.url ?? `URL_REQUEST ${r.sourceId}`,
      snippet: r.netError ?? r.method ?? 'ok',
      sessionId: r.relatedSessionIds[0],
      eventIndex: r.evidenceEventIndex,
      urlRequestId: r.sourceId,
      score: r.netError ? 1 : 4,
    })
  }

  let eventHits = 0
  for (const session of analysis.sessions) {
    for (const ev of session.events) {
      if (eventHits >= MAX_EVENT_HITS) break
      const desc = describeEvent(ev, { protocol: session.protocol })
      const hay = `${ev.type} ${desc.title} ${desc.summary} ${JSON.stringify(ev.params)}`.toLowerCase()
      if (!hay.includes(needle)) continue
      hits.push({
        kind: 'event',
        label: desc.title,
        snippet: `session ${session.id} · event #${ev.index}`,
        sessionId: session.id,
        eventIndex: ev.index,
        score: 5,
      })
      eventHits += 1
    }
    if (eventHits >= MAX_EVENT_HITS) break
  }

  hits.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label))
  return hits.slice(0, MAX_TOTAL)
}

export function uniqueRuleIds(findings: Finding[]): string[] {
  return [...new Set(findings.map((f) => f.ruleId))].sort()
}

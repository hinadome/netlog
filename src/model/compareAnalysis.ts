import type { TransferAnalysis } from '../diagnosis/runDiagnosis'
import type { Finding } from '../diagnosis/types'

export interface CompareSummary {
  labelA: string
  labelB: string
  eventsA: number
  eventsB: number
  sessionsA: number
  sessionsB: number
  findingsA: number
  findingsB: number
  failedUrlsA: number
  failedUrlsB: number
  hostsOnlyInA: string[]
  hostsOnlyInB: string[]
  findingsDelta: FindingDelta[]
  failedUrlDelta: FailedUrlDelta[]
}

export interface FindingDelta {
  ruleId: string
  countA: number
  countB: number
}

export interface FailedUrlDelta {
  url: string
  inA: boolean
  inB: boolean
}

export function compareAnalyses(a: TransferAnalysis, b: TransferAnalysis): CompareSummary {
  const hostsA = new Set(a.sessionSummaries.map((s) => s.host))
  const hostsB = new Set(b.sessionSummaries.map((s) => s.host))

  const ruleCounts = (findings: Finding[]) => {
    const m = new Map<string, number>()
    for (const f of findings) {
      m.set(f.ruleId, (m.get(f.ruleId) ?? 0) + 1)
    }
    return m
  }

  const rulesA = ruleCounts(a.findings)
  const rulesB = ruleCounts(b.findings)
  const allRules = new Set([...rulesA.keys(), ...rulesB.keys()])

  const findingsDelta: FindingDelta[] = [...allRules]
    .map((ruleId) => ({
      ruleId,
      countA: rulesA.get(ruleId) ?? 0,
      countB: rulesB.get(ruleId) ?? 0,
    }))
    .filter((d) => d.countA !== d.countB)
    .sort((x, y) => Math.abs(y.countB - y.countA) - Math.abs(x.countB - x.countA))

  const failedA = new Set(a.urlRequests.filter((r) => r.netError).map((r) => r.url ?? ''))
  const failedB = new Set(b.urlRequests.filter((r) => r.netError).map((r) => r.url ?? ''))
  const allFailed = new Set([...failedA, ...failedB].filter(Boolean))

  const failedUrlDelta: FailedUrlDelta[] = [...allFailed].map((url) => ({
    url,
    inA: failedA.has(url),
    inB: failedB.has(url),
  }))

  return {
    labelA: a.fileName,
    labelB: b.fileName,
    eventsA: a.eventCount,
    eventsB: b.eventCount,
    sessionsA: a.sessionSummaries.length,
    sessionsB: b.sessionSummaries.length,
    findingsA: a.findings.length,
    findingsB: b.findings.length,
    failedUrlsA: a.failedUrlRequestCount,
    failedUrlsB: b.failedUrlRequestCount,
    hostsOnlyInA: [...hostsA].filter((h) => !hostsB.has(h)).sort(),
    hostsOnlyInB: [...hostsB].filter((h) => !hostsA.has(h)).sort(),
    findingsDelta,
    failedUrlDelta,
  }
}

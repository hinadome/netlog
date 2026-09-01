import type { UrlRequestSummary } from '../diagnosis/types'

export interface UrlRetryChain {
  /** Normalized key for grouping (origin + pathname). */
  key: string
  displayUrl: string
  attempts: UrlRequestSummary[]
  hadFailure: boolean
  eventualSuccess: boolean
}

export function normalizeUrlKey(url: string | undefined): string {
  if (!url) return '(unknown)'
  try {
    const u = new URL(url)
    return `${u.origin}${u.pathname}`
  } catch {
    return url.split('?')[0] ?? url
  }
}

export function buildUrlRetryChains(requests: UrlRequestSummary[]): UrlRetryChain[] {
  const byKey = new Map<string, UrlRequestSummary[]>()

  for (const req of requests) {
    const url = req.url?.trim()
    if (!url) continue
    const key = normalizeUrlKey(url)
    const list = byKey.get(key) ?? []
    list.push(req)
    byKey.set(key, list)
  }

  const chains: UrlRetryChain[] = []

  for (const [key, attempts] of byKey) {
    if (attempts.length < 2) continue
    attempts.sort((a, b) => a.startTimeMs - b.startTimeMs)
    const hadFailure = attempts.some((a) => Boolean(a.netError))
    const eventualSuccess = attempts.some((a) => !a.netError)
    chains.push({
      key,
      displayUrl: attempts[0].url ?? key,
      attempts,
      hadFailure,
      eventualSuccess,
    })
  }

  return chains.sort((a, b) => {
    if (a.hadFailure !== b.hadFailure) return a.hadFailure ? -1 : 1
    return a.attempts[0].startTimeMs - b.attempts[0].startTimeMs
  })
}

import { describe, expect, it } from 'vitest'
import { buildUrlRetryChains } from './urlRetryChains'
import type { UrlRequestSummary } from '../diagnosis/types'

function req(id: number, url?: string, netError?: string): UrlRequestSummary {
  return {
    sourceId: id,
    url,
    startTimeMs: id * 10,
    endTimeMs: id * 10 + 5,
    relatedSessionIds: [],
  }
}

describe('urlRetryChains', () => {
  it('groups multiple attempts for the same path', () => {
    const chains = buildUrlRetryChains([
      req(1, 'https://example.com/api'),
      req(2, 'https://example.com/api?q=1'),
      req(3, 'https://other.com/x'),
    ])
    expect(chains).toHaveLength(1)
    expect(chains[0].attempts).toHaveLength(2)
  })

  it('does not group requests without URLs', () => {
    const chains = buildUrlRetryChains([req(1), req(2), req(3, 'https://a.com/')])
    expect(chains).toHaveLength(0)
  })
})

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runDiagnosis, toTransferAnalysis } from '../diagnosis/runDiagnosis'
import { parseNetlogJson } from '../parser/readNetlog'
import { buildStreamLifecycles, phaseLabel } from './streamLifecycle'

const dir = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(join(dir, '../fixtures/sample-h2-invalid-header.json'), 'utf8')

describe('streamLifecycle', () => {
  it('builds segments for request stream with headers and rst', () => {
    const parsed = parseNetlogJson(fixture)
    const transfer = toTransferAnalysis(runDiagnosis(parsed)).sessions.find((s) => s.protocol === 'h2')
    expect(transfer).toBeDefined()
    const lifecycles = buildStreamLifecycles(transfer!)

    const stream9 = lifecycles.find((l) => l.streamId === 9)
    expect(stream9).toBeDefined()
    expect(stream9!.label).toContain('/login')
    expect(stream9!.hasError).toBe(true)
    const phases = stream9!.segments.map((s) => s.phase)
    expect(phases).toContain('headers')
    expect(phases.some((p) => p === 'rst' || p === 'error')).toBe(true)
  })

  it('labels phases', () => {
    expect(phaseLabel('headers')).toBe('Headers')
    expect(phaseLabel('rst')).toBe('RST')
  })
})

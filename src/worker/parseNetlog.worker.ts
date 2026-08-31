import { parseNetlogJson, type ParseProgress } from '../parser/readNetlog'
import { runDiagnosis, toTransferAnalysis } from '../diagnosis/runDiagnosis'

export type WorkerRequest =
  | { type: 'parse'; id: number; text: string; fileName: string }

export type WorkerResponse =
  | { type: 'progress'; id: number; progress: ParseProgress }
  | { type: 'result'; id: number; analysis: ReturnType<typeof toTransferAnalysis> }
  | { type: 'error'; id: number; message: string }

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data
  if (msg.type !== 'parse') return

  const { id, text, fileName } = msg
  try {
    const onProgress = (progress: ParseProgress) => {
      const res: WorkerResponse = { type: 'progress', id, progress }
      self.postMessage(res)
    }
    const parsed = parseNetlogJson(text, fileName, onProgress)
    const result = runDiagnosis(parsed, onProgress)
    const analysis = toTransferAnalysis(result)
    const res: WorkerResponse = { type: 'result', id, analysis }
    self.postMessage(res)
  } catch (err) {
    const res: WorkerResponse = {
      type: 'error',
      id,
      message: err instanceof Error ? err.message : String(err),
    }
    self.postMessage(res)
  }
}

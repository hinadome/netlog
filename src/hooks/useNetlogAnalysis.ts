import { useCallback, useRef, useState } from 'react'
import type { TransferAnalysis } from '../diagnosis/runDiagnosis'
import type { ParseProgress } from '../parser/readNetlog'
import type { WorkerRequest, WorkerResponse } from '../worker/parseNetlog.worker'

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'loading'; progress: ParseProgress; fileName: string }
  | { status: 'ready'; analysis: TransferAnalysis }
  | { status: 'error'; message: string; fileName?: string }

export function useNetlogAnalysis() {
  const workerRef = useRef<Worker | null>(null)
  const reqIdRef = useRef(0)
  const [state, setState] = useState<AnalysisState>({ status: 'idle' })

  const ensureWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current
    const worker = new Worker(new URL('../worker/parseNetlog.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerRef.current = worker
    return worker
  }, [])

  const analyzeFile = useCallback(
    async (file: File) => {
      const id = ++reqIdRef.current
      setState({
        status: 'loading',
        fileName: file.name,
        progress: { stage: 'reading', percent: 1, message: `Reading ${file.name}…` },
      })

      const text = await file.text()
      const worker = ensureWorker()

      await new Promise<void>((resolve, reject) => {
        const onMessage = (ev: MessageEvent<WorkerResponse>) => {
          const msg = ev.data
          if (msg.id !== id) return
          if (msg.type === 'progress') {
            setState({ status: 'loading', fileName: file.name, progress: msg.progress })
          } else if (msg.type === 'result') {
            worker.removeEventListener('message', onMessage)
            setState({ status: 'ready', analysis: msg.analysis })
            resolve()
          } else if (msg.type === 'error') {
            worker.removeEventListener('message', onMessage)
            setState({ status: 'error', message: msg.message, fileName: file.name })
            reject(new Error(msg.message))
          }
        }
        worker.addEventListener('message', onMessage)
        const req: WorkerRequest = { type: 'parse', id, text, fileName: file.name }
        worker.postMessage(req)
      }).catch(() => {
        /* state already set */
      })
    },
    [ensureWorker],
  )

  const reset = useCallback(() => {
    setState({ status: 'idle' })
  }, [])

  return { state, analyzeFile, reset }
}

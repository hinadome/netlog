import { useCallback, useRef, useState } from 'react'
import type { TransferAnalysis } from '../diagnosis/runDiagnosis'
import type { ParseProgress } from '../parser/readNetlog'
import { validateNetlogFileSize } from '../security/netlogLimits'
import type { WorkerRequest, WorkerResponse } from '../worker/parseNetlog.worker'

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'loading'; progress: ParseProgress; fileName: string }
  | { status: 'ready'; analysis: TransferAnalysis }
  | { status: 'error'; message: string; fileName?: string }

export type CompareLoadState =
  | { status: 'idle' }
  | { status: 'loading'; fileName: string }
  | { status: 'ready'; analysis: TransferAnalysis }
  | { status: 'error'; message: string }

export function useNetlogAnalysis() {
  const workerRef = useRef<Worker | null>(null)
  const reqIdRef = useRef(0)
  const [state, setState] = useState<AnalysisState>({ status: 'idle' })
  const [compareState, setCompareState] = useState<CompareLoadState>({ status: 'idle' })

  const terminateWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
  }, [])

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
      const sizeError = validateNetlogFileSize(file.size)
      if (sizeError) {
        setState({ status: 'error', message: sizeError, fileName: file.name })
        return
      }

      terminateWorker()
      setCompareState({ status: 'idle' })
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
    [ensureWorker, terminateWorker],
  )

  const reset = useCallback(() => {
    terminateWorker()
    setState({ status: 'idle' })
    setCompareState({ status: 'idle' })
  }, [terminateWorker])

  const analyzeCompareFile = useCallback(
    async (file: File) => {
      const sizeError = validateNetlogFileSize(file.size)
      if (sizeError) {
        setCompareState({ status: 'error', message: sizeError })
        return
      }

      const id = ++reqIdRef.current
      setCompareState({ status: 'loading', fileName: file.name })

      const text = await file.text()
      const worker = ensureWorker()

      await new Promise<void>((resolve, reject) => {
        const onMessage = (ev: MessageEvent<WorkerResponse>) => {
          const msg = ev.data
          if (msg.id !== id) return
          if (msg.type === 'result') {
            worker.removeEventListener('message', onMessage)
            setCompareState({ status: 'ready', analysis: msg.analysis })
            resolve()
          } else if (msg.type === 'error') {
            worker.removeEventListener('message', onMessage)
            setCompareState({ status: 'error', message: msg.message })
            reject(new Error(msg.message))
          }
        }
        worker.addEventListener('message', onMessage)
        const req: WorkerRequest = { type: 'parse', id, text, fileName: file.name }
        worker.postMessage(req)
      }).catch(() => {
        /* state set */
      })
    },
    [ensureWorker],
  )

  const clearCompare = useCallback(() => {
    setCompareState({ status: 'idle' })
  }, [])

  return { state, compareState, analyzeFile, analyzeCompareFile, clearCompare, reset }
}

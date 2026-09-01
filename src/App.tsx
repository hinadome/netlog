import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { findingsForSession } from './diagnosis/runDiagnosis'
import type { Finding, TimeBrushRange, UrlRequestSummary } from './diagnosis/types'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useNetlogAnalysis } from './hooks/useNetlogAnalysis'
import {
  buildAppUrlHash,
  parseAppUrlState,
  type AppTab,
} from './model/appUrlState'
import { sanitizeAppUrlState } from './security/sanitizeUrlState'
import { exportFindingsJson, exportFindingsMarkdown } from './ui/exportFindings'
import { CompareView } from './ui/CompareView'
import { FindingsPanel } from './ui/FindingsPanel'
import { GlobalSearchPanel } from './ui/GlobalSearchPanel'
import { GuidePage } from './ui/GuidePage'
import { ImportPage } from './ui/ImportPage'
import { Overview } from './ui/Overview'
import { SessionDetail } from './ui/SessionDetail'
import { SessionsTable } from './ui/SessionsTable'

export default function App() {
  const { state, compareState, analyzeFile, analyzeCompareFile, clearCompare, reset } =
    useNetlogAnalysis()
  const [tab, setTab] = useState<AppTab>('overview')
  const [showGuide, setShowGuide] = useState(false)
  const [guideAnchor, setGuideAnchor] = useState<string | undefined>()
  const [selectedSessionId, setSelectedSessionId] = useState<number | undefined>()
  const [focusEventIndex, setFocusEventIndex] = useState<number | undefined>()
  const [selectedFindingId, setSelectedFindingId] = useState<string | undefined>()
  const [timeBrush, setTimeBrush] = useState<TimeBrushRange | null>(null)
  const [globalQuery, setGlobalQuery] = useState('')
  const compareInputRef = useRef<HTMLInputElement>(null)
  const urlHydratedRef = useRef(false)

  const analysis = state.status === 'ready' ? state.analysis : null
  const compareAnalysis =
    compareState.status === 'ready' ? compareState.analysis : null

  const syncUrl = useCallback(() => {
    if (!analysis) return
    const hash = buildAppUrlHash({
      tab,
      sessionId: selectedSessionId,
      eventIndex: focusEventIndex,
      findingId: selectedFindingId,
      brushStart: timeBrush?.startMs,
      brushEnd: timeBrush?.endMs,
      globalQuery: tab === 'search' ? globalQuery : undefined,
    })
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash)
    }
  }, [
    analysis,
    tab,
    selectedSessionId,
    focusEventIndex,
    selectedFindingId,
    timeBrush,
    globalQuery,
  ])

  useEffect(() => {
    if (!analysis || urlHydratedRef.current) return
    const parsed = sanitizeAppUrlState(parseAppUrlState(window.location.hash), analysis)
    if (parsed.tab) setTab(parsed.tab)
    if (parsed.sessionId !== undefined) setSelectedSessionId(parsed.sessionId)
    if (parsed.eventIndex !== undefined) setFocusEventIndex(parsed.eventIndex)
    if (parsed.findingId) setSelectedFindingId(parsed.findingId)
    if (parsed.brushStart !== undefined && parsed.brushEnd !== undefined) {
      setTimeBrush({ startMs: parsed.brushStart, endMs: parsed.brushEnd })
    }
    if (parsed.globalQuery) setGlobalQuery(parsed.globalQuery)
    urlHydratedRef.current = true
  }, [analysis])

  useEffect(() => {
    if (!analysis) return
    syncUrl()
  }, [analysis, syncUrl])

  function openGuide(anchor?: string) {
    setGuideAnchor(anchor)
    if (analysis) setTab('guide')
    else setShowGuide(true)
  }

  useEffect(() => {
    if (!guideAnchor) return
    if (analysis && tab !== 'guide') return
    if (!analysis && !showGuide) return
    const id = guideAnchor
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    return () => window.clearTimeout(t)
  }, [guideAnchor, tab, showGuide, analysis])

  const selectedSession = useMemo(() => {
    if (!analysis || selectedSessionId === undefined) return undefined
    return analysis.sessions.find((s) => s.id === selectedSessionId)
  }, [analysis, selectedSessionId])

  const sessionFindings = useMemo(() => {
    if (!analysis || selectedSessionId === undefined) return []
    return findingsForSession(analysis.findings, selectedSessionId)
  }, [analysis, selectedSessionId])

  const openSession = useCallback((sessionId: number, eventIndex?: number) => {
    setSelectedSessionId(sessionId)
    setTab('sessions')
    setFocusEventIndex(eventIndex)
  }, [])

  function openUrlRequest(req: UrlRequestSummary) {
    const sessionId = req.relatedSessionIds[0]
    if (sessionId !== undefined) {
      openSession(sessionId, req.evidenceEventIndex)
    }
  }

  function openSessionsTab(brush?: TimeBrushRange | null) {
    if (brush) setTimeBrush(brush)
    setTab('sessions')
  }

  const openFinding = useCallback((f: Finding) => {
    setSelectedFindingId(f.id)
    if (f.sessionId !== undefined) {
      setSelectedSessionId(f.sessionId)
      setTab('sessions')
    }
    if (f.evidenceEventIndexes[0] !== undefined) {
      setFocusEventIndex(f.evidenceEventIndexes[0])
    }
  }, [])

  useKeyboardShortcuts(Boolean(analysis), {
    onTab: setTab,
    onFocusSearch: () => setTab('search'),
  })

  if (!analysis) {
    if (showGuide) {
      return (
        <div className="app-shell app-shell--workspace">
          <header className="topbar">
            <div className="topbar-brand">
              <span className="brand">Netlog Lens</span>
              <span className="muted small">Guide</span>
            </div>
            <div className="topbar-actions">
              <button type="button" className="ghost" onClick={() => setShowGuide(false)}>
                Back to import
              </button>
            </div>
          </header>
          <main className="workspace">
            <GuidePage />
          </main>
        </div>
      )
    }

    return (
      <div className="app-shell">
        <ImportPage
          onFile={(file) => {
            void analyzeFile(file)
          }}
          busy={state.status === 'loading'}
          progress={state.status === 'loading' ? state.progress : undefined}
          error={state.status === 'error' ? state.message : undefined}
          onOpenGuide={() => setShowGuide(true)}
        />
      </div>
    )
  }

  return (
    <div className="app-shell app-shell--workspace">
      <header className="topbar">
        <div className="topbar-brand">
          <span className="brand">Netlog Lens</span>
          <span className="muted small file-name">{analysis.fileName}</span>
        </div>
        <nav className="tabs">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
            Overview
          </TabButton>
          <TabButton active={tab === 'sessions'} onClick={() => setTab('sessions')}>
            Sessions
          </TabButton>
          <TabButton active={tab === 'findings'} onClick={() => setTab('findings')}>
            Findings ({analysis.findings.length})
          </TabButton>
          <TabButton active={tab === 'search'} onClick={() => setTab('search')}>
            Search
          </TabButton>
          <TabButton active={tab === 'compare'} onClick={() => setTab('compare')}>
            Compare
          </TabButton>
          <TabButton active={tab === 'guide'} onClick={() => setTab('guide')}>
            Guide
          </TabButton>
        </nav>
        <div className="topbar-actions">
          <button
            type="button"
            onClick={() => exportFindingsMarkdown(analysis)}
            disabled={analysis.findings.length === 0}
          >
            Export MD
          </button>
          <button
            type="button"
            onClick={() => exportFindingsJson(analysis.findings, analysis.fileName)}
            disabled={analysis.findings.length === 0}
          >
            Export JSON
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              reset()
              setSelectedSessionId(undefined)
              setTimeBrush(null)
              setShowGuide(false)
              setTab('overview')
              setGlobalQuery('')
              urlHydratedRef.current = false
              window.history.replaceState(null, '', window.location.pathname)
            }}
          >
            New file
          </button>
        </div>
      </header>

      <p className="keyboard-hint muted small" aria-hidden="true">
        Shortcuts: <kbd>1</kbd>–<kbd>5</kbd> tabs · <kbd>g</kbd> guide · <kbd>/</kbd> search ·{' '}
        <kbd>j</kbd>/<kbd>k</kbd> timeline
      </p>

      <main className="workspace">
        {tab === 'overview' && (
          <Overview
            analysis={analysis}
            timeBrush={timeBrush}
            onTimeBrushChange={setTimeBrush}
            onOpenFindings={() => setTab('findings')}
            onSelectFinding={openFinding}
            onOpenSessions={openSessionsTab}
            onSelectSession={openSession}
            onSelectUrlRequest={openUrlRequest}
          />
        )}

        {tab === 'guide' && <GuidePage />}

        {tab === 'search' && (
          <GlobalSearchPanel
            analysis={analysis}
            query={globalQuery}
            onQueryChange={setGlobalQuery}
            onOpenSession={openSession}
            onOpenFinding={openFinding}
          />
        )}

        {tab === 'compare' && (
          <div className="compare-tab">
            <div className="toolbar compare-toolbar">
              <span className="muted small">
                Primary: <strong>{analysis.fileName}</strong>
              </span>
              <button
                type="button"
                className="ghost"
                onClick={() => compareInputRef.current?.click()}
              >
                Load comparison file
              </button>
              <input
                ref={compareInputRef}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void analyzeCompareFile(file)
                  e.target.value = ''
                }}
              />
              {compareState.status === 'loading' && (
                <span className="muted small">Parsing {compareState.fileName}…</span>
              )}
              {compareAnalysis && (
                <button type="button" className="linkish" onClick={clearCompare}>
                  Clear comparison
                </button>
              )}
            </div>
            {compareState.status === 'error' && (
              <p className="err-tag">{compareState.message}</p>
            )}
            {compareAnalysis ? (
              <CompareView analysisA={analysis} analysisB={compareAnalysis} />
            ) : (
              <p className="muted compare-empty">
                Load a second netlog JSON to diff findings, failed URLs, and session hosts against{' '}
                <strong>{analysis.fileName}</strong>.
              </p>
            )}
          </div>
        )}

        {tab === 'findings' && (
          <section className="panel">
            <div className="panel-head">
              <h2>All findings</h2>
            </div>
            <FindingsPanel
              findings={analysis.findings}
              selectedId={selectedFindingId}
              onSelect={openFinding}
            />
          </section>
        )}

        {tab === 'sessions' && (
          <div className="sessions-layout">
            <SessionsTable
              sessions={analysis.sessionSummaries}
              transferSessions={analysis.sessions}
              findings={analysis.findings}
              selectedId={selectedSessionId}
              timeBrush={timeBrush}
              onClearTimeBrush={() => setTimeBrush(null)}
              onSelect={(id) => {
                setSelectedSessionId(id)
                setFocusEventIndex(undefined)
              }}
            />
            {selectedSession ? (
              <SessionDetail
                session={selectedSession}
                findings={sessionFindings}
                fileName={analysis.fileName}
                focusEventIndex={focusEventIndex}
                onFocusFinding={openFinding}
                onOpenStreamGuide={(anchor) => openGuide(anchor)}
              />
            ) : (
              <p className="muted pick-hint">Select a session to inspect streams and timeline.</p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className={`tab${active ? ' tab--active' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}

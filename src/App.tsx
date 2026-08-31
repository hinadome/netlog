import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { findingsForSession } from './diagnosis/runDiagnosis'
import type { Finding } from './diagnosis/types'
import { useNetlogAnalysis } from './hooks/useNetlogAnalysis'
import { exportFindingsJson, exportFindingsMarkdown } from './ui/exportFindings'
import { FindingsPanel } from './ui/FindingsPanel'
import { GuidePage } from './ui/GuidePage'
import { ImportPage } from './ui/ImportPage'
import { Overview } from './ui/Overview'
import { SessionDetail } from './ui/SessionDetail'
import { SessionsTable } from './ui/SessionsTable'

type Tab = 'overview' | 'sessions' | 'findings' | 'guide'

export default function App() {
  const { state, analyzeFile, reset } = useNetlogAnalysis()
  const [tab, setTab] = useState<Tab>('overview')
  const [showGuide, setShowGuide] = useState(false)
  const [guideAnchor, setGuideAnchor] = useState<string | undefined>()
  const [selectedSessionId, setSelectedSessionId] = useState<number | undefined>()
  const [focusEventIndex, setFocusEventIndex] = useState<number | undefined>()
  const [selectedFindingId, setSelectedFindingId] = useState<string | undefined>()

  const analysis = state.status === 'ready' ? state.analysis : null

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

  function openFinding(f: Finding) {
    setSelectedFindingId(f.id)
    if (f.sessionId !== undefined) {
      setSelectedSessionId(f.sessionId)
      setTab('sessions')
    }
    if (f.evidenceEventIndexes[0] !== undefined) {
      setFocusEventIndex(f.evidenceEventIndexes[0])
    }
  }

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
              setShowGuide(false)
              setTab('overview')
            }}
          >
            New file
          </button>
        </div>
      </header>

      <main className="workspace">
        {tab === 'overview' && (
          <Overview
            analysis={analysis}
            onOpenFindings={() => setTab('findings')}
            onOpenSessions={() => setTab('sessions')}
          />
        )}

        {tab === 'guide' && <GuidePage />}

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
              selectedId={selectedSessionId}
              onSelect={(id) => {
                setSelectedSessionId(id)
                setFocusEventIndex(undefined)
              }}
            />
            {selectedSession ? (
              <SessionDetail
                session={selectedSession}
                findings={sessionFindings}
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

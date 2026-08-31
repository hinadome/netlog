import type { ParseProgress } from '../parser/readNetlog'

interface Props {
  onFile: (file: File) => void
  progress?: ParseProgress
  error?: string
  busy?: boolean
  onOpenGuide?: () => void
}

export function ImportPage({ onFile, progress, error, busy, onOpenGuide }: Props) {
  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (file) onFile(file)
  }

  return (
    <div className="import-page">
      <header className="brand-block">
        <p className="brand">Netlog Lens</p>
        <h1>HTTP/2 & HTTP/3 session analysis</h1>
        <p className="lede">
          Open a Chromium net-export capture to reconstruct sessions, highlight protocol errors, and
          jump from findings to evidence — entirely in your browser.
        </p>
      </header>

      <label
        className={`dropzone${busy ? ' dropzone--busy' : ''}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (!busy) handleFiles(e.dataTransfer.files)
        }}
      >
        <input
          type="file"
          accept=".json,application/json"
          disabled={busy}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <span className="dropzone-title">Drop netlog JSON here</span>
        <span className="dropzone-sub">or click to choose a file from disk</span>
      </label>

      {busy && progress && (
        <div className="progress-panel" role="status">
          <div className="progress-bar">
            <div className="progress-bar-fill" style={{ width: `${progress.percent}%` }} />
          </div>
          <p>
            {progress.message}{' '}
            <span className="muted">({progress.percent}%)</span>
          </p>
        </div>
      )}

      {error && <p className="error-banner">{error}</p>}

      <aside className="privacy-note">
        <strong>Privacy:</strong> files never leave this device. Parsing runs locally in a Web Worker.
        Prefer Chrome&apos;s <code>Strip private information</code> / <code>Strip cookies</code> when
        capturing. Start a log at <code>chrome://net-export</code>, reproduce the issue, then stop and
        save.
      </aside>

      {onOpenGuide && (
        <p className="guide-link-row">
          <button type="button" className="linkish" onClick={onOpenGuide}>
            How netlogs &amp; session IDs work →
          </button>
        </p>
      )}
    </div>
  )
}

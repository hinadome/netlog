import { useMemo, useState } from 'react'
import type { SessionSummary } from '../diagnosis/types'

interface Props {
  sessions: SessionSummary[]
  selectedId?: number
  onSelect: (id: number) => void
}

export function SessionsTable({ sessions, selectedId, onSelect }: Props) {
  const [queryFilter, setQueryFilter] = useState('')
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [proto, setProto] = useState<'all' | 'h2' | 'h3'>('all')

  const filtered = useMemo(() => {
    const q = queryFilter.trim().toLowerCase()
    return sessions.filter((s) => {
      if (errorsOnly && !s.hasError) return false
      if (proto !== 'all' && s.protocol !== proto) return false
      if (q) {
        const hostMatch = s.host.toLowerCase().includes(q)
        const pathMatch = s.paths.some((p) => p.toLowerCase().includes(q))
        if (!hostMatch && !pathMatch) return false
      }
      return true
    })
  }, [sessions, queryFilter, errorsOnly, proto])

  return (
    <div className="sessions-table">
      <div className="toolbar">
        <input
          type="search"
          placeholder="Filter host or path…"
          value={queryFilter}
          onChange={(e) => setQueryFilter(e.target.value)}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(e) => setErrorsOnly(e.target.checked)}
          />
          Errors only
        </label>
        <select value={proto} onChange={(e) => setProto(e.target.value as 'all' | 'h2' | 'h3')}>
          <option value="all">All protocols</option>
          <option value="h2">HTTP/2</option>
          <option value="h3">HTTP/3 / QUIC</option>
        </select>
        <span className="muted small">{filtered.length} sessions</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Proto</th>
              <th>Host</th>
              <th>Streams</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr
                key={s.id}
                className={selectedId === s.id ? 'selected' : undefined}
                onClick={() => onSelect(s.id)}
              >
                <td>{s.id}</td>
                <td>
                  <span className={`badge badge-${s.protocol}`}>{s.protocol}</span>
                </td>
                <td className="host-cell" title={s.host}>
                  {s.host}
                </td>
                <td>{s.streamCount}</td>
                <td>{formatDuration(s.endTimeMs - s.startTimeMs)}</td>
                <td>{s.hasError ? <span className="err-tag">error</span> : 'ok'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

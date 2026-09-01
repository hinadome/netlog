import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  describeEvent,
  eventStreamId,
  isNoiseEvent,
} from '../model/eventCatalog'
import { isActionableErrorEvent } from '../model/sessionIssues'
import { matchesH3KindFilter, type H3StreamKindFilter } from '../model/streamKind'
import {
  buildEventStory,
  buildTimelineRows,
  formatGapDuration,
  type EventStoryMeta,
  type TimelineRow,
} from '../model/eventLinks'
import type { Finding } from '../diagnosis/types'
import type { NetlogEvent } from '../parser/types'

export type TimelineDensity = 'errors' | 'signal' | 'all'

interface Props {
  events: NetlogEvent[]
  findings: Finding[]
  protocol?: 'h2' | 'h3'
  highlightIndexes: Set<number>
  selectedIndex?: number
  onSelect: (ev: NetlogEvent) => void
  baseTimeMs: number
  streamFilter?: number | 'all'
  onStreamFilterChange?: (v: number | 'all') => void
  availableStreams?: number[]
  gapMs?: number
  firstErrorIndex?: number
  onJumpToIndex?: (eventIndex: number) => void
}

export function Timeline({
  events,
  findings,
  protocol,
  highlightIndexes,
  selectedIndex,
  onSelect,
  baseTimeMs,
  streamFilter: streamFilterProp,
  onStreamFilterChange,
  availableStreams,
  gapMs = 1000,
  firstErrorIndex,
  onJumpToIndex,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [density, setDensity] = useState<TimelineDensity>('signal')
  const [localStream, setLocalStream] = useState<number | 'all'>('all')
  const [h3KindFilter, setH3KindFilter] = useState<H3StreamKindFilter>('all')
  const [showGaps, setShowGaps] = useState(true)
  const [query, setQuery] = useState('')
  const [searchAllEvents, setSearchAllEvents] = useState(false)

  const streamFilter = streamFilterProp ?? localStream
  const setStreamFilter = (v: number | 'all') => {
    onStreamFilterChange?.(v)
    if (streamFilterProp === undefined) setLocalStream(v)
  }

  const story = useMemo(() => buildEventStory(events, findings), [events, findings])
  const needle = query.trim().toLowerCase()

  const streams = useMemo(() => {
    if (availableStreams && availableStreams.length) {
      return availableStreams.filter((id) => id >= 0)
    }
    const ids = new Set<number>()
    for (const ev of events) {
      const sid = eventStreamId(ev)
      if (sid !== undefined && sid >= 0) ids.add(sid)
    }
    return [...ids].sort((a, b) => a - b)
  }, [events, availableStreams])

  const filteredEvents = useMemo(() => {
    const scopeEntireSession = Boolean(searchAllEvents && needle)

    return events.filter((ev) => {
      // Search all → entire session (ignore stream chip + density).
      if (!scopeEntireSession) {
        if (streamFilter !== 'all' && eventStreamId(ev) !== streamFilter) return false

        if (protocol === 'h3' && h3KindFilter !== 'all') {
          if (!matchesH3KindFilter(eventStreamId(ev), h3KindFilter)) return false
        }

        if (density === 'errors') {
          const actionable = isActionableErrorEvent(ev)
          if (!(actionable || highlightIndexes.has(ev.index))) return false
        } else if (density === 'signal') {
          if (!( !isNoiseEvent(ev) || highlightIndexes.has(ev.index))) return false
        }
      }

      if (needle && !eventMatchesQuery(ev, needle, protocol)) return false
      return true
    })
  }, [events, streamFilter, density, highlightIndexes, needle, searchAllEvents, protocol, h3KindFilter])

  const rows: TimelineRow[] = useMemo(() => {
    const built = buildTimelineRows(filteredEvents, story, gapMs)
    if (showGaps) return built
    return built.filter((r) => r.kind === 'event')
  }, [filteredEvents, story, gapMs, showGaps])

  const eventRowIndexes = useMemo(
    () =>
      rows
        .filter((r): r is Extract<TimelineRow, { kind: 'event' }> => r.kind === 'event')
        .map((r) => r.event.index),
    [rows],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      if (selectedIndex === undefined || !onJumpToIndex) return
      const pos = eventRowIndexes.indexOf(selectedIndex)
      if (pos < 0) return
      if (e.key === 'j') {
        e.preventDefault()
        const next = eventRowIndexes[pos + 1]
        if (next !== undefined) onJumpToIndex(next)
      } else if (e.key === 'k') {
        e.preventDefault()
        const prev = eventRowIndexes[pos - 1]
        if (prev !== undefined) onJumpToIndex(prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIndex, eventRowIndexes, onJumpToIndex])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i]?.kind === 'gap' ? 36 : 54),
    overscan: 14,
  })

  const highlightPos = useMemo(() => {
    if (selectedIndex === undefined) return -1
    return rows.findIndex((r) => r.kind === 'event' && r.event.index === selectedIndex)
  }, [rows, selectedIndex])

  useEffect(() => {
    if (highlightPos >= 0) {
      virtualizer.scrollToIndex(highlightPos, { align: 'center' })
    }
  }, [highlightPos, virtualizer])

  return (
    <div className="timeline-shell">
      <div className="timeline-toolbar">
        <div className="timeline-search">
          <input
            type="search"
            className="timeline-search-input"
            placeholder="Search type, title, params…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search timeline events"
          />
          {query && (
            <button type="button" className="linkish timeline-search-clear" onClick={() => setQuery('')}>
              Clear
            </button>
          )}
        </div>
        <label
          className="check gap-toggle"
          title="Search the whole session: ignore Hide noise / Errors and the stream chip"
        >
          <input
            type="checkbox"
            checked={searchAllEvents}
            onChange={(e) => setSearchAllEvents(e.target.checked)}
          />
          Search all
        </label>
        {searchAllEvents && needle && streamFilter !== 'all' && (
          <span className="muted small">Ignoring stream {streamFilter} filter</span>
        )}
        <div className="timeline-density" role="group" aria-label="Event density">
          <DensityBtn active={density === 'errors'} onClick={() => setDensity('errors')}>
            Errors
          </DensityBtn>
          <DensityBtn active={density === 'signal'} onClick={() => setDensity('signal')}>
            Hide noise
          </DensityBtn>
          <DensityBtn active={density === 'all'} onClick={() => setDensity('all')}>
            All
          </DensityBtn>
        </div>
        {firstErrorIndex !== undefined && onJumpToIndex && (
          <button
            type="button"
            className="linkish timeline-first-err"
            onClick={() => onJumpToIndex(firstErrorIndex)}
          >
            First error (#{firstErrorIndex})
          </button>
        )}
        {protocol === 'h3' && (
          <div className="timeline-h3-filter" role="group" aria-label="HTTP/3 stream kind">
            <span className="muted small">H3</span>
            <DensityBtn active={h3KindFilter === 'all'} onClick={() => setH3KindFilter('all')}>
              All
            </DensityBtn>
            <DensityBtn
              active={h3KindFilter === 'requests'}
              onClick={() => setH3KindFilter('requests')}
            >
              Requests
            </DensityBtn>
            <DensityBtn
              active={h3KindFilter === 'control'}
              onClick={() => setH3KindFilter('control')}
            >
              Control
            </DensityBtn>
          </div>
        )}
        <label className="check gap-toggle">
          <input
            type="checkbox"
            checked={showGaps}
            onChange={(e) => setShowGaps(e.target.checked)}
          />
          Idle gaps
        </label>
        <div className="timeline-streams">
          <span className="muted small">Stream</span>
          <button
            type="button"
            className={`stream-chip${streamFilter === 'all' ? ' stream-chip--on' : ''}`}
            onClick={() => setStreamFilter('all')}
          >
            All
          </button>
          {streams.slice(0, 24).map((id) => (
            <button
              key={id}
              type="button"
              className={`stream-chip${streamFilter === id ? ' stream-chip--on' : ''}`}
              onClick={() => setStreamFilter(id)}
            >
              {id}
            </button>
          ))}
          {streams.length > 24 && <span className="muted small">+{streams.length - 24}</span>}
        </div>
        <span className="muted small timeline-count">
          {needle
            ? `${filteredEvents.length} match${filteredEvents.length === 1 ? '' : 'es'} · ${events.length} total`
            : `${filteredEvents.length} / ${events.length}`}
        </span>
      </div>

      <div className="timeline" ref={parentRef}>
        {rows.length === 0 ? (
          <p className="muted timeline-empty">
            {needle
              ? `No events match “${query.trim()}”.${
                  searchAllEvents ? '' : ' Try enabling Search all.'
                }`
              : 'No events match these filters.'}
          </p>
        ) : (
          <div
            className="timeline-inner"
            style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
          >
            {virtualizer.getVirtualItems().map((row) => {
              const item = rows[row.index]
              if (item.kind === 'gap') {
                return (
                  <div
                    key={item.id}
                    className="timeline-gap"
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${row.size}px`,
                      transform: `translateY(${row.start}px)`,
                    }}
                    title={`Idle ${formatGapDuration(item.deltaMs)} between events`}
                  >
                    <span className="timeline-gap-line" />
                    <span className="timeline-gap-label">
                      {formatGapDuration(item.deltaMs)} idle — possible stall / wait
                    </span>
                    <span className="timeline-gap-line" />
                  </div>
                )
              }

              const ev = item.event
              const desc = describeEvent(ev, { protocol })
              const hl = highlightIndexes.has(ev.index)
              const sel = selectedIndex === ev.index
              return (
                <button
                  type="button"
                  key={ev.index}
                  className={`timeline-row severity-row-${desc.severity}${hl ? ' timeline-row--hl' : ''}${sel ? ' timeline-row--sel' : ''}`}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${row.size}px`,
                    transform: `translateY(${row.start}px)`,
                  }}
                  onClick={() => onSelect(ev)}
                >
                  <span className="t-st">+{Math.round(ev.timeMs - baseTimeMs)}</span>
                  <span className="t-main">
                    <span className={`t-title type-${desc.category}`}>{desc.title}</span>
                    <span className="t-sum muted">{desc.summary}</span>
                  </span>
                  <RoleBadges meta={item.meta} finding={hl} />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function eventMatchesQuery(
  ev: NetlogEvent,
  needle: string,
  protocol?: 'h2' | 'h3',
): boolean {
  if (ev.type.toLowerCase().includes(needle)) return true
  if (String(ev.index).includes(needle)) return true
  const desc = describeEvent(ev, { protocol })
  if (desc.title.toLowerCase().includes(needle)) return true
  if (desc.summary.toLowerCase().includes(needle)) return true
  if (desc.meaning.toLowerCase().includes(needle)) return true
  try {
    if (JSON.stringify(ev.params).toLowerCase().includes(needle)) return true
  } catch {
    /* ignore */
  }
  return false
}

function RoleBadges({ meta, finding }: { meta: EventStoryMeta; finding: boolean }) {
  const badges: Array<{ key: string; label: string; className: string }> = []
  if (meta.roles.includes('cause')) badges.push({ key: 'cause', label: 'cause', className: 't-badge t-badge--cause' })
  if (meta.roles.includes('follow-up')) {
    badges.push({ key: 'follow', label: 'follow-up', className: 't-badge t-badge--follow' })
  }
  if (finding || meta.roles.includes('finding')) {
    badges.push({ key: 'finding', label: 'finding', className: 't-badge' })
  }
  if (badges.length === 0) return <span className="t-badges-spacer" />
  return (
    <span className="t-badges">
      {badges.map((b) => (
        <span key={b.key} className={b.className}>
          {b.label}
        </span>
      ))}
    </span>
  )
}

function DensityBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className={`density-btn${active ? ' density-btn--on' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}

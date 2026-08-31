import { useMemo, useState } from 'react'
import type { Finding } from '../diagnosis/types'
import { describeEvent, eventStreamId, type DescribedEvent } from '../model/eventCatalog'
import {
  buildEventStory,
  emptyMeta,
  type EventStoryMeta,
  type RelatedLink,
} from '../model/eventLinks'
import { classifyStreamId, type ProtocolKind } from '../model/streamKind'
import type { NetlogEvent } from '../parser/types'

interface Props {
  event: NetlogEvent | undefined
  events: NetlogEvent[]
  protocol?: ProtocolKind
  baseTimeMs: number
  findings: Finding[]
  onJumpToEvent: (eventIndex: number) => void
  onOpenStreamGuide?: () => void
}

export function EventInspector({
  event,
  events,
  protocol,
  baseTimeMs,
  findings,
  onJumpToEvent,
  onOpenStreamGuide,
}: Props) {
  const [showRaw, setShowRaw] = useState(false)

  const story = useMemo(() => buildEventStory(events, findings), [events, findings])
  const byIndex = useMemo(() => new Map(events.map((e) => [e.index, e])), [events])

  const described: DescribedEvent | undefined = useMemo(
    () => (event ? describeEvent(event, { protocol }) : undefined),
    [event, protocol],
  )

  const meta: EventStoryMeta = event ? (story.get(event.index) ?? emptyMeta()) : emptyMeta()

  const relatedFindings = useMemo(() => {
    if (!event) return []
    return findings.filter((f) => f.evidenceEventIndexes.includes(event.index))
  }, [event, findings])

  const streamType = useMemo(() => {
    if (!event || !protocol) return null
    const sid = eventStreamId(event)
    if (sid === undefined) return null
    return classifyStreamId(protocol, sid)
  }, [event, protocol])

  if (!event || !described) {
    return (
      <aside className="event-inspector">
        <p className="muted">Select an event to see what it means.</p>
      </aside>
    )
  }

  return (
    <aside className={`event-inspector severity-border-${described.severity}`}>
      <div className="inspector-head">
        <span className={`sev sev-inline severity-${described.severity}`}>{described.severity}</span>
        <span className="inspector-cat">{described.category}</span>
        {meta.roles.map((r) => (
          <span key={r} className={`t-badge ${roleClass(r)}`}>
            {r}
          </span>
        ))}
      </div>
      <h4>{described.title}</h4>
      <p className="muted small inspector-rawtype" title={event.type}>
        {event.type}
      </p>
      <p className="muted small">
        +{Math.round(event.timeMs - baseTimeMs)} ms · phase {event.phase} · event #{event.index}
        {described.streamId !== undefined ? ` · stream ${described.streamId}` : ''}
      </p>

      {streamType && (
        <section className="inspector-block">
          <h5>Stream type ({protocol === 'h3' ? 'HTTP/3' : 'HTTP/2'})</h5>
          <p>
            <span className={`stream-kind stream-kind--${streamType.initiator}`}>
              {streamType.label}
            </span>
          </p>
          <p className="inspector-stream-blurb">{streamType.blurb}</p>
          <p className="muted small">
            {streamType.streamId < 0 ? (
              <>
                Netlog sentinel <code>stream_id = {streamType.streamId}</code> — not a real
                request stream.
              </>
            ) : protocol === 'h3' ? (
              <>
                Encoded by <code>stream_id % 4 = {streamType.typeBits}</code>.
              </>
            ) : (
              <>
                HTTP/2 rule: odd = client (local), even = server (peer), <code>0</code> = connection.
              </>
            )}{' '}
            {onOpenStreamGuide && (
              <button type="button" className="linkish" onClick={onOpenStreamGuide}>
                Learn more
              </button>
            )}
          </p>
        </section>
      )}

      <section className="inspector-block">
        <h5>What happened</h5>
        <p>{described.meaning}</p>
        {described.summary !== described.meaning && (
          <p className="inspector-summary">{described.summary}</p>
        )}
      </section>

      <section className="inspector-block">
        <h5>Why it matters</h5>
        <p>{described.whyItMatters}</p>
      </section>

      {meta.links.length > 0 && (
        <section className="inspector-block">
          <h5>Related events</h5>
          <ul className="inspector-related">
            {meta.links.map((link) => (
              <RelatedRow
                key={`${link.relation}-${link.targetIndex}`}
                link={link}
                target={byIndex.get(link.targetIndex)}
                protocol={protocol}
                baseTimeMs={baseTimeMs}
                onJump={() => onJumpToEvent(link.targetIndex)}
              />
            ))}
          </ul>
        </section>
      )}

      {relatedFindings.length > 0 && (
        <section className="inspector-block">
          <h5>Linked findings</h5>
          <ul className="inspector-findings">
            {relatedFindings.map((f) => (
              <li key={f.id}>
                <span className={`sev sev-inline severity-${f.severity}`}>{f.severity}</span>
                {f.title}
              </li>
            ))}
          </ul>
        </section>
      )}

      {described.keyFields.length > 0 && (
        <section className="inspector-block">
          <h5>Key fields</h5>
          <dl className="inspector-fields">
            {described.keyFields.map((f) => (
              <div key={f.label} className="inspector-field">
                <dt>{f.label}</dt>
                <dd title={f.value}>{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="inspector-block">
        <button type="button" className="linkish raw-toggle" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? 'Hide raw params' : 'Show raw params'}
        </button>
        {showRaw && <pre>{JSON.stringify(event.params, null, 2)}</pre>}
      </section>
    </aside>
  )
}

function roleClass(role: string): string {
  if (role === 'cause') return 't-badge--cause'
  if (role === 'follow-up') return 't-badge--follow'
  return ''
}

function RelatedRow({
  link,
  target,
  protocol,
  baseTimeMs,
  onJump,
}: {
  link: RelatedLink
  target: NetlogEvent | undefined
  protocol?: ProtocolKind
  baseTimeMs: number
  onJump: () => void
}) {
  const title = target ? describeEvent(target, { protocol }).title : `Event #${link.targetIndex}`
  const relLabel =
    link.relation === 'caused'
      ? 'Led to'
      : link.relation === 'followed_by'
        ? 'Followed by'
        : link.relation === 'preceded_by'
          ? 'Preceded by'
          : 'Same finding'

  return (
    <li>
      <button type="button" className="related-jump" onClick={onJump}>
        <span className="related-rel">{relLabel}</span>
        <span className="related-title">{title}</span>
        <span className="muted small related-meta">
          {target
            ? `+${Math.round(target.timeMs - baseTimeMs)} ms · #${target.index}`
            : `#${link.targetIndex}`}
        </span>
        <span className="related-hint">{link.label}</span>
      </button>
    </li>
  )
}

# Sessions

Main investigation workspace: session list + selected session detail.

## Layout

```
┌─────────────────┬──────────────────────────────────────────┐
│ Sessions table  │ Session detail                           │
│ (filters)       │ header · SETTINGS/GOAWAY · flow sparkline│
│                 │ transport · streams · findings           │
│                 │ lifecycle bars · timeline + inspector    │
└─────────────────┴──────────────────────────────────────────┘
```

Selecting a row loads that session on the right. Selecting a finding (from Findings or the session side panel) can open this tab, select the session, and focus the evidence event.

When you set a time **brush** on Overview swimlanes, the Sessions list respects the same range until you clear it.

---

## Session list

### Filters

| Control | Effect |
|---------|--------|
| **Filter host or path…** | Case-insensitive substring on host **or** any request path on a stream in that session |
| **Errors only** | Sessions with **actionable** errors only (see [below](#errors-only-vs-timeline)) — same rule as Overview swimlanes |
| **All / HTTP/2 / HTTP/3** | Protocol filter |
| Time brush | When set from Overview, only sessions overlapping the brushed range |
| Count | `Showing X of Y` — with Errors only, `Y` is the actionable-error count |

**Examples**

| Query | Matches |
|-------|---------|
| `example.com` | Sessions whose host contains `example.com` |
| `/login` | Sessions with any stream whose path contains `/login` |
| `api` | Host or path containing `api` (e.g. `api.example.com` or `/v1/api/foo`) |

Paths are collected from request headers on streams (`:path`) when the netlog is analyzed. They are not shown as a table column — only used for filtering. After deploying a new build, reload your netlog JSON in the browser so analysis includes `paths` for filtering.

### Columns

| Column | Content |
|--------|---------|
| ID | Chromium `source.id` for the session |
| Proto | `h2` or `h3` badge |
| Host | Negotiated / inferred host |
| Streams | Stream count from model |
| Duration | `end − start` session times |
| Status | `error` · `warning` · `ok` (see below) |

| Status | Meaning |
|--------|---------|
| **error** | Qualifies for **Errors only** — critical/error finding or actionable protocol event |
| **warning** | Softer signal: internal `hasError` and/or warning findings (flow control, PING, etc.) — **not** included in Errors only |
| **ok** | No actionable or warning-level issues |

**Session ID ≠ stream ID.** Session ID is Chrome’s source object id; stream IDs live in `params.stream_id` inside that session. See [Guide](guide.md).

---

## Errors only vs timeline

**Errors only** (here and on Overview swimlanes) uses one shared rule in `sessionIssues.ts`:

1. **Critical or error findings** on the session, **or**
2. At least one **actionable protocol event** — an error-like catalog event that is **not** benign control flow.

**Excluded (benign):**

| Event / code | Why excluded |
|--------------|--------------|
| `QUIC_SESSION_CLOSED` | Normal connection end |
| RST / reset with `NO_ERROR`, `CANCEL`, code **0** or **8** | Normal close or navigation cancel |
| Benign `GOAWAY` / `HTTP2_SESSION_CLOSE` | Ok net error / NO_ERROR |

**Not used for Errors only:** `summary.hasError` alone (it used to include every QUIC close and every RST).

**Timeline alignment:** Session detail → **Errors** density shows the same class of protocol events (plus finding evidence). Default **Hide noise** still hides routine WINDOW_UPDATE / ping chatter — so use **All** or **Search all** if you need to see everything.

If a session appears under Errors only, you should see at least one critical/error finding marker or a red-styled event under timeline **Errors**. If not, file a bug with the session id.

---

## Session detail

### Header

- Protocol badge, session id, host
- Meta: `source.id`, stream = `params.stream_id`, optional QUIC version / proxy / session error
- **Stream kind chips** (counts):
  - **HTTP/2:** Requests / Local / Peer / Conn (odd = client, even = peer, `0` = connection)
  - **HTTP/3:** Requests / Local uni / Peer uni / Peer bidi (`stream_id % 4`)
- Links into Guide sections for stream ID teaching
- **Export session MD** — narrative markdown for this session and its findings

Negative `stream_id` values (e.g. `-1`) are Chromium sentinels (often connection-level), not real request streams — they are classified as connection/unset and are not listed as normal stream rows.

### SETTINGS & GOAWAY

Shows negotiated ALPN when known, sent vs received HTTP/2 SETTINGS (mismatches highlighted), and GOAWAY frames. Jump links open the related event in the timeline/inspector.

### Flow-control window

Sparkline of `WINDOW_UPDATE` / window-size samples over the session (shown when there are at least two points).

**Jump to first window update** selects the first sample’s event, scrolls the **Event timeline** into view, and focuses that row in the inspector.

Because `WINDOW_UPDATE` is **noise** under default **Hide noise**, the jump automatically switches density to **All** (and clears a conflicting stream filter) so the target is visible. External jumps from SETTINGS/GOAWAY, findings, and **First error** use the same reveal behavior when the selected event would otherwise be filtered out.

### Transport model

Teaching panel for shared fate:

- **HTTP/2:** many streams share one TCP+TLS pipe → head-of-line risk
- **HTTP/3:** streams are independent on one QUIC connection

May show a fate note (e.g. GOAWAY, connection close, many errored streams). **Why this matters** opens Guide → transport model.

### Streams table

| Column | Meaning |
|--------|---------|
| ID | Protocol stream id |
| Kind | Local/peer/request/uni/… label |
| Request | Method + path (truncated; full in title) |
| Status | HTTP status if known |
| Bytes | Sent / received |
| RST | Reset error string if any |

**Click a row** to filter the timeline to that stream; click again (or **Clear stream N filter**) to show all streams.

### Stream lifecycle bars

Compact per-stream timeline: phases such as open, data, close, or RST. Errored streams are highlighted. Click a bar to filter the event timeline to that stream.

### Session findings

Compact list of findings for this session only. Clicking a finding:

1. Focuses the first evidence event in the timeline/inspector
2. Optionally sets the stream filter to the finding’s `streamId`

---

## Event timeline

Virtualized list of session events (plain-language titles from the event catalog).

### Search

| Control | Behavior |
|---------|----------|
| Search box | Matches event type, title, summary, and params (case-insensitive) |
| **Search all** | With a non-empty query: search the **whole session**, ignoring density (**Hide noise** / **Errors**) **and** the stream chip |
| Hint | When Search all bypasses a stream chip, UI notes that the stream filter is ignored |
| Clear | Clears the query |

Without Search all, search only runs on events that already pass density + stream filters.

### Density

| Mode | Shows |
|------|--------|
| **Errors** | Actionable error-like events and finding evidence (benign closes/CANCEL excluded) |
| **Hide noise** (default) | Non-noise events + evidence (hides routine noise such as many WINDOW_UPDATE / ping chatter) |
| **All** | Every event in scope |

### Other controls

- **First error** — jump to the first actionable error event in this session (when any)
- **j / k** — next / previous visible event (when a row is selected)
- **Idle gaps** — insert markers when consecutive visible events are far apart (default gap threshold ~1s)
- **Stream chips** — filter to one stream id (same state as streams table)
- **H3 Requests / Control** — when protocol is HTTP/3, filter by stream kind
- Finding evidence events are highlighted; selecting scrolls the virtual list to that row

Each row shows relative time (`+N ms` from session start), severity styling, cause/follow-up badges when the story graph links events, and optional finding badges.

---

## Event inspector

Annotated view of the selected timeline event (not raw JSON by default).

### Sections

| Block | Content |
|-------|---------|
| Header | Severity, category, story roles (e.g. FINDING) |
| Title / type | Catalog title + raw Chromium type name |
| Meta | `+ms`, phase (`BEGIN` / `END` / `NONE`), **event #index**, stream |
| Stream type | H2/H3 classification + blurb; sentinel `-1` called out |
| What happened | Human summary + key bits from params |
| Why it matters | Severity-oriented guidance |
| Related events | Preceded by / follow-ups with jump links |
| Linked findings | Findings that cite this event index |
| Key fields | Stream, error codes, etc. |
| Raw | Optional toggle for the underlying event object |

**event #N** is the 0-based index in the file’s `.events` array — use it with `jq` (see [README](../README.md#extracting-a-raw-event-with-jq)).

---

## Related

- [Findings](findings.md) — global list that jumps here
- [Guide](guide.md) — IDs, H2 vs H3, transport, error semantics
- [Overview](overview.md) — swimlanes, URL requests, time brush

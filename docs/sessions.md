# Sessions

Main investigation workspace: session list + selected session detail.

## Layout

```
┌─────────────────┬──────────────────────────────────────────┐
│ Sessions table  │ Session detail                           │
│ (filters)       │ header · transport · streams · findings  │
│                 │ timeline + event inspector               │
└─────────────────┴──────────────────────────────────────────┘
```

Selecting a row loads that session on the right. Selecting a finding (from Findings or the session side panel) can open this tab, select the session, and focus the evidence event.

---

## Session list

### Filters

| Control | Effect |
|---------|--------|
| **Filter host or path…** | Case-insensitive substring on host **or** any request path on a stream in that session |
| **Errors only** | Keep sessions with `hasError` |
| **All / HTTP/2 / HTTP/3** | Protocol filter |
| Count | Number of sessions matching filters |

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
| Status | `error` tag or `ok` |

**Session ID ≠ stream ID.** Session ID is Chrome’s source object id; stream IDs live in `params.stream_id` inside that session. See [Guide](guide.md).

---

## Session detail

### Header

- Protocol badge, session id, host
- Meta: `source.id`, stream = `params.stream_id`, optional QUIC version / proxy / session error
- **Stream kind chips** (counts):
  - **HTTP/2:** Requests / Local / Peer / Conn (odd = client, even = peer, `0` = connection)
  - **HTTP/3:** Requests / Local uni / Peer uni / Peer bidi (`stream_id % 4`)
- Links into Guide sections for stream ID teaching

Negative `stream_id` values (e.g. `-1`) are Chromium sentinels (often connection-level), not real request streams — they are classified as connection/unset and are not listed as normal stream rows.

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
| **Errors** | Error-like events and finding evidence |
| **Hide noise** (default) | Non-noise events + evidence (hides routine noise such as many WINDOW_UPDATE / ping chatter) |
| **All** | Every event in scope |

### Other controls

- **Idle gaps** — insert markers when consecutive visible events are far apart (default gap threshold ~1s)
- **Stream chips** — filter to one stream id (same state as streams table)
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
- [Guide](guide.md) — IDs, H2 vs H3, transport
- [Overview](overview.md) — high-level counts

# Application Concept

Why **Netlog Lens** builds analysis from the **event stream**, how that differs from [Chromium’s NetLog Viewer](https://netlog-viewer.appspot.com/), and what you should expect to see in each tool.

---

## Purpose

Netlog Lens is for **investigating HTTP/2 and HTTP/3 failures** in a Chromium net-export: reconstruct protocol sessions, surface findings with evidence, and jump to timelines — entirely in the browser.

It is **not** a full clone of `netlog-viewer.appspot.com`. That viewer mirrors much of historical `chrome://net-internals` (DNS cache, socket pools, live session tables, Reporting, etc.). Lens keeps **events as the primary evidence trail**, then **enriches HTTP/2 sessions** from Chrome’s end-of-capture `polledData` snapshot when present.

---

## What Netlog Lens shows

| Area | Source of truth | Notes |
|------|-----------------|--------|
| **Sessions** | Events whose `source.type` is `HTTP2_SESSION` or `QUIC_SESSION`, grouped by `source.id` | Session ID = Chromium source id |
| **HTTP/2 snapshot (Phase 1)** | `polledData.spdySessionInfo` merged by `source_id` | **Events**, **Both** (events + snapshot), or **Snap** (snapshot-only) |
| **Streams / timeline / SETTINGS / flow-control** | Events on that session source (`params.stream_id`, frame types, …) | Hidden for snapshot-only rows (no event stream) |
| **URL requests** | `URL_REQUEST` (and related) sources, correlated where possible | Overview tables / waterfall / retries — not listed as protocol “Sessions” |
| **Findings / Errors only / swimlanes** | Event-derived sessions only | Snapshot-only rows are excluded from diagnosis and swimlanes |
| **DNS / alt-svc / socket pools / queued reports** | Not modeled today | Separate Net info (future); not mixed into Sessions |
| **QUIC polledData** | Not merged yet | Appspot QUIC table uses `quicInfo.sessions` (often `connection_id`, not `source_id`) |

If appspot’s **HTTP/2** page lists sessions that Lens hides by default, enable **Snapshot-only** on Sessions. If those ids still have no events, they are **Snap** rows from `polledData` (see jq below). QUIC snapshot merge is not in Phase 1.

---

## What each approach is

| | **Events** (Netlog Lens) | **`polledData`** (appspot session / DNS / pool tables) |
|--|--------------------------|--------------------------------------------------------|
| **Nature** | Time-ordered log of what the network stack did | Snapshot of state when capture stopped |
| **Coverage** | Entire logging window | What was still open, cached, or remembered at Stop |
| **Evidence** | Event indexes, params, cause → follow-up order | Summary rows without a full timeline |
| **Always present?** | Yes if events were recorded | Often missing or thin (`--log-net-log`, truncated exports) |
| **Answers** | “What did this protocol session **do**?” | “What did Chrome think was **open / cached now**?” |

Appspot **Events** also lists **every** NetLog source (`URL_REQUEST`, `SOCKET`, DNS jobs, …). People often call those “sessions.” Lens reserves **Sessions** for H2/H3 protocol sources only; other traffic appears under Overview (e.g. URL requests) or not at all until we add Net-info views.

---

## Decision: events first, polledData second

Events remain the investigation core. `polledData` is an **enrichment**, not a second session model.

### 1. Causal debugging

Protocol failures are stories: headers → invalid header → RST → GOAWAY → close. That order lives in **events**. A polled row (“3 active streams”, host, negotiated protocol) does not tell you what went wrong or when.

### 2. Stable, shareable evidence

Findings, URL hash state (`#?session=…&event=…`), jq helpers, and session MD export all cite **event indexes**. Snapshot fields are labeled **At export** and are not used as evidence indexes.

### 3. Full history, not “still alive at Stop”

A session that opened, failed, and closed mid-capture still has an `HTTP2_SESSION` / `QUIC_SESSION` source and events. `polledData` often lists connections still present at export time — useful context, incomplete history.

### 4. One diagnosis model

Overview swimlanes, Errors only, and diagnosis rules still run on **event-derived** sessions. Snapshot-only HTTP/2 rows are listed only when **Snapshot-only** is checked; they do not get fake timelines or findings.

### 5. Product focus

Lens is for **H2/H3 investigation + URL correlation + findings**, not a full net-internals clone. Phase 1 adds HTTP/2 `spdySessionInfo` because it shares `source_id` with events. QUIC snapshots, DNS, alt-svc, and socket pools stay out of Sessions.

### How merge works (Phase 1)

| `polledData.spdySessionInfo` row | Result in Lens |
|----------------------------------|----------------|
| `source_id` matches an event `HTTP2_SESSION` | Origin **Both** — timeline from events; **At export** panel from snapshot |
| `source_id` has no events | Origin **Snap** — stub row, no timeline; hidden until **Snapshot-only** is on |
| No `polledData` / no `spdySessionInfo` | Origin **Events** — unchanged |

### Tradeoff

We still omit appspot’s **DNS**, **Alternate Service Mappings**, **Queued reports**, **socket pools**, and **QUIC session tables** until those are designed as Net info (or a later QUIC merge). Snapshot-only HTTP/2 rows close the “appspot has it, Lens doesn’t” gap **without** treating the snapshot as proof.

---

## Practical comparison

| Situation | Appspot | Netlog Lens |
|-----------|---------|-------------|
| H2 tab shows sessions; few `HTTP2_SESSION` events | Snapshot from `spdySessionInfo` | Enable **Snapshot-only**; **Snap** rows, no timeline |
| H2 events + matching `source_id` in `polledData` | Events + snapshot table | **Both** — timeline + **At export** panel |
| QUIC tab shows sessions | `quicInfo.sessions` (often `connection_id`) | Event `QUIC_SESSION` sources only (Phase 1 does not merge QUIC snapshots) |
| Many `URL_REQUEST` / `SOCKET` sources | Visible in Events | Not on Sessions; URLs on Overview when correlated |
| Need DNS cache / alt-svc / pools | Proxy / DNS / related pages | Not shown yet |

### jq: count session ids in `polledData` vs events

Replace `chrome-net-export-log.json` with your file. Chromium writes HTTP/2 snapshots to `polledData.spdySessionInfo` (each row has `source_id`). QUIC snapshots are `polledData.quicInfo.sessions` — modern Chrome usually has `connection_id`, **not** `source_id`, so QUIC counts are **row vs source-id**, not a 1:1 join. Some `--log-net-log` dumps attach `polledData` as an **array** of contexts.

**How to read the diff**

| Result | Meaning |
|--------|---------|
| **only_in_polledData** | Appspot H2 rows with no event stream → Lens **Snap** rows (enable **Snapshot-only**) |
| **only_in_events** | Closed/historical H2 sessions still in the log → Lens shows them; snapshot often does not |
| QUIC `polled_quic_sessions` vs `events_quic` | Snapshot **row count** vs unique `QUIC_SESSION` **source ids** — IDs usually do not match |

**Full compare (H2 source-id join + QUIC counts)**

```bash
jq '
  .constants.logSourceType as $st

  | (.polledData // {}) as $pd0
  | (if ($pd0 | type) == "array" then $pd0 else [$pd0] end) as $pds

  | [
      $pds[]
      | (.spdySessionInfo // [])[]
      | .source_id
      | select(. != null)
    ] as $h2_polled

  | [
      $pds[]
      | (.quicInfo.sessions // [])[]
      | (.source_id // .connection_id)
      | select(. != null)
    ] as $quic_polled

  | [
      .events[]
      | select(.source.type == $st.HTTP2_SESSION)
      | .source.id
    ] | unique as $h2_events

  | [
      .events[]
      | select(.source.type == $st.QUIC_SESSION)
      | .source.id
    ] | unique as $quic_events

  | ($h2_polled | unique) as $h2p
  | ($quic_polled | unique) as $qp

  | {
      http2: {
        polledData_source_ids: ($h2p | length),
        events_source_ids: ($h2_events | length),
        only_in_polledData: ($h2p - $h2_events),
        only_in_events: ($h2_events - $h2p)
      },
      quic: {
        note: "Modern quicInfo.sessions usually has connection_id, not source_id — only_in_* is not 1:1 with Lens session ids.",
        polledData_rows: ($qp | length),
        events_source_ids: ($quic_events | length),
        polled_ids_sample: ($qp[:8]),
        event_source_ids_sample: ($quic_events[:8])
      }
    }
' chrome-net-export-log.json
```

**Counts only**

```bash
jq '
  .constants.logSourceType as $st
  | {
      polled_h2: ((.polledData.spdySessionInfo // []) | map(.source_id) | unique | length),
      events_h2: ([.events[] | select(.source.type == $st.HTTP2_SESSION) | .source.id] | unique | length),
      polled_quic_sessions: ((.polledData.quicInfo.sessions // []) | length),
      events_quic: ([.events[] | select(.source.type == $st.QUIC_SESSION) | .source.id] | unique | length)
    }
' chrome-net-export-log.json
```

**One source id** (example `4323812`)

```bash
jq --argjson id 4323812 '
  .constants.logSourceType as $st
  | {
      in_events: ([.events[] | select(.source.id == $id)] | length),
      event_source_type: ([.events[] | select(.source.id == $id)][0].source.type),
      in_h2_polled: ((.polledData.spdySessionInfo // []) | map(select(.source_id == $id)) | length),
      in_quic_polled: ((.polledData.quicInfo.sessions // []) | map(select(.source_id == $id)) | length)
    }
' chrome-net-export-log.json
```

If `in_events` is `0` but `in_h2_polled` is greater than 0, Lens can show a **Snap** row (enable **Snapshot-only**). If `in_events` is greater than 0 and the source type is `HTTP2_SESSION` or `QUIC_SESSION`, Lens models an event session; HTTP/2 rows also get **At export** when `in_h2_polled` matches.

See also [README → Extracting a raw event with jq](../README.md#extracting-a-raw-event-with-jq).

---

## Related

- [Guide](guide.md) — file shape (`constants` + `events`), how session ids work
- [Sessions](sessions.md) — list + detail (events, Both/Snap badges, ID/host/path filter)
- [Overview](overview.md) — findings-first dashboard and URL requests
- [Import](import.md) — loading net-export JSON in the browser
- External: [NetLog overview](https://www.chromium.org/developers/design-documents/network-stack/netlog/), [netlog-viewer.appspot.com](https://netlog-viewer.appspot.com/)

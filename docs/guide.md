# Guide

In-app learning article (also reachable from Import before loading a file). Documented here so the same content map is available in the repo.

## Purpose

Explain how Chromium netlogs are structured and how Netlog Lens maps that structure into sessions, streams, and findings — without inventing IDs.

## How to open

| Context | Action |
|---------|--------|
| Import | “How netlogs & session IDs work →” |
| Workspace | **Guide** tab |
| Session UI | Stream/transport help links scroll to anchors below |

Deep links / anchors used by the app:

| Anchor | Topic |
|--------|--------|
| `#file-shape` | `constants` + `events` |
| `#source-id` | Session ID = `source.id` |
| `#stream-id` | Streams from `params.stream_id` |
| `#guide-http2-streams` | Odd/even/`0` HTTP/2 stream IDs |
| `#guide-http3-streams` | HTTP/3 `id % 4` local/peer uni/bidi |
| `#guide-transport-model` | H2 shared TCP HOL vs H3 independence |
| `#dependencies` | `source_dependency` / related sources |
| `#how-lens` | End-to-end pipeline summary |
| `#references` | External Chromium / Catapult pointers |

---

## Section summary

### 1. File shape

Net-export JSON has:

- **`constants`** — maps for event types, source types, phases, net errors (build-specific integers)
- **`events`** — time-ordered records with `time`, `type`, `source { id, type }`, `phase`, optional `params`

Lens resolves numbers → names using those constants (they differ across Chrome versions).

### 2. Source / session ID

A **source** is anything the network stack tracks (socket, URL request, H2/QUIC session, …).

**Session ID in the UI = `event.source.id`** for sources typed `HTTP2_SESSION` or `QUIC_SESSION`. All events sharing that id belong to that session row.

Not the same as HTTP stream id.

### 3. Streams

Inside a session, frames carry **`params.stream_id`** (or QUIC equivalents). Lens aggregates those into the streams table (method, path, status, bytes, RST).

`stream_id = -1` is a Chromium sentinel (invalid/unset), often used for connection-level control — not a real request stream.

### 4. HTTP/2 stream IDs

| ID | Meaning |
|----|---------|
| Odd | Client-initiated (local requests) |
| Even | Server-initiated (often push) |
| `0` | Connection control |

### 5. HTTP/3 local / peer

QUIC encodes initiator and uni/bidi in `stream_id % 4` (RFC 9000). Guide + UI chips label requests vs local/peer unidirectional (and peer bidi when present).

### 6. Transport model

Contrasts:

- **H2:** multiplexed on one TCP connection → loss can stall all streams
- **H3:** streams largely independent → one RST does not block siblings the same way

Matches the Transport model panel on [Sessions](sessions.md).

### 7. Dependencies

Events may reference other sources (`source_dependency`, related ids). Lens uses correlation to tie URL requests and failed net errors to protocol sessions when possible.

### 8. What Lens does

Parse → index sources → build H2/QUIC models → run rules → present Overview / Sessions / Findings with timeline catalog + inspector stories.

---

## Related

- [Import](import.md) — load a file or open Guide early
- [Sessions](sessions.md) — apply these concepts while debugging
- [README](../README.md) — capture, privacy, architecture

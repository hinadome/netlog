# Findings

Tab listing every automated diagnosis for the loaded capture. Count appears in the tab label (`Findings (N)`). Up to five findings also appear on [Overview](overview.md) **Top findings**.

## Purpose

Browse issues by severity, read explanation + suggested next step, then jump to the matching session timeline evidence.

## Filters (Findings tab)

| Control | Effect |
|---------|--------|
| Severity | All · critical · error · warning · info |
| Rule | All rule ids present in the capture |
| Host or URL | Case-insensitive substring on `host` or `url` |

Count shows `Showing X of Y`. Session detail uses a compact findings list without these filters.

## List UI

Each finding row shows:

| Field | Description |
|-------|-------------|
| Severity | `critical` / `error` / `warning` / `info` |
| Title | Short problem statement |
| Rule id | e.g. `h2-rst`, `url-net-error` |
| Explanation | What was detected in the log |
| **Next:** | Suggested follow-up |
| Meta | Host · session id · stream id (when known) |

Clicking a finding:

1. Selects that finding
2. Switches to **Sessions** if a `sessionId` is present
3. Selects the session and focuses the first `evidenceEventIndexes` event in the timeline/inspector

## Export (top bar)

Available on any workspace tab when findings exist:

| Button | Output |
|--------|--------|
| **Export MD** | Markdown report: file stats + each finding |
| **Export JSON** | JSON array of finding objects |

Session detail also offers **Export session MD** (narrative for one session).

Filenames are derived from the netlog name. Downloads stay local (blob download).

## Rule catalog

| Rule id | What it flags |
|---------|----------------|
| `h2-invalid-header` | `HTTP2_SESSION_RECV_INVALID_HEADER` |
| `h2-header-duplicate` / `h2-header-case` / `h2-header-authority` | Malformed or duplicate HTTP/2 pseudo-headers |
| `h2-rst` / `h2-goaway` | RST_STREAM, GOAWAY |
| `h2-flow-control` | Likely flow-control stalls |
| `h2-ping` | Unacked PINGs |
| `url-net-error` | URL requests with `ERR_HTTP2_*` / `ERR_QUIC_*` (and related) |
| `quic-close` / `quic-rst` / `quic-handshake` | QUIC connection close, stream RST, handshake failure |
| `tls-handshake-fail` / `tls-alpn-unexpected` / `tls-negotiated` | TLS handshake and ALPN |

See [README](../README.md#diagnosis-high-level) for severity semantics.

## Related

- [Overview](overview.md) — top findings summary
- [Sessions](sessions.md) — where evidence is inspected
- [Guide](guide.md) — Errors only vs warning findings

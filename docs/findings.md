# Findings

Tab listing every automated diagnosis for the loaded capture. Count appears in the tab label (`Findings (N)`).

## Purpose

Browse issues by severity, read explanation + suggested next step, then jump to the matching session timeline evidence.

## List UI

Each finding row shows:

| Field | Description |
|-------|-------------|
| Severity | `critical` / `error` / `warning` / `info` |
| Title | Short problem statement |
| Explanation | What was detected in the log |
| **Next:** | Suggested follow-up |
| Meta | Host · session id · stream id (when known) |

Clicking a finding:

1. Selects that finding
2. Switches to **Sessions** if a `sessionId` is present
3. Selects the session and focuses the first `evidenceEventIndexes` event in the timeline/inspector

Session detail also has a compact findings list scoped to the current session (same click-to-evidence behavior).

## Export (top bar)

Available on any workspace tab when findings exist:

| Button | Output |
|--------|--------|
| **Export MD** | Markdown report: file stats + each finding (severity, host, URL, session, rule id, explanation, suggestion) |
| **Export JSON** | JSON array of finding objects |

Filenames are derived from the netlog name (`*-findings.md` / `*-findings.json`). Downloads stay local (blob download).

## Rule catalog

| `ruleId` | Typical trigger |
|----------|-----------------|
| `h2-invalid-header` | Invalid HTTP/2 header received |
| `h2-rst` | RST_STREAM (peer/local) with error code |
| `h2-goaway` | GOAWAY frame |
| `h2-flow-control` | Flow-control stall patterns |
| `h2-ping` | PING without timely ACK |
| `url-net-error` | URL request net errors (e.g. `ERR_HTTP2_*`, `ERR_QUIC_*`) correlated to sessions |
| `quic-close` | QUIC connection close |
| `quic-rst` | QUIC stream reset |
| `quic-handshake` | Handshake / connect failure |

Findings are sorted by severity (critical first). Empty list: “No findings.”

## Evidence model

- `evidenceEventIndexes` — indexes into the global parsed `events` array (same as UI **event #**)
- Timeline highlights and inspector “linked findings” use those indexes

## Related

- [Sessions](sessions.md) — where evidence is inspected
- [Overview](overview.md) — top five preview
- [README](../README.md) — jq tips for raw lines

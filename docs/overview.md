# Overview

Default tab after a successful import.

## Purpose

Give a one-screen health snapshot of the capture: volume, protocol mix, request failures, and the most important findings.

## Stats

| Stat | Meaning |
|------|---------|
| **Events** | Total resolved events in the file |
| **HTTP/2 sessions** | Count of `HTTP2_SESSION` sources (click → Sessions) |
| **QUIC / HTTP/3** | Count of `QUIC_SESSION` sources (click → Sessions) |
| **URL requests** | Correlated URL_REQUEST sources |
| **Failed requests** | URL requests that ended with a net error |
| **Findings** | Automated diagnosis count (click → Findings; emphasized when &gt; 0) |
| **Sessions w/ errors** | Sessions marked `hasError` (emphasized when &gt; 0) |

## Top findings

- Shows up to **five** findings (already severity-sorted by the analyzer)
- Each row: severity badge, title, host · protocol
- **View all** opens the [Findings](findings.md) tab
- Empty state: no automated findings — browse Sessions for manual inspection

Note: rows on Overview are display-only; use **Findings** or **Sessions** to jump to evidence.

## Related

- [Sessions](sessions.md) — drill into a connection
- [Findings](findings.md) — full list + evidence navigation

# Overview

Default tab after a successful import.

## Purpose

Give a one-screen health snapshot of the capture: volume, protocol mix, request failures, session timeline, and the most important findings.

## Stats

| Stat | Meaning |
|------|---------|
| **Events** | Total resolved events in the file |
| **HTTP/2 sessions** | Count of `HTTP2_SESSION` sources (click → Sessions) |
| **QUIC / HTTP/3** | Count of `QUIC_SESSION` sources (click → Sessions) |
| **URL requests** | Correlated `URL_REQUEST` sources |
| **Failed requests** | URL requests that ended with a net error |
| **Findings** | Automated diagnosis count (click → Findings; emphasized when &gt; 0) |
| **Sessions w/ errors** | Sessions with **actionable** errors (critical/error findings or non-benign protocol events — same rule as **Errors only**; emphasized when &gt; 0) |

Hover the **Sessions w/ errors** stat for a short definition. This count does **not** use `summary.hasError` alone (benign closes and CANCEL resets are excluded).

## Session timeline (swimlanes)

Horizontal bars for each HTTP/2 or QUIC session in capture time order.

| Element | Meaning |
|---------|---------|
| Bar | Session lifetime (`start` → `end`) |
| Color / badge | `h2` vs `h3` protocol |
| Red styling | Session qualifies for actionable errors |
| Markers | Findings on that session (positioned at evidence event time when known) |
| Row click | Open **Sessions** tab and select that session |

### Controls

| Control | Effect |
|---------|--------|
| **Brush** track | Drag to select a time range — filters visible swimlanes, the URL requests table, and (on **Sessions**) the session list |
| **Clear brush** | Remove the time filter |
| **Sessions tab (N)** | Jump to Sessions with the same brush active |
| **Errors only** | Show only sessions with actionable errors (aligned with timeline **Errors** density) |
| Count label | `Showing X of Y` — when Errors only is on, `Y` is the actionable-error count |

When every session would pass Errors only (no actionable errors in the capture), a hint explains that the filter matches the full list.

List is capped (errors and findings sorted first); use brush or Errors only to narrow.

## URL requests

Table of correlated Chromium `URL_REQUEST` sources (hidden when the capture has none).

| Control | Effect |
|---------|--------|
| **Failed only** (default on) | Hide successful requests |
| Search | Filter URL, method, or net error string |
| Time brush | When set on swimlanes, only requests overlapping the brush |
| Row click | Open the linked H2/H3 session when correlation exists |

Failed rows show net error text; successful rows show HTTP status when known.

## Top findings

- Shows up to **five** findings (already severity-sorted by the analyzer)
- Each row: severity badge, title, host · protocol
- **View all** opens the [Findings](findings.md) tab
- Empty state: no automated findings — browse Sessions for manual inspection

Note: rows on Overview are display-only; use **Findings** or **Sessions** to jump to evidence.

## Related

- [Sessions](sessions.md) — drill into a connection; host/path filter; shares time brush
- [Findings](findings.md) — full list + evidence navigation
- [Guide](guide.md) — what counts as an error vs warning

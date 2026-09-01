# Overview

Default tab after a successful import.

## Purpose

Support a **findings-first** investigation flow: see automated diagnosis, pick failed URL requests, then use the session timeline for time context. Stats at the top summarize capture volume and health.

## Recommended workflow

1. Scan **Top findings** — click a row to jump to session evidence.
2. Use **URL requests** (failed-only by default) — click a row to open the correlated H2/H3 session.
3. Use **Session timeline** — brush a time range to narrow URL sections; open a session swimlane for detail.
4. Optional: **Request waterfall** for per-request phase timing; **Retry chains** when the same path was attempted multiple times.

## Stats

| Stat | Meaning |
|------|---------|
| **Events** | Total resolved events in the file |
| **HTTP/2 sessions** | Count of `HTTP2_SESSION` sources (click → Sessions) |
| **QUIC / HTTP/3** | Count of `QUIC_SESSION` sources (click → Sessions) |
| **URL requests** | Correlated `URL_REQUEST` sources |
| **Failed requests** | URL requests that ended with a net error |
| **Findings** | Automated diagnosis count (click → Findings; emphasized when &gt; 0) |
| **Sessions w/ errors** | Sessions with **actionable** errors (same rule as **Errors only**; emphasized when &gt; 0) |

Hover **Sessions w/ errors** for the definition. Benign closes and CANCEL resets are excluded.

Large captures (≥100k events) show a banner: global search caps event hits; use host/path filters and the time brush to narrow.

## Layout (top to bottom)

| # | Section | Time brush |
|---|---------|------------|
| — | **Stats** | — |
| 1 | **Top findings** | No |
| 2 | **URL requests** | Yes |
| 3 | **Session timeline** (swimlanes) | Set brush here |
| 4 | **Request waterfall** | Yes |
| 5 | **Retry chains** | Yes |

**Top findings** are not brush-filtered so diagnosis stays visible while you narrow URL/time sections below.

---

## Top findings

- Up to **five** findings (severity-sorted by the analyzer)
- Each row: severity badge, title, host · protocol
- **Click a row** → **Sessions** tab with evidence event focused (same as Findings tab)
- **View all** → [Findings](findings.md) tab
- Empty state: no automated findings — browse Sessions manually

---

## URL requests

Table of correlated Chromium `URL_REQUEST` sources (hidden when the capture has none).

| Control | Effect |
|---------|--------|
| **Failed only** (default on) | Hide successful requests |
| Search | Filter URL, method, or net error string |
| Time brush | Only requests overlapping the brushed range (set on session timeline below) |
| Row click | Open the linked H2/H3 session when correlation exists |

Failed rows show net error text; successful rows show HTTP status when known.

---

## Session timeline (swimlanes)

Horizontal bars for each HTTP/2 or QUIC session in capture time order.

| Element | Meaning |
|---------|---------|
| Bar | Session lifetime (`start` → `end`) |
| Color / badge | `h2` vs `h3` protocol |
| Red styling | Session qualifies for actionable errors |
| Markers | Findings on that session (at evidence event time when known) |
| Row click | Open **Sessions** tab and select that session |

### Controls

| Control | Effect |
|---------|--------|
| **Brush** track | Drag to select a time range — filters swimlanes, **URL requests** (above), **waterfall**, **retry chains**, and the **Sessions** list |
| **Clear brush** | Remove the time filter |
| **Sessions tab (N)** | Jump to Sessions with the same brush active |
| **Errors only** | Sessions with actionable errors only |
| Count label | `Showing X of Y` |

List is capped; use brush or Errors only to narrow.

---

## Request waterfall

Phased timing bars inferred from each `URL_REQUEST`’s events (DNS → connect → TLS → request → response).

| Control | Effect |
|---------|--------|
| Time brush | Only requests overlapping the brush |
| Row click | Open correlated session (same as URL requests table) |

Hidden when there are no URL requests in scope.

---

## Retry chains

Groups **two or more** `URL_REQUEST` attempts for the same origin + pathname (query strings ignored for grouping). Requests without a URL are excluded.

| Control | Effect |
|---------|--------|
| Time brush | Chains built only from attempts in the brushed range (need 2+ in range) |
| Attempt click | Open correlated session |

Shows **Time brush active** when a brush is set. Empty state differs for “no chains in capture” vs “no chains in brushed range”.

---

## Related

- [Sessions](sessions.md) — drill into a connection; host/path filter; shares time brush
- [Findings](findings.md) — full list, filters, evidence navigation
- [Guide](guide.md) — what counts as an error vs warning

# Search

Workspace tab for **whole-capture** search (keyboard: `/`).

## Purpose

Find findings, sessions, URL requests, or individual events when you do not know which session to open first.

## Query

Case-insensitive substring match across:

| Kind | Fields searched |
|------|-----------------|
| Findings | Title, explanation, host, URL, rule id |
| Sessions | Host, paths, session id, protocol |
| URL requests | URL, method, net error |
| Events | Type, catalog title/summary, params JSON |

Event hits are capped at **200** per search; large captures (≥100k events) show a reminder on Overview to narrow with filters.

## Results

Grouped by kind. Click a hit to:

- **Finding** → Sessions tab + evidence event
- **Session / event / URL** → Sessions tab + session (and event index when known)

Search query is included in the shareable URL hash (`#?tab=search&q=…`) when on this tab.

## Related

- [Overview](overview.md) — findings-first workflow
- [Sessions](sessions.md) — per-session timeline search

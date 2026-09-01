# Changelog

All notable changes to **Netlog Lens** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Overview — session timeline (swimlanes)** — per-session bars with finding markers; **Errors only** filter; drag **brush** to narrow by time (shared with Sessions tab and URL requests table)
- **Overview — URL requests table** — correlated `URL_REQUEST` rows with failed-only default, search, and brush filter; click opens the linked H2/H3 session
- **Sessions** list filter: search by **host or request path** (case-insensitive). Session summaries include a `paths` array derived from stream `:path` values at analysis time
- **Session detail — stream lifecycle bars** — compact per-stream phase visualization (open → data → close / RST)

### Fixed

- **Errors only** (Overview swimlanes + Sessions list) and **Sessions w/ errors** stat now use **actionable** error logic aligned with timeline **Errors** density — critical/error findings or non-benign protocol events; excludes normal `QUIC_SESSION_CLOSED`, `NO_ERROR`, and `CANCEL` (code 8) resets
- `summary.hasError` no longer drives Errors-only filtering (it was inflated by benign closes and CANCEL resets)
- **Search all** on the session timeline searches the whole session when checked (ignores density and stream chip)

### Changed

- Sessions **Status** column: `error` (actionable), `warning` (benign `hasError` or warning findings), or `ok`
- Session model: benign RST/CANCEL and normal QUIC close no longer set `hasError` on streams/sessions

### Documentation

- [README.md](README.md), [CHANGELOG.md](CHANGELOG.md), [DEPLOYMENT.md](DEPLOYMENT.md), deploy scripts/README — upgrade notes and actionable-error semantics
- [docs/overview.md](docs/overview.md), [docs/sessions.md](docs/sessions.md), [docs/guide.md](docs/guide.md) — swimlanes, URL requests, brush, Errors only vs timeline
- In-app **Guide** — new “Errors & filters” section

### Planned / not yet implemented

- Flow-control window sparkline on the event timeline
- Explicit HTTP/3 timeline filters (Requests only / Control only)

---

## [0.1.0] - 2026-08-31

Initial client-only Chromium net-export analyzer for HTTP/2 and HTTP/3 (QUIC).

### Added — Core pipeline

- Vite + React + TypeScript SPA; parse runs in a **Web Worker** (no server upload)
- Netlog parser: `constants` + `events`, type/source/phase resolution, truncated JSON repair
- Source indexing by `source.id`; session ID = Chromium source id for `HTTP2_SESSION` / `QUIC_SESSION`
- HTTP/2 session model: streams, headers, RST/GOAWAY, settings, bytes
- QUIC / HTTP/3 session model: streams, connection close, handshake, versions
- URL request correlation (`ERR_HTTP2_*` / `ERR_QUIC_*` and related)
- Diagnosis rules:
  - `h2-invalid-header`, `h2-rst`, `h2-goaway`, `h2-flow-control`, `h2-ping`
  - `url-net-error`
  - `quic-close`, `quic-rst`, `quic-handshake`
- Findings export: Markdown and JSON from the workspace top bar
- Sample fixture and Vitest coverage for parser/diagnosis/catalog/links/stream kinds

### Added — UI pages

- **Import** — drag/drop JSON, progress stages, privacy note, Guide link before load
- **Overview** — event/session/URL/finding stats and top findings
- **Sessions** — host/protocol/errors filters; session list + detail
- **Findings** — full list with explanation, suggestion, jump-to-evidence
- **Guide** — netlog structure, session vs stream IDs, H2/H3 stream rules, transport model, references

### Added — Session detail & timeline insight

- Streams table: kind, request (truncated paths), status, bytes, RST; click to filter timeline
- Stream kind chips and classification:
  - HTTP/2: odd/even/`0` (local / peer / connection)
  - HTTP/3: `stream_id % 4` (local/peer uni/bidi, requests)
- **Transport model** panel: H2 shared TCP HOL vs H3 independent streams + fate notes
- Virtualized **Event timeline** with plain-language catalog titles
- Density modes: Errors / Hide noise / All; idle gap markers; stream chips
- Event story links: cause / follow-up / finding badges; related-event jumps
- Annotated **Event inspector** (severity, summary, stream type, key fields, linked findings, optional raw JSON)
- Scrollable session findings panel for stable layout
- Timeline **search** (type/title/summary/params) + **Search all** (whole session; ignores density and stream filter)

### Fixed

- `stream_id = -1` treated as Chromium sentinel (connection/unset), not peer-bidi; not listed as a normal stream row; clarified WINDOW_UPDATE copy; not surfaced as an error under default Hide noise
- **Search all** previously ignored density only and still applied the stream chip — now searches the entire session when checked with a query

### Added — Documentation

- Root [README.md](README.md) — product overview, capture, privacy, architecture, jq tips, page index, **actionable error** semantics
- Per-page docs: [docs/import.md](docs/import.md), [docs/overview.md](docs/overview.md) (swimlanes, URL requests, brush), [docs/sessions.md](docs/sessions.md) (Errors only, status, lifecycle), [docs/findings.md](docs/findings.md), [docs/guide.md](docs/guide.md)
- In-app Guide sections with Chromium / Catapult / related references; **Errors & filters** section

### Added — Hosting & deployment

- Static deploy for **Vercel** (`vercel.json`) and **Netlify** (`netlify.toml`); publish `dist/`
- Self-hosted **VM** deploy: `deploy/vm/deploy.sh` + nginx site templates
  - `--no-tls`, `--self-signed` / `--force-self-signed`, `--certbot` / `--force-certbot` / `--email`
  - Owns only `/opt/netlog`, `sites-*/netlog.conf`, `/etc/nginx/ssl/netlog/`
- Self-hosted **Container** deploy: `deploy/container/deploy.sh`, Dockerfile, Compose app + nginx gateway
  - Same TLS flag surface; does not edit host nginx
- [DEPLOYMENT.md](DEPLOYMENT.md) — full VM/container ops, cert reuse/mode switching, coexistence
- `deploy/validate.sh` smoke helper; `.dockerignore` for image builds

### Security / privacy

- All analysis remains local in the browser (or self-hosted static assets)
- Capture guidance prefers Chrome strip-private / strip-cookies modes

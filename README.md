# Netlog Lens

Client-only analysis for Chromium **net-export** captures (`chrome://net-export`). Reconstruct HTTP/2 and HTTP/3 (QUIC) sessions, surface automated findings, and jump from findings to timeline evidence — **nothing is uploaded**.

## What it does

1. Load a netlog JSON file in the browser (parsed in a **Web Worker**).
2. Resolve numeric event/source/phase codes via the file’s `constants` maps.
3. Group events by `source.id` into **HTTP2_SESSION** / **QUIC_SESSION** rows.
4. Build per-session streams from `params.stream_id`, headers, RST/GOAWAY/closes.
5. Run diagnosis rules and link findings to event indexes for inspection.

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build
```

## Deploy (Vercel / Netlify)

This is a **static Vite SPA** (`dist/`). Parsing stays in the browser — no server functions required.

### Vercel

1. Import the Git repo in [Vercel](https://vercel.com/new) (or `npx vercel`)
2. Framework preset: **Vite** (see `vercel.json`)
3. Build: `npm run build` → output `dist`

```bash
npm run build
npx vercel deploy --prebuilt   # optional CLI after a local build
```

### Netlify

1. Import the Git repo in [Netlify](https://app.netlify.com) (or `npx netlify deploy`)
2. Config is in `netlify.toml`: build `npm run build`, publish **`dist`**
3. SPA fallback: `/*` → `/index.html` (200)

```bash
npm run build
npx netlify deploy --prod --dir=dist
```

Do **not** set Netlify publish to `dist/client` or add a functions directory — that pattern is for Nitro/SSR apps only.

## Deploy (VM / Container + nginx)

For self-hosted installs with an nginx FrontendGateway (HTTP-only verify, self-signed, or Certbot), see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

```bash
# VM
sudo ./deploy/vm/deploy.sh --domain netlog.example.com --no-tls

# Container (Docker Compose)
./deploy/container/deploy.sh --domain netlog.example.com --no-tls
```

Short index: [deploy/README.md](deploy/README.md).

## Capture a netlog

1. Open Chrome/Edge → `chrome://net-export`
2. Prefer **Strip private information** or **Strip cookies**
3. Start logging, reproduce the issue, **Stop**, save the JSON
4. Drop the file on the Import page

## App pages

| Page | Role | Detail |
|------|------|--------|
| [Import](docs/import.md) | Drop / choose netlog JSON; progress & privacy notes | First screen before analysis |
| [Overview](docs/overview.md) | Findings-first dashboard: top findings → URL requests → timeline → waterfall → retry chains | Default after parse |
| [Sessions](docs/sessions.md) | Session list + detail (host/path filter, lifecycle, SETTINGS/GOAWAY, timeline, inspector) | Main drill-down UI |
| [Findings](docs/findings.md) | Full finding list with filters and jump-to-evidence | Exportable from top bar |
| [Search](docs/search.md) | Whole-capture search (`/` shortcut) | Findings, sessions, URLs, events |
| [Compare](docs/compare.md) | Diff two netlog files | Findings, failed URLs, hosts |
| [Guide](docs/guide.md) | Netlog structure, errors vs warnings, stream IDs | Before or after import |

Workspace chrome: **Export MD** / **Export JSON**, **New file**, tab navigation (`1`–`5`, `g` guide).

### Overview workflow (findings → failed URL → drill in)

After the stats row:

1. **Top findings** — click to jump to evidence  
2. **URL requests** — failed-only default; respects time brush  
3. **Session timeline** — swimlanes; **brush** sets time filter for URL sections + Sessions tab  
4. **Request waterfall** — DNS/connect/TLS/request phases per URL  
5. **Retry chains** — multiple attempts for same origin + path (brush-aware)

Shareable links: `#?tab=sessions&session=42&event=1234` (tab, session, event, finding, brush, search query).

### Sessions & errors

On the **Sessions** tab, the top-left search box matches **host or request path** (case-insensitive substring). For example, `/api/` finds every session that carried a stream with that path, even when hosts differ. Paths come from parsed `:path` / request headers on each stream at analysis time.

**Errors only** on Sessions and Overview swimlanes uses **actionable** error logic (aligned with timeline **Errors** density). See [docs/sessions.md](docs/sessions.md#errors-only-vs-timeline).

### Session detail extras

- Stream **lifecycle bars**, **SETTINGS & GOAWAY** panel, **flow-control sparkline** (**Jump to first window update** opens that event in the timeline; switches off **Hide noise** if needed)
- Timeline: H3 **Requests / Control** filters, **First error** jump, `j`/`k` navigation
- Event inspector: **jq** copy helpers · **Export session MD**

Details: [docs/sessions.md](docs/sessions.md#flow-control-window).

## What counts as an error?

| Layer | Rule |
|-------|------|
| **Errors only** filter / **Sessions w/ errors** stat | Critical or error **findings**, or **actionable** protocol events on the session (matches timeline **Errors** density) |
| **Excluded as benign** | `QUIC_SESSION_CLOSED`, RST with `NO_ERROR` / `CANCEL` (code 0 or 8), ok `HTTP2_SESSION_CLOSE` |
| **Status: warning** | Session still has `hasError` from softer signals or **warning** findings (e.g. flow control, PING) — visible in the list but not in Errors only |
| **Timeline Errors** | Catalog `critical` / `error` severity or `category === error`, minus benign closes/resets; **Hide noise** (default) hides routine chatter |

If Errors only lists a session but the timeline looks empty, switch density to **All** or use **Search all** — you may have a warning-level finding or a hidden noise event. After the actionable-error fix, that mismatch should be rare.

## Diagnosis (high level)

| Rule id | What it flags |
|---------|----------------|
| `h2-invalid-header` | `HTTP2_SESSION_RECV_INVALID_HEADER` |
| `h2-rst` / `h2-goaway` | Peer/local RST_STREAM, GOAWAY |
| `h2-flow-control` | Likely flow-control stalls |
| `h2-ping` | Unacked PINGs |
| `url-net-error` | URL requests with `ERR_HTTP2_*` / `ERR_QUIC_*` (and related) |
| `quic-close` / `quic-rst` / `quic-handshake` | QUIC connection close, stream RST, handshake failure |
| `h2-header-duplicate` / `h2-header-case` / `h2-header-authority` | Malformed or duplicate HTTP/2 pseudo-headers |
| `tls-handshake-fail` / `tls-alpn-unexpected` / `tls-negotiated` | TLS handshake errors and ALPN negotiation |

Severities: `critical` · `error` · `warning` · `info`.

## Privacy

All parsing runs locally. Prefer stripped capture modes; logs can still contain URLs and other metadata.

## Architecture

```
JSON file → Web Worker
  → parse (constants + events)
  → index sources
  → HTTP/2 & QUIC session models + URL request correlation
  → diagnosis rules
  → UI (Overview / Sessions / Findings / Search / Compare / Guide)
```

Useful references: Chromium `net_log_event_type_list.h`, Catapult netlog-viewer, Cloudflare typed netlog event shapes.

## Extracting a raw event with jq

UI **event #N** is the 0-based index in `.events`:

```bash
jq '.events[16694]' chrome-net-export-log.json
```

By type + stream (example: peer RST on stream 51):

```bash
jq '
  .constants.logEventTypes.HTTP2_SESSION_RECV_RST_STREAM as $t
  | .events
  | to_entries[]
  | select(.value.type == $t and .value.params.stream_id == 51)
  | {index: .key, event: .value}
' chrome-net-export-log.json
```

## Docs index

- [Import](docs/import.md)
- [Overview](docs/overview.md)
- [Sessions](docs/sessions.md)
- [Findings](docs/findings.md)
- [Search](docs/search.md)
- [Compare](docs/compare.md)
- [Guide](docs/guide.md)
- [CHANGELOG](CHANGELOG.md) — full implementation history
- [DEPLOYMENT](DEPLOYMENT.md) — VM / container nginx deploys

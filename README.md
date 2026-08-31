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
| [Overview](docs/overview.md) | Counts and top findings | After a successful parse |
| [Sessions](docs/sessions.md) | Session list + detail (streams, transport model, timeline, inspector) | Main investigation UI |
| [Findings](docs/findings.md) | Full finding list with jump-to-evidence | Also exportable from the top bar |
| [Guide](docs/guide.md) | How netlogs, session IDs, and stream IDs work | Available before or after import |

Workspace chrome (after load): **Export MD** / **Export JSON**, **New file**, and tab navigation.

## Diagnosis (high level)

| Rule id | What it flags |
|---------|----------------|
| `h2-invalid-header` | `HTTP2_SESSION_RECV_INVALID_HEADER` |
| `h2-rst` / `h2-goaway` | Peer/local RST_STREAM, GOAWAY |
| `h2-flow-control` | Likely flow-control stalls |
| `h2-ping` | Unacked PINGs |
| `url-net-error` | URL requests with `ERR_HTTP2_*` / `ERR_QUIC_*` (and related) |
| `quic-close` / `quic-rst` / `quic-handshake` | QUIC connection close, stream RST, handshake failure |

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
  → UI (Overview / Sessions / Findings / Guide)
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
- [Guide](docs/guide.md)
- [CHANGELOG](CHANGELOG.md) — full implementation history
- [DEPLOYMENT](DEPLOYMENT.md) — VM / container nginx deploys

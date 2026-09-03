# Deployment

Netlog Lens is a **static Vite SPA**. Production deploys use **nginx as the FrontendGateway** in front of the built assets. There are **two separate** paths — **VM** (host nginx) and **Container** (Docker Compose). Do not mix them on the same host ports without planning.

| Path | Script | Gateway | App |
|------|--------|---------|-----|
| VM | `deploy/vm/deploy.sh` | Host nginx site `netlog.conf` | Files in `/opt/netlog/www` |
| Container | `deploy/container/deploy.sh` | Compose service `gateway` | Compose service `app` (nginx:8080) |

Detailed cloud static hosting (Vercel/Netlify) is documented in [README.md](README.md#deploy-vercel--netlify).

---

## Prerequisites

### Shared

- DNS A/AAAA for your domain pointing at the host (required for `--certbot`)
- Outbound HTTPS for package installs / ACME
- Open **80/tcp** (always) and **443/tcp** (HTTPS modes)

### VM

- Linux host with `sudo`
- `nginx`, `openssl`, `rsync`, Node.js 22+ (or `--skip-build` with prebuilt `www`)
- `certbot` when using `--certbot`

### Container

- Docker Engine + `docker compose`
- `openssl` on the host (for `--self-signed`)
- Do **not** rely on editing host `/etc/nginx`

---

## Architecture / ports

### TLS mode (HTTPS)

| Public | Protocol | Upstream |
|--------|----------|----------|
| `443` | HTTPS | Static files (VM) or `app:8080` (container) |
| `80` | HTTP → redirect to HTTPS (+ ACME webroot) | same |

### `--no-tls` (HTTP-only verify)

| Public | Protocol | Upstream |
|--------|----------|----------|
| `80` | HTTP (no redirect, no certs) | Static files or `app:8080` |

Use `--no-tls` to confirm the app works **before** issuing certificates, then re-run with `--self-signed` or `--certbot`.

### Security headers

All production paths send a strict **Content-Security-Policy** (`default-src 'self'`, `frame-ancestors 'none'`, no external scripts/styles/fonts) plus `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`.

| Host | Config |
|------|--------|
| Vercel | [`vercel.json`](vercel.json) `headers` |
| Netlify | [`netlify.toml`](netlify.toml) `[[headers]]` |
| VM / container nginx | [`deploy/security-headers.snippet`](deploy/security-headers.snippet) (inlined in nginx templates) |

Fonts are bundled via `@fontsource/*` — no Google Fonts CDN at runtime.

---

## VM deployment

Script: [`deploy/vm/deploy.sh`](deploy/vm/deploy.sh)

### Verify without certificates

```bash
sudo ./deploy/vm/deploy.sh --domain netlog.example.com --no-tls
./deploy/validate.sh --base http://netlog.example.com
```

### HTTPS with self-signed

```bash
sudo ./deploy/vm/deploy.sh --domain netlog.example.com --self-signed
./deploy/validate.sh --base https://netlog.example.com --insecure
```

### HTTPS with Certbot (Let's Encrypt)

```bash
sudo ./deploy/vm/deploy.sh --domain netlog.example.com --certbot --email you@example.com
./deploy/validate.sh --base https://netlog.example.com
```

Uses **certbot webroot** (`/var/www/certbot`), never `certbot --nginx` (avoids rewriting other vhosts).

### Repeatable upgrade

Re-run the **same** TLS mode command after pulling new code. The script runs `npm ci` and `npm run build` by default, publishing fresh static assets to `/opt/netlog/www`. Recent UI includes:

- Overview: findings-first layout (top findings → URL requests → session timeline → waterfall → retry chains)
- **Search** and **Compare** tabs, shareable `#?tab=…` URL state, keyboard shortcuts
- Session detail: SETTINGS/GOAWAY, flow-control sparkline, H3 timeline filters, jq helpers, session MD export, **At export (polledData)** for HTTP/2
- Sessions: **ID / host / path** filter; **Evts / Both / Snap** source badges; **Snapshot-only** rows (HTTP/2 `spdySessionInfo`, off by default)
- Findings filters; actionable **Errors only**; events-first analysis with optional HTTP/2 snapshot merge ([docs/concept.md](docs/concept.md))

Certificates are reused unless you pass `--force-self-signed` or `--force-certbot`. Use `--skip-build` only when you intentionally want to keep the existing `www` tree.

```bash
# Pull latest, rebuild app assets, keep TLS mode
sudo ./deploy/vm/deploy.sh --domain netlog.example.com --self-signed
```

### Script flags

| Flag | Meaning |
|------|---------|
| `--domain` | Required `server_name` |
| `--no-tls` | HTTP-only site |
| `--self-signed` / `--force-self-signed` | OpenSSL PEMs in `/etc/nginx/ssl/netlog/` |
| `--certbot` / `--force-certbot` | Let's Encrypt via webroot |
| `--email` | Required for Certbot |
| `--skip-certbot` | Alias for `--self-signed` |
| `--skip-build` | Do not run `npm run build` |
| `--remove-default-site` | Remove only `sites-enabled/default` |

### Files this deploy owns

| Path | Role |
|------|------|
| `/opt/netlog/` | App tree (`www/`, optional `.env.production`) |
| `/etc/nginx/sites-available/netlog.conf` | Site config |
| `/etc/nginx/sites-enabled/netlog.conf` | Symlink enable |
| `/etc/nginx/ssl/netlog/` | Gateway PEMs or LE symlinks + `.tls-source` |
| `/var/backups/netlog/` | Site config backups before overwrite |
| `/var/www/certbot` | ACME webroot |

### What this deploy will NOT touch

- Other `sites-enabled/*` entries (except optional `default`)
- `/etc/letsencrypt/live/` contents with self-signed material (LE stays in LE dirs; gateway uses symlinks)
- Unrelated systemd units
- UFW (never `ufw --force enable`)

---

## Container deployment

Script: [`deploy/container/deploy.sh`](deploy/container/deploy.sh)  
Compose: [`deploy/container/docker-compose.yml`](deploy/container/docker-compose.yml)

**Never** edits host nginx. Publishes only gateway ports on the Docker host.

### Verify without certificates

```bash
./deploy/container/deploy.sh --domain netlog.example.com --no-tls
./deploy/validate.sh --base http://127.0.0.1
```

### HTTPS with self-signed

```bash
./deploy/container/deploy.sh --domain netlog.example.com --self-signed
./deploy/validate.sh --base https://127.0.0.1 --insecure
```

### HTTPS with Certbot

```bash
./deploy/container/deploy.sh --domain netlog.example.com --certbot --email you@example.com
```

Certbot runs in a one-shot container sharing the ACME webroot volume with `gateway`. Issued PEMs are copied into `deploy/container/certs/` for the gateway bind-mount.

### Repeatable upgrade

Re-run the deploy script after `git pull` to rebuild the Docker image and refresh static assets (findings-first Overview, Search/Compare, waterfall, retry chains, HTTP/2 polledData merge, Sessions ID/host/path filter). Omit `--no-build` unless you only changed nginx/TLS config.

```bash
./deploy/container/deploy.sh --domain netlog.example.com --self-signed
# config-only refresh (keeps existing image/www):
./deploy/container/deploy.sh --domain netlog.example.com --self-signed --no-build
```

`.env.production` is created once from the example and preserved (DOMAIN/PUBLIC_URL updated in place).

### Script flags / services

| Flag | Meaning |
|------|---------|
| `--domain` | Required |
| `--no-tls` / `--self-signed` / `--certbot` | Same semantics as VM |
| `--force-self-signed` / `--force-certbot` / `--email` | Rotate / LE |
| `--no-build` | `compose up -d` without `--build` |
| `--http-port` / `--https-port` | Host publish ports |

| Service | Role |
|---------|------|
| `app` | Multi-stage image: build SPA, serve on `:8080` (internal) |
| `gateway` | nginx FrontendGateway on host `80`/`443` |

### Volumes and certificates

| Path / volume | Role |
|---------------|------|
| `deploy/container/certs/` | Active gateway `fullchain.pem` / `privkey.pem` + `.tls-source` |
| `deploy/container/nginx/active.conf` | Rendered from HTTP or HTTPS template |
| Compose volume `certbot_www` | ACME webroot |
| Compose volume `netlog_letsencrypt` | Certbot state (container path) |

### What this deploy will NOT touch

- Host `/etc/nginx/nginx.conf` or `sites-enabled`
- Unrelated Docker Compose projects
- Other host processes bound to different ports

---

## HTTPS and certificates

Both VM and container scripts always expose:

- `--no-tls`
- `--self-signed` / `--force-self-signed`
- `--certbot` / `--force-certbot` / `--email`

### Reuse within the same mode

| Marker | Location |
|--------|----------|
| `.tls-source` = `self-signed` \| `letsencrypt` | VM: `/etc/nginx/ssl/netlog/` · Container: `deploy/container/certs/` |

Same-mode re-run **reuses** existing certs unless `--force-*`.

### Switching modes (gateway certs are replaced)

| Prior | Next | Result |
|-------|------|--------|
| Self-signed | `--certbot` | On success, gateway uses Let's Encrypt |
| Let's Encrypt | `--self-signed` | New openssl PEMs replace active gateway files (LE files left unused on disk) |
| Any | `--no-tls` | HTTP-only config; no new cert writes |

Self-signed material is **never** written into `/etc/letsencrypt/live/`.

### Upgrade from `--no-tls`

```bash
# VM
sudo ./deploy/vm/deploy.sh --domain netlog.example.com --self-signed
# or
sudo ./deploy/vm/deploy.sh --domain netlog.example.com --certbot --email you@example.com

# Container
./deploy/container/deploy.sh --domain netlog.example.com --self-signed
# or
./deploy/container/deploy.sh --domain netlog.example.com --certbot --email you@example.com
```

---

## Operations

### VM

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo tail -f /var/log/nginx/netlog.access.log /var/log/nginx/netlog.error.log
ls -la /etc/nginx/ssl/netlog/ /var/backups/netlog/
```

Rollback site config: copy the latest file from `/var/backups/netlog/` back to `sites-available/netlog.conf`, then `nginx -t && systemctl reload nginx`.

### Container

```bash
docker compose -f deploy/container/docker-compose.yml --project-name netlog ps
docker compose -f deploy/container/docker-compose.yml --project-name netlog logs -f gateway app
docker compose -f deploy/container/docker-compose.yml --project-name netlog down   # stops this project only
```

### Smoke validation

```bash
./deploy/validate.sh --base http://netlog.example.com
./deploy/validate.sh --base https://netlog.example.com --insecure   # self-signed
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `nginx -t` fails on VM | Bad template / missing SSL files | Script restores last backup under `/var/backups/netlog/`; fix mode and re-run |
| Certbot fails | DNS not pointing here, port 80 blocked | Fix DNS/firewall; retry `--force-certbot`; interim `--self-signed` |
| Container 404 / connection refused | Stack not up or wrong port | `compose ps`; check `--http-port` / `--https-port` |
| Browser warns on HTTPS | Self-signed expected | Use `--insecure` for curl or switch to `--certbot` |
| Port already in use | Another host service on 80/443 | Change container ports or free VM ports; do not wipe other nginx sites |
| Wrong site after deploy | `server_name` mismatch | Confirm `--domain` matches the Host header |

---

## Security notes

- Prefer **Strip private information** when capturing netlogs; the app runs client-side only.
- Preserve `.env.production` across sync/re-deploys (no secrets required for the static SPA today).
- Restrict firewall to 80/443; do not expose Node build tooling on the public internet.
- Certbot uses webroot only — safer coexistence than `certbot --nginx`.
- Container gateway is the only published surface; `app` stays on the internal Compose network.

---

## Coexistence checklist

- [x] VM writes only `netlog` site + `/opt/netlog` + `/etc/nginx/ssl/netlog`
- [x] VM never deletes unrelated `sites-enabled/*`
- [x] Container never edits host nginx
- [x] Same-mode re-run reuses certificates
- [x] `--no-tls` creates no certificates (container) / no SSL server block (VM)
- [x] Both `--self-signed` and `--certbot` available on VM and container

# Deploy

Separate **VM** and **Container** deployment scripts with nginx as the FrontendGateway.

**Full documentation:** [DEPLOYMENT.md](../DEPLOYMENT.md)

| Path | Entry |
|------|--------|
| VM | `sudo ./deploy/vm/deploy.sh --domain … --no-tls\|--self-signed\|--certbot` |
| Container | `./deploy/container/deploy.sh --domain … --no-tls\|--self-signed\|--certbot` |
| Smoke | `./deploy/validate.sh --base http://…` or `https://… --insecure` |

Quick verify (no certificates):

```bash
sudo ./deploy/vm/deploy.sh --domain netlog.example.com --no-tls
./deploy/container/deploy.sh --domain netlog.example.com --no-tls
```

**Upgrade after app changes:** re-run the deploy script (omit `--no-build` on container) so `npm run build` ships the latest UI — Overview findings-first layout, Search/Compare, URL waterfall & retry chains (brush-aware), session detail tools, Findings filters, actionable **Errors only**. TLS certs and `.env.production` are preserved on re-run.

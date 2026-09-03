#!/usr/bin/env bash
# Netlog Lens — Container deploy (Compose app + nginx gateway)
# Does NOT edit host /etc/nginx — only Docker networks/ports.
#
# Re-run after git pull to rebuild the app image (Overview layout, Search/Compare, waterfall,
# retry chains, HTTP/2 polledData merge, Sessions ID/host/path filter, session tools;
# certs/env preserved). Use --no-build for gateway-only refresh.
set -euo pipefail

APP_NAME="netlog"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERT_DIR="${SCRIPT_DIR}/certs"
TLS_SOURCE_FILE="${CERT_DIR}/.tls-source"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
ACTIVE_CONF="${SCRIPT_DIR}/nginx/active.conf"
ENV_FILE="${SCRIPT_DIR}/.env.production"

DOMAIN=""
EMAIL=""
NO_TLS=0
SELF_SIGNED=0
FORCE_SELF_SIGNED=0
USE_CERTBOT=0
FORCE_CERTBOT=0
NO_BUILD=0
HTTP_PORT="${HTTP_PORT:-80}"
HTTPS_PORT="${HTTPS_PORT:-443}"

usage() {
  cat <<'EOF'
Usage: ./deploy/container/deploy.sh --domain <host> [TLS mode] [options]

TLS mode (pick one):
  --no-tls                 HTTP-only gateway on :80 (verify before certificates)
  --self-signed            HTTPS with openssl PEMs in deploy/container/certs/
  --force-self-signed      Recreate self-signed even if present
  --certbot                HTTPS via Let's Encrypt (certbot in Docker, webroot)
  --force-certbot          Force renew / re-issue Let's Encrypt
  --email <addr>           Required with --certbot / --force-certbot
  --skip-certbot           Alias for --self-signed

Options:
  --no-build               docker compose up without --build
  --http-port <n>          Host HTTP port (default 80)
  --https-port <n>         Host HTTPS port (default 443)
  -h, --help

Examples:
  ./deploy/container/deploy.sh --domain netlog.example.com --no-tls
  ./deploy/container/deploy.sh --domain netlog.example.com --self-signed
  ./deploy/container/deploy.sh --domain netlog.example.com --certbot --email you@example.com
EOF
}

log() { printf '[%s-container] %s\n' "${APP_NAME}" "$*"; }
die() { printf '[%s-container] ERROR: %s\n' "${APP_NAME}" "$*" >&2; exit 1; }

compose() {
  HTTP_PORT="${HTTP_PORT}" HTTPS_PORT="${HTTPS_PORT}" \
    docker compose -f "${COMPOSE_FILE}" --project-name "${APP_NAME}" "$@"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --domain) DOMAIN="${2:-}"; shift 2 ;;
      --email) EMAIL="${2:-}"; shift 2 ;;
      --no-tls) NO_TLS=1; shift ;;
      --self-signed|--skip-certbot) SELF_SIGNED=1; shift ;;
      --force-self-signed) SELF_SIGNED=1; FORCE_SELF_SIGNED=1; shift ;;
      --certbot) USE_CERTBOT=1; shift ;;
      --force-certbot) USE_CERTBOT=1; FORCE_CERTBOT=1; shift ;;
      --no-build) NO_BUILD=1; shift ;;
      --http-port) HTTP_PORT="${2:-}"; shift 2 ;;
      --https-port) HTTPS_PORT="${2:-}"; shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown argument: $1" ;;
    esac
  done

  [[ -n "${DOMAIN}" ]] || die "--domain is required"
  local modes=$((NO_TLS + SELF_SIGNED + USE_CERTBOT))
  [[ "${modes}" -eq 1 ]] || die "Pick exactly one of --no-tls | --self-signed | --certbot"
  if [[ "${USE_CERTBOT}" -eq 1 && -z "${EMAIL}" ]]; then
    die "--email is required with --certbot / --force-certbot"
  fi
  command -v docker >/dev/null || die "docker not found"
  docker compose version >/dev/null 2>&1 || die "docker compose not found"
}

write_tls_source() { mkdir -p "${CERT_DIR}"; echo "$1" > "${TLS_SOURCE_FILE}"; }
current_tls_source() {
  if [[ -f "${TLS_SOURCE_FILE}" ]]; then cat "${TLS_SOURCE_FILE}"; else echo ""; fi
}

ensure_env() {
  if [[ ! -f "${ENV_FILE}" ]]; then
    cp "${SCRIPT_DIR}/env.production.example" "${ENV_FILE}"
    log "Created ${ENV_FILE} from example (preserved on later runs)"
  fi
  # Update DOMAIN/PUBLIC_URL without wiping other keys
  local public
  if [[ "${NO_TLS}" -eq 1 ]]; then
    public="http://${DOMAIN}"
  else
    public="https://${DOMAIN}"
  fi
  if grep -q '^DOMAIN=' "${ENV_FILE}" 2>/dev/null; then
    sed -i.bak "s|^DOMAIN=.*|DOMAIN=${DOMAIN}|" "${ENV_FILE}" && rm -f "${ENV_FILE}.bak"
  else
    echo "DOMAIN=${DOMAIN}" >> "${ENV_FILE}"
  fi
  if grep -q '^PUBLIC_URL=' "${ENV_FILE}" 2>/dev/null; then
    sed -i.bak "s|^PUBLIC_URL=.*|PUBLIC_URL=${public}|" "${ENV_FILE}" && rm -f "${ENV_FILE}.bak"
  else
    echo "PUBLIC_URL=${public}" >> "${ENV_FILE}"
  fi
}

render_gateway_conf() {
  local mode="$1" # http | https
  local src
  if [[ "${mode}" == "http" ]]; then
    src="${SCRIPT_DIR}/nginx/default-http.conf.template"
  else
    src="${SCRIPT_DIR}/nginx/default-https.conf.template"
  fi
  sed -e "s|__DOMAIN__|${DOMAIN}|g" "${src}" > "${ACTIVE_CONF}"
  log "Rendered gateway config (${mode}) → nginx/active.conf"
}

ensure_self_signed() {
  mkdir -p "${CERT_DIR}"
  local cur
  cur="$(current_tls_source)"
  if [[ "${FORCE_SELF_SIGNED}" -ne 1 && "${cur}" == "self-signed" \
      && -f "${CERT_DIR}/fullchain.pem" && -f "${CERT_DIR}/privkey.pem" ]]; then
    log "Reusing existing self-signed certificates in ${CERT_DIR}"
    return 0
  fi
  log "Creating self-signed certificate for ${DOMAIN}"
  rm -f "${CERT_DIR}/fullchain.pem" "${CERT_DIR}/privkey.pem"
  if ! openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
      -keyout "${CERT_DIR}/privkey.pem" \
      -out "${CERT_DIR}/fullchain.pem" \
      -subj "/CN=${DOMAIN}" \
      -addext "subjectAltName=DNS:${DOMAIN}" 2>/dev/null; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
      -keyout "${CERT_DIR}/privkey.pem" \
      -out "${CERT_DIR}/fullchain.pem" \
      -subj "/CN=${DOMAIN}"
  fi
  write_tls_source self-signed
}

ensure_placeholder_certs() {
  # nginx -t / start needs PEMs present even briefly before certbot copies LE
  mkdir -p "${CERT_DIR}"
  if [[ ! -f "${CERT_DIR}/fullchain.pem" || ! -f "${CERT_DIR}/privkey.pem" ]]; then
    FORCE_SELF_SIGNED=1
    ensure_self_signed
  fi
}

ensure_certbot() {
  mkdir -p "${CERT_DIR}"
  local cur
  cur="$(current_tls_source)"
  if [[ "${FORCE_CERTBOT}" -ne 1 && "${cur}" == "letsencrypt" \
      && -f "${CERT_DIR}/fullchain.pem" && -f "${CERT_DIR}/privkey.pem" ]]; then
    log "Reusing Let's Encrypt material already in ${CERT_DIR}"
    return 0
  fi

  render_gateway_conf http
  up_stack

  local renew_flag=()
  if [[ "${FORCE_CERTBOT}" -eq 1 ]]; then
    renew_flag=(--force-renewal)
  fi

  log "Running certbot (Docker) webroot for ${DOMAIN}"
  # Share ACME webroot with gateway; write live certs into a named volume then copy out
  if ! docker run --rm \
      --network "${APP_NAME}_public" \
      -v "${APP_NAME}_certbot_www:/var/www/certbot" \
      -v "${CERT_DIR}:/etc/letsencrypt/out" \
      -v "${APP_NAME}_letsencrypt:/etc/letsencrypt" \
      certbot/certbot:v2.11.0 certonly --webroot \
      -w /var/www/certbot -d "${DOMAIN}" \
      --non-interactive --agree-tos --email "${EMAIL}" \
      "${renew_flag[@]+"${renew_flag[@]}"}"; then
    log "Certbot failed — falling back to self-signed. Retry with --force-certbot --email …"
    FORCE_SELF_SIGNED=1
    ensure_self_signed
    return 0
  fi

  # Copy LE PEMs into gateway cert dir (replace self-signed / prior)
  docker run --rm \
    -v "${APP_NAME}_letsencrypt:/etc/letsencrypt:ro" \
    -v "${CERT_DIR}:/out" \
    alpine:3.20 \
    sh -c "cp -L /etc/letsencrypt/live/${DOMAIN}/fullchain.pem /out/fullchain.pem && cp -L /etc/letsencrypt/live/${DOMAIN}/privkey.pem /out/privkey.pem && chmod 644 /out/fullchain.pem /out/privkey.pem"
  write_tls_source letsencrypt
  log "Installed Let's Encrypt PEMs into ${CERT_DIR}"
}

up_stack() {
  local build_args=()
  if [[ "${NO_BUILD}" -eq 0 ]]; then
    build_args=(--build)
  fi
  compose up -d "${build_args[@]}"
  log "Compose stack up (project=${APP_NAME})"
}

smoke_test() {
  local scheme port
  if [[ "${NO_TLS}" -eq 1 ]]; then
    scheme="http"
    port="${HTTP_PORT}"
  else
    scheme="https"
    port="${HTTPS_PORT}"
  fi
  local url="${scheme}://127.0.0.1:${port}/"
  local curl_opts=(-fsS -o /dev/null -w "%{http_code}" -H "Host: ${DOMAIN}")
  if [[ "${NO_TLS}" -eq 0 ]]; then
    curl_opts+=(-k)
  fi
  sleep 2
  local code
  code="$(curl "${curl_opts[@]}" "${url}" || echo "000")"
  if [[ "${code}" != "200" && "${code}" != "301" && "${code}" != "302" ]]; then
    log "WARN: smoke HTTP ${code} for ${url}"
  else
    log "Smoke OK (${code}) → ${url} (Host: ${DOMAIN})"
  fi
}

print_summary() {
  local mode public
  if [[ "${NO_TLS}" -eq 1 ]]; then
    mode="no-tls"
    public="http://${DOMAIN}:${HTTP_PORT}"
  elif [[ "${USE_CERTBOT}" -eq 1 ]]; then
    mode="certbot ($(current_tls_source))"
    public="https://${DOMAIN}:${HTTPS_PORT}"
  else
    mode="self-signed ($(current_tls_source))"
    public="https://${DOMAIN}:${HTTPS_PORT}"
  fi
  cat <<EOF

=== ${APP_NAME} container deploy complete ===
Domain:     ${DOMAIN}
Mode:       ${mode}
Public URL: ${public}
Compose:    ${COMPOSE_FILE} (project ${APP_NAME})
Certs:      ${CERT_DIR}
Gateway:    nginx/active.conf

Does NOT modify host nginx (/etc/nginx). Only Docker ports ${HTTP_PORT}/tcp and ${HTTPS_PORT}/tcp.

Re-run safely: same command (certs reused unless --force-*). Use --no-build for config-only refresh.
EOF
}

main() {
  parse_args "$@"
  ensure_env
  mkdir -p "${CERT_DIR}" "${SCRIPT_DIR}/nginx"

  if [[ "${NO_TLS}" -eq 1 ]]; then
    # HTTP-only: do not create or require TLS material
    mkdir -p "${CERT_DIR}"
    render_gateway_conf http
    up_stack
  elif [[ "${SELF_SIGNED}" -eq 1 ]]; then
    ensure_self_signed
    render_gateway_conf https
    up_stack
  else
    ensure_placeholder_certs
    ensure_certbot
    render_gateway_conf https
    up_stack
  fi

  smoke_test
  print_summary
}

main "$@"

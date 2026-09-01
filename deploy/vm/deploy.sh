#!/usr/bin/env bash
# Netlog Lens — VM deploy (host nginx FrontendGateway + static site)
# Owns only: /opt/netlog, sites-available/netlog.conf, /etc/nginx/ssl/netlog/
#
# Re-run after git pull to rebuild /opt/netlog/www. Ships: Overview (findings→URLs→timeline→
# waterfall→retry chains), Search/Compare, session detail tools, Errors only, Sessions filters.
# Certs reused. Use --skip-build for nginx/TLS-only refresh.
set -euo pipefail

APP_NAME="netlog"
APP_DIR="/opt/${APP_NAME}"
WWW_DIR="${APP_DIR}/www"
SSL_DIR="/etc/nginx/ssl/${APP_NAME}"
BACKUP_DIR="/var/backups/${APP_NAME}"
NGINX_AVAILABLE="/etc/nginx/sites-available/${APP_NAME}.conf"
NGINX_ENABLED="/etc/nginx/sites-enabled/${APP_NAME}.conf"
CERTBOT_WEBROOT="/var/www/certbot"
TLS_SOURCE_FILE="${SSL_DIR}/.tls-source"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
NGINX_TEMPLATE_DIR="${SCRIPT_DIR}/nginx"

DOMAIN=""
EMAIL=""
NO_TLS=0
SELF_SIGNED=0
FORCE_SELF_SIGNED=0
USE_CERTBOT=0
FORCE_CERTBOT=0
SKIP_BUILD=0
REMOVE_DEFAULT_SITE=0

usage() {
  cat <<'EOF'
Usage: sudo ./deploy/vm/deploy.sh --domain <host> [TLS mode] [options]

TLS mode (pick one):
  --no-tls                 HTTP-only on :80 (verify before certificates)
  --self-signed            HTTPS with openssl PEMs under /etc/nginx/ssl/netlog/
  --force-self-signed      Recreate self-signed even if present
  --certbot                HTTPS via Let's Encrypt (certbot webroot)
  --force-certbot          Force renew / re-issue Let's Encrypt
  --email <addr>           Required with --certbot / --force-certbot
  --skip-certbot           Alias for --self-signed

Options:
  --skip-build             Reuse existing /opt/netlog/www (no npm build)
  --remove-default-site    Disable only sites-enabled/default if present
  -h, --help               Show this help

Examples:
  sudo ./deploy/vm/deploy.sh --domain netlog.example.com --no-tls
  sudo ./deploy/vm/deploy.sh --domain netlog.example.com --self-signed
  sudo ./deploy/vm/deploy.sh --domain netlog.example.com --certbot --email you@example.com
EOF
}

log() { printf '[%s] %s\n' "${APP_NAME}" "$*"; }
die() { printf '[%s] ERROR: %s\n' "${APP_NAME}" "$*" >&2; exit 1; }

require_root() {
  [[ "${EUID}" -eq 0 ]] || die "Run as root (sudo)."
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
      --skip-build) SKIP_BUILD=1; shift ;;
      --remove-default-site) REMOVE_DEFAULT_SITE=1; shift ;;
      -h|--help) usage; exit 0 ;;
      *) die "Unknown argument: $1" ;;
    esac
  done

  [[ -n "${DOMAIN}" ]] || die "--domain is required"
  local modes=$((NO_TLS + SELF_SIGNED + USE_CERTBOT))
  if [[ "${modes}" -eq 0 ]]; then
    die "Pick one TLS mode: --no-tls | --self-signed | --certbot"
  fi
  if [[ "${modes}" -gt 1 ]]; then
    die "Use only one of --no-tls, --self-signed, --certbot"
  fi
  if [[ "${USE_CERTBOT}" -eq 1 && -z "${EMAIL}" ]]; then
    die "--email is required with --certbot / --force-certbot"
  fi
}

write_tls_source() { mkdir -p "${SSL_DIR}"; echo "$1" > "${TLS_SOURCE_FILE}"; }
current_tls_source() {
  if [[ -f "${TLS_SOURCE_FILE}" ]]; then cat "${TLS_SOURCE_FILE}"; else echo ""; fi
}

ensure_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq nginx openssl curl ca-certificates rsync
    if [[ "${USE_CERTBOT}" -eq 1 ]]; then
      apt-get install -y -qq certbot
    fi
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y nginx openssl curl ca-certificates rsync
    if [[ "${USE_CERTBOT}" -eq 1 ]]; then
      dnf install -y certbot
    fi
  else
    log "WARN: install nginx/openssl/rsync/(certbot) manually if missing"
  fi
  command -v nginx >/dev/null || die "nginx not found"
  command -v openssl >/dev/null || die "openssl not found"
  command -v rsync >/dev/null || die "rsync not found"
}

ensure_node() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return 0
  fi
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y -qq nodejs
  else
    die "Node.js 22+ required for build (or pass --skip-build with prebuilt www)"
  fi
}

backup_owned_nginx() {
  mkdir -p "${BACKUP_DIR}"
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  if [[ -f "${NGINX_AVAILABLE}" ]]; then
    cp -a "${NGINX_AVAILABLE}" "${BACKUP_DIR}/${APP_NAME}.conf.${stamp}"
    log "Backed up nginx site → ${BACKUP_DIR}/${APP_NAME}.conf.${stamp}"
  fi
}

restore_last_nginx_backup() {
  local latest
  latest="$(ls -1t "${BACKUP_DIR}/${APP_NAME}.conf."* 2>/dev/null | head -n1 || true)"
  if [[ -n "${latest}" ]]; then
    cp -a "${latest}" "${NGINX_AVAILABLE}"
    log "Restored nginx site from ${latest}"
  fi
}

sync_app() {
  mkdir -p "${APP_DIR}" "${WWW_DIR}" "${CERTBOT_WEBROOT}"
  if [[ -f "${SCRIPT_DIR}/env.production.example" && ! -f "${APP_DIR}/.env.production" ]]; then
    cp "${SCRIPT_DIR}/env.production.example" "${APP_DIR}/.env.production"
  fi

  if [[ "${SKIP_BUILD}" -eq 1 ]]; then
    [[ -f "${WWW_DIR}/index.html" ]] || die "${WWW_DIR}/index.html missing; build first or omit --skip-build"
    log "Skipping build; using existing ${WWW_DIR}"
    return 0
  fi

  ensure_node
  log "Building static assets from ${REPO_ROOT}"
  (
    cd "${REPO_ROOT}"
    if [[ -f package-lock.json ]]; then
      npm ci
    else
      npm install
    fi
    npm run build
  )
  rsync -a --delete "${REPO_ROOT}/dist/" "${WWW_DIR}/"
  log "Published assets to ${WWW_DIR}"
}

ensure_self_signed() {
  mkdir -p "${SSL_DIR}"
  local cur
  cur="$(current_tls_source)"
  if [[ "${FORCE_SELF_SIGNED}" -ne 1 && "${cur}" == "self-signed" \
      && -f "${SSL_DIR}/fullchain.pem" && -f "${SSL_DIR}/privkey.pem" ]]; then
    log "Reusing existing self-signed certificates in ${SSL_DIR}"
    return 0
  fi
  log "Creating self-signed certificate for ${DOMAIN}"
  rm -f "${SSL_DIR}/fullchain.pem" "${SSL_DIR}/privkey.pem"
  if ! openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
      -keyout "${SSL_DIR}/privkey.pem" \
      -out "${SSL_DIR}/fullchain.pem" \
      -subj "/CN=${DOMAIN}" \
      -addext "subjectAltName=DNS:${DOMAIN}" 2>/dev/null; then
    openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
      -keyout "${SSL_DIR}/privkey.pem" \
      -out "${SSL_DIR}/fullchain.pem" \
      -subj "/CN=${DOMAIN}"
  fi
  chmod 640 "${SSL_DIR}/privkey.pem" || true
  write_tls_source self-signed
}

ensure_certbot() {
  mkdir -p "${SSL_DIR}" "${CERTBOT_WEBROOT}"
  local le_dir="/etc/letsencrypt/live/${DOMAIN}"
  local cur
  cur="$(current_tls_source)"

  if [[ "${FORCE_CERTBOT}" -ne 1 && "${cur}" == "letsencrypt" \
      && -f "${le_dir}/fullchain.pem" && -f "${le_dir}/privkey.pem" ]]; then
    log "Reusing Let's Encrypt certificate; refreshing symlinks"
    ln -sfn "${le_dir}/fullchain.pem" "${SSL_DIR}/fullchain.pem"
    ln -sfn "${le_dir}/privkey.pem" "${SSL_DIR}/privkey.pem"
    write_tls_source letsencrypt
    return 0
  fi

  local certbot_args=(certonly --webroot -w "${CERTBOT_WEBROOT}" -d "${DOMAIN}"
    --non-interactive --agree-tos --email "${EMAIL}")
  if [[ "${FORCE_CERTBOT}" -eq 1 ]]; then
    certbot_args+=(--force-renewal)
  else
    certbot_args+=(--keep-until-expiring)
  fi

  log "Requesting Let's Encrypt certificate (webroot) for ${DOMAIN}"
  if ! certbot "${certbot_args[@]}"; then
    log "Certbot failed — falling back to self-signed. Retry later with --force-certbot --email …"
    FORCE_SELF_SIGNED=1
    ensure_self_signed
    return 0
  fi

  rm -f "${SSL_DIR}/fullchain.pem" "${SSL_DIR}/privkey.pem"
  ln -sfn "${le_dir}/fullchain.pem" "${SSL_DIR}/fullchain.pem"
  ln -sfn "${le_dir}/privkey.pem" "${SSL_DIR}/privkey.pem"
  write_tls_source letsencrypt
  log "Installed Let's Encrypt certs via symlinks in ${SSL_DIR}"
}

render_template() {
  local src="$1"
  local dest="$2"
  sed \
    -e "s|__DOMAIN__|${DOMAIN}|g" \
    -e "s|__WWW_DIR__|${WWW_DIR}|g" \
    -e "s|__SSL_DIR__|${SSL_DIR}|g" \
    -e "s|__CERTBOT_WEBROOT__|${CERTBOT_WEBROOT}|g" \
    -e "s|__APP_NAME__|${APP_NAME}|g" \
    "${src}" > "${dest}"
}

install_nginx_site() {
  local mode="$1" # http | https
  backup_owned_nginx
  mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

  if [[ "${mode}" == "http" ]]; then
    render_template "${NGINX_TEMPLATE_DIR}/netlog-http.conf.template" "${NGINX_AVAILABLE}"
  else
    render_template "${NGINX_TEMPLATE_DIR}/netlog-https.conf.template" "${NGINX_AVAILABLE}"
  fi

  ln -sfn "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"

  if [[ "${REMOVE_DEFAULT_SITE}" -eq 1 ]]; then
    if [[ -L /etc/nginx/sites-enabled/default || -f /etc/nginx/sites-enabled/default ]]; then
      rm -f /etc/nginx/sites-enabled/default
      log "Removed sites-enabled/default only"
    fi
  fi
}

nginx_test_reload() {
  if ! nginx -t; then
    log "nginx -t failed; restoring previous site config if available"
    restore_last_nginx_backup
    nginx -t || die "nginx still invalid after restore"
    die "Deploy aborted after nginx -t failure"
  fi
  systemctl enable nginx >/dev/null 2>&1 || true
  systemctl reload nginx || systemctl restart nginx
  log "nginx reloaded"
}

smoke_test() {
  local scheme
  if [[ "${NO_TLS}" -eq 1 ]]; then
    scheme="http"
  else
    scheme="https"
  fi
  local curl_opts=(-fsS -o /dev/null -w "%{http_code}"
    --resolve "${DOMAIN}:80:127.0.0.1"
    --resolve "${DOMAIN}:443:127.0.0.1"
    -H "Host: ${DOMAIN}")
  if [[ "${NO_TLS}" -eq 0 ]]; then
    curl_opts+=(-k)
  fi
  local code
  code="$(curl "${curl_opts[@]}" "${scheme}://${DOMAIN}/" || echo "000")"
  if [[ "${code}" != "200" && "${code}" != "301" && "${code}" != "302" ]]; then
    log "WARN: smoke HTTP ${code} for ${scheme}://${DOMAIN}/"
  else
    log "Smoke OK (${code}) → ${scheme}://${DOMAIN}/"
  fi
}

print_summary() {
  local mode public
  if [[ "${NO_TLS}" -eq 1 ]]; then
    mode="no-tls"
    public="http://${DOMAIN}"
  elif [[ "${USE_CERTBOT}" -eq 1 ]]; then
    mode="certbot ($(current_tls_source))"
    public="https://${DOMAIN}"
  else
    mode="self-signed ($(current_tls_source))"
    public="https://${DOMAIN}"
  fi
  cat <<EOF

=== ${APP_NAME} VM deploy complete ===
Domain:     ${DOMAIN}
Mode:       ${mode}
Public URL: ${public}
App root:   ${WWW_DIR}
nginx site: ${NGINX_AVAILABLE} → ${NGINX_ENABLED}
SSL dir:    ${SSL_DIR} (unused in --no-tls)

Owned only by this deploy (safe to re-run):
  - ${APP_DIR}
  - ${NGINX_AVAILABLE} / ${NGINX_ENABLED}
  - ${SSL_DIR}
  - ${BACKUP_DIR}

Does NOT touch other sites-enabled entries (except optional default with --remove-default-site).

Upgrade / re-run: re-execute the same command (certs reused unless --force-*).
EOF
}

main() {
  require_root
  parse_args "$@"
  ensure_packages
  sync_app

  if [[ "${NO_TLS}" -eq 1 ]]; then
    install_nginx_site http
    nginx_test_reload
  elif [[ "${SELF_SIGNED}" -eq 1 ]]; then
    ensure_self_signed
    install_nginx_site https
    nginx_test_reload
  else
    install_nginx_site http
    nginx_test_reload
    ensure_certbot
    install_nginx_site https
    nginx_test_reload
  fi

  smoke_test
  print_summary
}

main "$@"

#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# dnsmasq-ha agent installer.
#
# One-command setup for a cluster node (Ubuntu Server, systemd):
#
#   curl -fsSL https://raw.githubusercontent.com/taiojia/dnsmasq-ha/master/scripts/install-agent.sh | bash
#
# Arguments (when piping, pass them via `bash -s --`, e.g.):
#   curl -fsSL <url> | bash -s -- --port 9000 --token mysecret
#
# Flags:
#   --token <tok>   Agent API token (generated on first install if omitted)
#   --port <port>   Agent listen port (default 8080)
#   --dir <path>    Install directory (default /opt/dnsmasq-ha)
#   --ref <ref>     Branch or tag to install (default master)
#   --uninstall     Stop and remove the service and env file
#   --purge         With --uninstall: also delete the install directory
#   --help          Show this help
#
# The script is idempotent: re-running it upgrades the deployment in place
# and preserves the existing token. Everything privileged runs via sudo.
# -----------------------------------------------------------------------------
set -euo pipefail

REPO_URL="https://github.com/taiojia/dnsmasq-ha.git"
INSTALL_DIR="/opt/dnsmasq-ha"
REF="master"
PORT="8080"
TOKEN=""
SERVICE="dnsmasq-ha-agent"
ENV_DIR="/etc/dnsmasq-ha"
ENV_FILE="${ENV_DIR}/agent.env"
UNIT_FILE="/etc/systemd/system/${SERVICE}.service"
UNINSTALL=0
PURGE=0
NODE_MAJOR=18
NODESOURCE_SETUP="https://deb.nodesource.com/setup_20.x"

log()  { printf '\033[1;34m[install-agent]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[install-agent]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[install-agent]\033[0m %s\n' "$*" >&2; exit 1; }

usage() { sed -n '2,/^# -----------------------------------------------------------------------------$/p' "$0"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --token)    TOKEN="${2:?--token requires a value}"; shift 2 ;;
    --port)     PORT="${2:?--port requires a value}"; shift 2 ;;
    --dir)      INSTALL_DIR="${2:?--dir requires a value}"; shift 2 ;;
    --ref)      REF="${2:?--ref requires a value}"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    --purge)    PURGE=1; shift ;;
    --help|-h)  usage; exit 0 ;;
    *)          die "unknown argument: $1 (see --help)" ;;
  esac
done

# Privilege helper: elevate with sudo only when not already root.
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 || die "root privileges required (sudo not found)"
  SUDO="sudo"
fi

# -----------------------------------------------------------------------------
# Uninstall
# -----------------------------------------------------------------------------
if [ "$UNINSTALL" -eq 1 ]; then
  log "stopping and removing ${SERVICE}..."
  $SUDO systemctl disable --now "$SERVICE" >/dev/null 2>&1 || true
  $SUDO rm -f "$UNIT_FILE"
  $SUDO systemctl daemon-reload
  $SUDO rm -f "$ENV_FILE"
  $SUDO rmdir "$ENV_DIR" 2>/dev/null || true
  if [ "$PURGE" -eq 1 ]; then
    log "removing install directory ${INSTALL_DIR}..."
    $SUDO rm -rf "$INSTALL_DIR"
  else
    warn "install directory kept: ${INSTALL_DIR} (re-run with --purge to delete)"
  fi
  log "uninstalled."
  exit 0
fi

# -----------------------------------------------------------------------------
# Preflight
# -----------------------------------------------------------------------------
command -v git >/dev/null 2>&1 || die "git is required (apt-get install -y git)"
command -v systemctl >/dev/null 2>&1 || die "systemd is required (this script targets Ubuntu Server)"
command -v curl >/dev/null 2>&1 || warn "curl not found; NodeSource auto-install will need it"

node_major() {
  command -v node >/dev/null 2>&1 || { echo 0; return; }
  node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0
}

install_node() {
  log "installing Node.js 20.x via NodeSource..."
  if ! command -v curl >/dev/null 2>&1; then
    $SUDO apt-get update
    $SUDO apt-get install -y curl ca-certificates
  fi
  curl -fsSL "$NODESOURCE_SETUP" | ${SUDO:+$SUDO -E} bash -
  $SUDO apt-get install -y nodejs
}

if [ "$(node_major)" -lt "$NODE_MAJOR" ]; then
  install_node
fi
command -v npm >/dev/null 2>&1 || die "npm not found after Node.js installation"
NPM_BIN="$(command -v npm)"
case "$NPM_BIN" in
  /usr/*) ;;  # fine for systemd
  *) warn "npm resolved to ${NPM_BIN} (e.g. nvm install); systemd needs an absolute path that exists for root" ;;
esac

# -----------------------------------------------------------------------------
# Fetch / update the source
# -----------------------------------------------------------------------------
if $SUDO test -d "${INSTALL_DIR}/.git"; then
  log "updating existing checkout at ${INSTALL_DIR} (ref: ${REF})..."
  $SUDO git -C "$INSTALL_DIR" fetch --force origin "$REF"
  $SUDO git -C "$INSTALL_DIR" checkout -f FETCH_HEAD
else
  log "cloning ${REPO_URL} (ref: ${REF}) into ${INSTALL_DIR}..."
  $SUDO rm -rf "$INSTALL_DIR"
  $SUDO git clone --depth 1 --branch "$REF" "$REPO_URL" "$INSTALL_DIR"
fi

log "installing dependencies (npm ci)..."
$SUDO npm ci --no-audit --no-fund --prefix "$INSTALL_DIR"

# -----------------------------------------------------------------------------
# Env file: generate token on first install, preserve on upgrades
# -----------------------------------------------------------------------------
$SUDO install -d -m 700 "$ENV_DIR"
if $SUDO test -f "$ENV_FILE"; then
  if [ -n "$TOKEN" ]; then
    warn "replacing existing token in ${ENV_FILE}"
    printf 'AGENT_TOKEN=%s\nAGENT_PORT=%s\n' "$TOKEN" "$PORT" | $SUDO tee "$ENV_FILE" >/dev/null
  else
    # Keep the existing token; refresh the port only when explicitly provided.
    if ! $SUDO grep -q '^AGENT_TOKEN=' "$ENV_FILE"; then
      die "${ENV_FILE} exists but has no AGENT_TOKEN; re-run with --token"
    fi
    if $SUDO grep -q '^AGENT_PORT=' "$ENV_FILE"; then
      $SUDO sed -i "s/^AGENT_PORT=.*/AGENT_PORT=${PORT}/" "$ENV_FILE"
    else
      printf 'AGENT_PORT=%s\n' "$PORT" | $SUDO tee -a "$ENV_FILE" >/dev/null
    fi
  fi
else
  if [ -z "$TOKEN" ]; then
    TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
  fi
  printf 'AGENT_TOKEN=%s\nAGENT_PORT=%s\n' "$TOKEN" "$PORT" | $SUDO tee "$ENV_FILE" >/dev/null
fi
$SUDO chmod 600 "$ENV_FILE"

# -----------------------------------------------------------------------------
# systemd unit
# -----------------------------------------------------------------------------
log "writing systemd unit ${UNIT_FILE}..."
$SUDO tee "$UNIT_FILE" >/dev/null <<UNIT
[Unit]
Description=dnsmasq-ha agent
Wants=network-online.target
After=network-online.target

[Service]
ExecStart=${NPM_BIN} run start:agent
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${ENV_FILE}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

$SUDO systemctl daemon-reload
log "enabling and starting ${SERVICE}..."
if [ "$($SUDO systemctl is-active "$SERVICE" 2>/dev/null || true)" = "active" ]; then
  $SUDO systemctl restart "$SERVICE"
else
  $SUDO systemctl enable --now "$SERVICE" >/dev/null 2>&1 || true
fi

# Wait for the service to come up (tsx startup takes a moment).
STATE="unknown"
for _ in 1 2 3 4 5; do
  sleep 1
  STATE="$($SUDO systemctl is-active "$SERVICE" 2>/dev/null || true)"
  [ "$STATE" = "active" ] && break
done
[ "$STATE" = "active" ] || die "service failed to start; check: journalctl -u ${SERVICE} -n 50"

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
TOKEN_NOW="$($SUDO grep '^AGENT_TOKEN=' "$ENV_FILE" | cut -d= -f2-)"
NODE_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "$NODE_IP" ] || NODE_IP="<node-ip>"

log "-------------------------------------------"
log "dnsmasq-ha agent is running (${STATE})"
log "  service : ${SERVICE} (port ${PORT})"
log "  url     : http://${NODE_IP}:${PORT}"
log "  token   : ${TOKEN_NOW}"
log "Add a node in the UI with this URL and token."
log "Uninstall anytime: this script --uninstall [--purge]"
log "-------------------------------------------"

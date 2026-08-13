#!/usr/bin/env bash
#
# iLO Dashboard — Proxmox container setup script
#
# Usage:
#   ./setup.sh                 # Fresh install: clone, build, install, run
#   ./setup.sh --update        # Pull latest from GitHub, rebuild, restart
#
# This script is designed to run inside a Proxmox LXC container (Debian/Ubuntu).
# It installs Node.js, clones the iLO Dashboard repo, builds the frontend, and
# runs the site as a systemd service on port 3001.
#
# Requirements:
#   - Debian/Ubuntu based LXC container
#   - Run as root (or with sudo)
#   - Outbound internet access to github.com and nodejs.org

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
REPO_URL="https://github.com/itscolinbrophy/iLO-Dashboard.git"
APP_DIR="/opt/ilo-dashboard"
SERVICE_NAME="ilo-dashboard"
PORT="${PORT:-3001}"
NODE_MAJOR="20"          # Node.js major version to install
UPDATE_MODE=0

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
for arg in "$@"; do
  case "$arg" in
    --update|-u)
      UPDATE_MODE=1
      ;;
    --help|-h)
      echo "Usage: $0 [--update]"
      echo "  --update   Pull latest changes from GitHub, rebuild, and restart."
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [--update]"
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log()  { echo -e "\033[1;34m[iLO]\033[0m $*"; }
warn() { echo -e "\033[1;33m[iLO]\033[0m $*"; }
die()  { echo -e "\033[1;31m[iLO]\033[0m ERROR: $*" >&2; exit 1; }

require_root() {
  if [[ "$(id -u)" -ne 0 ]]; then
    die "This script must be run as root. Try: sudo $0"
  fi
}

# ---------------------------------------------------------------------------
# Update mode: pull latest, rebuild, restart
# ---------------------------------------------------------------------------
do_update() {
  log "Update mode enabled."

  [[ -d "$APP_DIR/.git" ]] || die "No existing install found at $APP_DIR. Run without --update first."

  cd "$APP_DIR"
  log "Pulling latest changes from GitHub..."
  git pull --ff-only origin master || die "git pull failed. Check for local changes."

  log "Installing dependencies..."
  npm ci --omit=dev || npm install

  log "Building frontend..."
  npm run build

  log "Restarting service..."
  systemctl restart "$SERVICE_NAME" || warn "Could not restart service (is it running?)."

  log "Update complete. Service: $SERVICE_NAME"
  exit 0
}

# ---------------------------------------------------------------------------
# Fresh install
# ---------------------------------------------------------------------------
install_tools() {
  log "Ensuring required tools are installed (git, curl, ca-certificates)..."
  apt-get update -y
  apt-get install -y git curl ca-certificates gnupg
  log "Tools ready: $(git --version)"
}

install_node() {
  if command -v node >/dev/null 2>&1 && [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -ge "$NODE_MAJOR" ]]; then
    log "Node.js already installed: $(node -v)"
    return
  fi

  log "Installing Node.js $NODE_MAJOR.x..."
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg
  mkdir -p /etc/apt/keyrings
  curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs
  log "Node.js installed: $(node -v)"
}

clone_repo() {
  if [[ -d "$APP_DIR/.git" ]]; then
    log "Repo already present at $APP_DIR. Pulling latest..."
    cd "$APP_DIR"
    git pull --ff-only origin master || warn "git pull failed; continuing with existing code."
  else
    log "Cloning repository..."
    mkdir -p "$(dirname "$APP_DIR")"
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
  fi
}

build_app() {
  log "Installing dependencies..."
  npm install

  log "Building frontend..."
  npm run build
}

install_service() {
  log "Installing systemd service '$SERVICE_NAME'..."

  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=iLO Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
Environment=PORT=$PORT
ExecStart=/usr/bin/node server/index.mjs
Restart=on-failure
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  require_root

  if [[ "$UPDATE_MODE" -eq 1 ]]; then
    do_update
  fi

  log "Starting iLO Dashboard setup..."
  install_tools
  install_node
  clone_repo
  build_app
  install_service

  local ip
  ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  log "Setup complete!"
  log "Dashboard:  http://${ip:-<container-ip>}:${PORT}"
  log "Service:    systemctl status $SERVICE_NAME"
  log "Logs:       journalctl -u $SERVICE_NAME -f"
  log "Update:     $0 --update"
}

main "$@"

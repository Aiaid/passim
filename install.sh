#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Passim — One-click VPS installer
# Usage:  curl -fsSL https://raw.githubusercontent.com/aiaid/passim/main/install.sh | bash
#    or:  bash install.sh [OPTIONS]
#
# Options:
#   --port PORT         Listen port (default: 8443)
#   --api-key KEY       Pre-set API key (default: auto-generated)
#   --ssl MODE          SSL mode: self-signed | letsencrypt | off (default: letsencrypt)
#   --dns-domain DOMAIN DNS reflector base domain (default: dns.passim.io)
#   --domain DOMAIN     Domain for Let's Encrypt
#   --email EMAIL       Email for Let's Encrypt
#   --data-dir DIR      Host data directory (default: /opt/passim/data)
#   --image TAG         Image tag (default: latest)
#   --dev               Use dev image (latest main build)
#   --skip-docker       Skip Docker installation
#   --uninstall         Remove Passim container and data
# ──────────────────────────────────────────────────────────────
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────
IMAGE="ghcr.io/aiaid/passim"
TAG="latest"
PORT=8443
API_KEY=""
SSL_MODE="letsencrypt"
SSL_DOMAIN=""
SSL_EMAIL=""
DNS_BASE_DOMAIN="dns.passim.io"
DATA_DIR="/opt/passim/data"
CONTAINER_NAME="passim"
SKIP_DOCKER=false
UNINSTALL=false

# ── Colors ────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
fatal() { error "$@"; exit 1; }

# ── Parse args ────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --port)       PORT="$2";       shift 2 ;;
    --api-key)    API_KEY="$2";    shift 2 ;;
    --ssl)        SSL_MODE="$2";       shift 2 ;;
    --domain)     SSL_DOMAIN="$2";     shift 2 ;;
    --email)      SSL_EMAIL="$2";      shift 2 ;;
    --dns-domain) DNS_BASE_DOMAIN="$2"; shift 2 ;;
    --data-dir)   DATA_DIR="$2";   shift 2 ;;
    --image)      TAG="$2";        shift 2 ;;
    --dev)        TAG="dev";       shift ;;
    --skip-docker) SKIP_DOCKER=true; shift ;;
    --uninstall)  UNINSTALL=true;  shift ;;
    -h|--help)
      sed -n '2,/^# ─\{10\}/{ /^# ─\{10\}/d; s/^# \?//; p }' "$0"
      exit 0 ;;
    *) fatal "Unknown option: $1 (use --help)" ;;
  esac
done

# ── Uninstall ─────────────────────────────────────────────────
if $UNINSTALL; then
  info "Stopping and removing Passim..."
  docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
  echo ""
  warn "Container removed. Data at ${DATA_DIR} was NOT deleted."
  warn "To remove data: rm -rf ${DATA_DIR}"
  exit 0
fi

# ── Root check ────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
  fatal "Please run as root:  sudo bash install.sh"
fi

# ── Install Docker ────────────────────────────────────────────
install_docker() {
  if command -v docker &>/dev/null; then
    ok "Docker already installed: $(docker --version)"
    return
  fi

  if $SKIP_DOCKER; then
    fatal "Docker is not installed and --skip-docker was set"
  fi

  info "Installing Docker..."

  # Detect distro
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO="${ID}"
  else
    fatal "Cannot detect OS. Install Docker manually, then re-run with --skip-docker"
  fi

  case "$DISTRO" in
    ubuntu|debian)
      apt-get update -qq
      apt-get install -y -qq ca-certificates curl gnupg
      install -m 0755 -d /etc/apt/keyrings
      curl -fsSL "https://download.docker.com/linux/${DISTRO}/gpg" | \
        gpg --dearmor -o /etc/apt/keyrings/docker.gpg
      chmod a+r /etc/apt/keyrings/docker.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
        https://download.docker.com/linux/${DISTRO} ${VERSION_CODENAME} stable" \
        > /etc/apt/sources.list.d/docker.list
      apt-get update -qq
      apt-get install -y -qq docker-ce docker-ce-cli containerd.io
      ;;
    centos|rhel|rocky|almalinux|ol)
      yum install -y yum-utils
      yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
      yum install -y docker-ce docker-ce-cli containerd.io
      ;;
    fedora)
      dnf install -y dnf-plugins-core
      dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
      dnf install -y docker-ce docker-ce-cli containerd.io
      ;;
    *)
      warn "Unsupported distro: ${DISTRO}. Trying get.docker.com fallback..."
      curl -fsSL https://get.docker.com | sh
      ;;
  esac

  systemctl enable --now docker
  ok "Docker installed: $(docker --version)"
}

# ── Preflight checks ─────────────────────────────────────────
install_docker

# Ensure Docker daemon is running
if ! docker info &>/dev/null; then
  systemctl start docker 2>/dev/null || true
  sleep 2
  docker info &>/dev/null || fatal "Docker daemon is not running"
fi

# ── Prepare data directory ────────────────────────────────────
mkdir -p "$DATA_DIR"
ok "Data directory: ${DATA_DIR}"

# ── Stop existing container if any ────────────────────────────
if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  info "Removing existing container: ${CONTAINER_NAME}"
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi

# ── Pull image ────────────────────────────────────────────────
info "Pulling ${IMAGE}:${TAG} ..."
docker pull "${IMAGE}:${TAG}"
ok "Image ready"

# ── Build docker run command ──────────────────────────────────
DOCKER_ARGS=(
  run -d
  --name "$CONTAINER_NAME"
  --restart unless-stopped
  -p "${PORT}:8443"
  -p "80:80"
  -p "5201:5201"
  -v "${DATA_DIR}:/data"
  -v "/var/run/docker.sock:/var/run/docker.sock"
  -e "PORT=8443"
  -e "SSL_MODE=${SSL_MODE}"
)

[[ -n "$API_KEY" ]]        && DOCKER_ARGS+=(-e "API_KEY=${API_KEY}")
[[ -n "$SSL_DOMAIN" ]]     && DOCKER_ARGS+=(-e "SSL_DOMAIN=${SSL_DOMAIN}")
[[ -n "$SSL_EMAIL" ]]      && DOCKER_ARGS+=(-e "SSL_EMAIL=${SSL_EMAIL}")
[[ -n "$DNS_BASE_DOMAIN" ]] && DOCKER_ARGS+=(-e "DNS_BASE_DOMAIN=${DNS_BASE_DOMAIN}")

DOCKER_ARGS+=("${IMAGE}:${TAG}")

# ── Run ───────────────────────────────────────────────────────
info "Starting Passim..."
CONTAINER_ID=$(docker "${DOCKER_ARGS[@]}")
ok "Container started: ${CONTAINER_ID:0:12}"

# ── Wait for healthy ──────────────────────────────────────────
info "Waiting for Passim to become healthy..."
for i in $(seq 1 30); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "starting")
  if [[ "$STATUS" == "healthy" ]]; then
    break
  fi
  sleep 2
done

if [[ "$STATUS" == "healthy" ]]; then
  ok "Passim is healthy!"
else
  warn "Health check not passing yet (status: ${STATUS}). Container is still starting..."
fi

# ── Detect IP ─────────────────────────────────────────────────
PUBLIC_IP=$(curl -fsSL --max-time 5 https://api.ipify.org 2>/dev/null || \
            curl -fsSL --max-time 5 https://ifconfig.me 2>/dev/null || \
            hostname -I 2>/dev/null | awk '{print $1}' || \
            echo "<your-server-ip>")

# ── Retrieve API key from logs if auto-generated ──────────────
SHOWN_KEY="$API_KEY"
if [[ -z "$API_KEY" ]]; then
  sleep 3
  SHOWN_KEY=$(docker logs "$CONTAINER_NAME" 2>&1 | grep -oP 'API key: \K\S+' | head -1 || echo "")
  if [[ -z "$SHOWN_KEY" ]]; then
    SHOWN_KEY="(check: docker logs passim)"
  fi
fi

# ── Print summary ─────────────────────────────────────────────
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Passim installed successfully!${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""

if [[ "$SSL_MODE" == "off" ]]; then
  PROTO="http"
else
  PROTO="https"
fi

echo -e "  ${CYAN}URL:${NC}      ${PROTO}://${PUBLIC_IP}:${PORT}"
echo -e "  ${CYAN}API Key:${NC}  ${SHOWN_KEY}"
echo -e "  ${CYAN}Data:${NC}     ${DATA_DIR}"
echo ""
echo -e "  ${BOLD}Useful commands:${NC}"
echo -e "    docker logs -f passim        # View logs"
echo -e "    docker restart passim        # Restart"
echo -e "    bash install.sh --uninstall  # Remove"
echo ""

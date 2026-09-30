#!/usr/bin/env bash
# Runs ON the VPS (piped over SSH by the GitHub Actions workflow).
# Pulls the exact SHA-tagged image and redeploys only this project
# (/opt/persona-studio) — other services on the host are untouched.
#
# Required on the VPS:
#   /opt/persona-studio/.env          secrets (POSTGRES_PASSWORD, JWT_SECRET,
#                                     GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
#                                     EXTENSION_REDIRECT_PREFIXES, PUBLIC_BASE_URL, …)
#   /opt/persona-studio/.ghcr-token   (only if images are private) a fine-grained
#                                     PAT with read:packages for ghcr.io
#
# Database/upload data lives in the named volume postgres_data and survives
# every deploy. Migrations run automatically in the container entrypoint
# (`prisma migrate deploy && npm start`) before the API starts.
set -euo pipefail

: "${IMAGE:?IMAGE not set}" "${IMAGE_TAG:?IMAGE_TAG not set}"
DEPLOY_DIR=/opt/persona-studio
cd "$DEPLOY_DIR"
export IMAGE_TAG

# ── Docker prerequisite (idempotent) ─────────────────────────────────────────
# Install Docker Engine + Compose plugin from Docker's official Ubuntu
# repository only when docker is absent; existing services are untouched.
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found — installing from the official Docker apt repository"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME:-noble} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

docker info >/dev/null 2>&1 || { echo "✗ docker daemon is not responding (systemctl status docker)" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "✗ docker compose plugin missing" >&2; exit 1; }

# GHCR is private: read-only login using a token stored on the VPS
if [ -f "$DEPLOY_DIR/.ghcr-token" ]; then
  docker login ghcr.io -u "$(cat "$DEPLOY_DIR/.ghcr-user" 2>/dev/null || echo persona-deploy)" \
    --password-stdin < "$DEPLOY_DIR/.ghcr-token"
fi

COMPOSE="docker compose --project-directory $DEPLOY_DIR -f $DEPLOY_DIR/deploy/compose.production.yaml"

$COMPOSE pull api
$COMPOSE up -d --remove-orphans

# Health check: the API must report healthy within ~60s
for i in $(seq 1 30); do
  if $COMPOSE exec -T api node -e \
    "fetch('http://127.0.0.1:3210/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "✓ deployed $IMAGE_TAG — healthy"
    docker image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 2
done

echo "✗ health check failed for $IMAGE_TAG" >&2
$COMPOSE logs --tail 50 api >&2
exit 1
